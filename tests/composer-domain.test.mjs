import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptBlend,
  addPrimitive,
  createDraft,
  deriveBlendConflicts,
  movePrimitive,
  renderPrompt,
} from "../src/lib/composer.ts";
import {
  ACTIVE_DRAFT_KEY,
  MAX_COMPOSER_ITEMS,
  addPrimitiveToActiveDraft,
  buildShareUrl,
  createExportFile,
  createSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  forkSnapshot,
  parseExportFile,
  readActiveDraft,
  sha256Text,
} from "../src/scripts/composer-store.ts";

const glitch = {
  primitiveId: "primitive.style.glitch-art",
  dimensionId: "style.medium",
  slug: "glitch-art",
  label: "Glitch Art",
  fragment: "Style/medium: Glitch Art.",
  sourcePrompt: "A portrait looking into the camera.",
};

const watercolor = {
  primitiveId: "primitive.style.watercolor",
  dimensionId: "style.medium",
  slug: "watercolor",
  label: "Watercolor",
  fragment: "Style/medium: Watercolor.",
  sourcePrompt: "A portrait looking into the camera.",
};

const subjectRole = {
  primitiveId: "primitive.subject.role",
  dimensionId: "subject.person.role",
  slug: "primitive-subject-role",
  label: "Vai trò",
  fragment: "a craftsperson",
  sourcePrompt: "a craftsperson repairing a ceramic bowl",
};

const shallowDepth = {
  primitiveId: "camera.depth-of-field.shallow",
  dimensionId: "camera.depth-of-field",
  slug: "camera-depth-of-field-shallow",
  label: "Độ sâu trường ảnh nông",
  fragment: "shallow depth of field",
  sourcePrompt: "A portrait looking into the camera.",
};

const deepDepth = {
  primitiveId: "camera.depth-of-field.deep",
  dimensionId: "camera.depth-of-field",
  slug: "camera-depth-of-field-deep",
  label: "Độ sâu trường ảnh sâu",
  fragment: "deep depth of field",
  sourcePrompt: "A portrait looking into the camera.",
};

const portraitRatio = {
  primitiveId: "composition.aspect-ratio.portrait-4-5",
  dimensionId: "composition.aspect-ratio",
  slug: "composition-aspect-ratio-portrait-4-5",
  label: "Dọc 4:5",
  fragment: "portrait 4:5 aspect ratio",
  sourcePrompt: "A portrait looking into the camera.",
};

const productionPrimitiveIdentities = new Map([
  [glitch.primitiveId, { slug: glitch.slug, dimensionId: glitch.dimensionId }],
  [watercolor.primitiveId, { slug: watercolor.slug, dimensionId: watercolor.dimensionId }],
  [shallowDepth.primitiveId, { slug: shallowDepth.slug, dimensionId: shallowDepth.dimensionId }],
  [deepDepth.primitiveId, { slug: deepDepth.slug, dimensionId: deepDepth.dimensionId }],
  [portraitRatio.primitiveId, { slug: portraitRatio.slug, dimensionId: portraitRatio.dimensionId }],
]);

const resignSnapshot = async (snapshot) => {
  const { sha256: _previousChecksum, ...body } = snapshot;
  return { ...snapshot, sha256: await sha256Text(JSON.stringify(body)) };
};

test("recipe preserves explicit order, rejects duplicates and renders deterministically", () => {
  let draft = createDraft("draft-1", "2026-08-12T00:00:00.000Z");
  draft = addPrimitive(draft, glitch, "2026-08-12T00:00:01.000Z").draft;
  draft = addPrimitive(draft, watercolor, "2026-08-12T00:00:02.000Z").draft;

  const duplicate = addPrimitive(draft, glitch, "2026-08-12T00:00:03.000Z");
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.draft.items.length, 2);
  assert.deepEqual(duplicate.draft.items.map((item) => item.primitiveId), [glitch.primitiveId, watercolor.primitiveId]);

  const reordered = movePrimitive(duplicate.draft, watercolor.primitiveId, -1, "2026-08-12T00:00:04.000Z");
  assert.deepEqual(reordered.items.map((item) => item.primitiveId), [watercolor.primitiveId, glitch.primitiveId]);
  assert.equal(renderPrompt(reordered), renderPrompt(structuredClone(reordered)));
  assert.ok(renderPrompt(reordered).indexOf("Watercolor") < renderPrompt(reordered).indexOf("Glitch Art"));

  const conflicts = deriveBlendConflicts(reordered);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].labels, ["Watercolor", "Glitch Art"]);
  assert.equal(deriveBlendConflicts(acceptBlend(reordered, conflicts[0].key, "2026-08-12T00:00:05.000Z")).length, 0);
});

test("taxonomy primitives compose in order without false style blend conflicts", () => {
  let draft = createDraft("draft-primitives", "2026-08-13T00:00:00.000Z");
  draft = addPrimitive(draft, subjectRole).draft;
  draft = addPrimitive(draft, glitch).draft;
  assert.equal(deriveBlendConflicts(draft).length, 0);
  assert.match(renderPrompt(draft), /Prompt recipe \(apply in this order\):/u);
  assert.ok(renderPrompt(draft).indexOf("a craftsperson") < renderPrompt(draft).indexOf("Glitch Art"));
});

test("single-select dimensions reject a second value while style.medium remains blendable", () => {
  let draft = addPrimitive(createDraft("draft-dimension"), shallowDepth).draft;
  const rejected = addPrimitive(draft, deepDepth);

  assert.equal(rejected.added, false);
  assert.equal(rejected.reason, "dimension-conflict");
  assert.equal(rejected.existingIndex, 0);
  assert.deepEqual(rejected.draft.items.map((item) => item.primitiveId), [shallowDepth.primitiveId]);

  draft = addPrimitive(createDraft("draft-style-blend"), glitch).draft;
  const blended = addPrimitive(draft, watercolor);
  assert.equal(blended.added, true);
  assert.equal(blended.draft.items.length, 2);
  assert.equal(deriveBlendConflicts(blended.draft).length, 1);
});

test("selected aspect ratio controls framing and the default framing is ratio-neutral", () => {
  const portraitDraft = addPrimitive(createDraft("draft-portrait"), portraitRatio).draft;
  const portraitPrompt = renderPrompt(portraitDraft);
  assert.match(portraitPrompt, /Composition\/framing: portrait 4:5 aspect ratio/u);
  assert.doesNotMatch(portraitPrompt, /landscape 3:2/u);

  const neutralDraft = addPrimitive(createDraft("draft-neutral"), subjectRole).draft;
  const neutralPrompt = renderPrompt(neutralDraft);
  assert.match(neutralPrompt, /Composition\/framing: clear focal subject/u);
  assert.doesNotMatch(neutralPrompt, /landscape 3:2/u);
});

class FakeStorage {
  values = new Map();
  writes = 0;
  failWrites = false;

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("the add path refuses to persist a recipe beyond MAX_COMPOSER_ITEMS", () => {
  const storage = new FakeStorage();
  for (let index = 0; index < MAX_COMPOSER_ITEMS; index += 1) {
    const result = addPrimitiveToActiveDraft(storage, {
      ...glitch,
      primitiveId: `primitive.style.qa-${index}`,
      slug: `qa-${index}`,
      label: `QA ${index}`,
    }, {
      uuid: () => "bounded-draft",
      now: () => "2026-08-13T00:00:00.000Z",
    });
    assert.equal(result.added, true);
  }

  const rejected = addPrimitiveToActiveDraft(storage, {
    ...glitch,
    primitiveId: "primitive.style.qa-overflow",
    slug: "qa-overflow",
    label: "QA overflow",
  });
  assert.equal(rejected.added, false);
  assert.equal(rejected.reason, "limit");
  assert.equal(readActiveDraft(storage)?.items.length, MAX_COMPOSER_ITEMS);
});

test("share snapshots are immutable and fork without overwriting the active draft", async () => {
  const storage = new FakeStorage();
  const first = addPrimitiveToActiveDraft(storage, glitch, {
    uuid: () => "existing-draft",
    now: () => "2026-08-12T00:00:00.000Z",
  }).draft;
  const existingPointer = storage.getItem(ACTIVE_DRAFT_KEY);
  const snapshot = await createSnapshot(first, "2026-08-12T00:01:00.000Z");
  const payload = encodeSnapshot(snapshot);
  const beforeOpenWrites = storage.writes;
  const opened = await decodeSnapshot(payload, productionPrimitiveIdentities);

  assert.equal(storage.writes, beforeOpenWrites);
  assert.equal(storage.getItem(ACTIVE_DRAFT_KEY), existingPointer);
  assert.equal(renderPrompt({ ...first, items: opened.recipe.items }), renderPrompt(first));
  assert.match(buildShareUrl("https://example.test/composer/", payload).url, /\/composer\/#r=/u);

  const forked = forkSnapshot(storage, opened, {
    uuid: () => "forked-draft",
    now: () => "2026-08-12T00:02:00.000Z",
  });
  assert.equal(forked.draftId, "forked-draft");
  assert.equal(forked.sourceSnapshotHash, snapshot.sha256);
  assert.equal(storage.getItem(ACTIVE_DRAFT_KEY), "forked-draft");
  assert.equal(readActiveDraft(storage)?.draftId, "forked-draft");
  assert.ok(storage.getItem("pa:drafts:v1:existing-draft"));
});

test("failed snapshot fork preserves readable snapshot and the existing active pointer", async () => {
  const storage = new FakeStorage();
  addPrimitiveToActiveDraft(storage, glitch, {
    uuid: () => "existing-draft",
    now: () => "2026-08-12T00:00:00.000Z",
  });
  const snapshot = await createSnapshot(readActiveDraft(storage), "2026-08-12T00:01:00.000Z");
  storage.failWrites = true;

  assert.throws(() => forkSnapshot(storage, snapshot, { uuid: () => "forked-draft" }), /Quota exceeded/u);
  assert.equal(storage.getItem(ACTIVE_DRAFT_KEY), "existing-draft");
  assert.equal(snapshot.recipe.items[0].label, "Glitch Art");
});

test("oversized shares fall back to a lossless checksummed export", async () => {
  const draft = addPrimitive(createDraft("recipe-42", "2026-08-12T00:00:00.000Z"), glitch).draft;
  const snapshot = await createSnapshot(draft, "2026-08-12T00:01:00.000Z");
  const oversized = buildShareUrl("https://example.test/composer/", "x".repeat(6000));
  assert.equal(oversized.shareable, false);
  assert.ok(oversized.length > 6000);

  const exported = createExportFile(snapshot);
  assert.equal(exported.filename, "prompt-atlas-recipe-recipe-42.promptatlas.json");
  assert.equal(exported.mimeType, "application/json");
  const imported = await parseExportFile(exported.content, productionPrimitiveIdentities);
  assert.deepEqual(imported, snapshot);

  const tampered = JSON.parse(exported.content);
  tampered.recipe.items[0].label = "Changed";
  await assert.rejects(parseExportFile(JSON.stringify(tampered), productionPrimitiveIdentities), /Checksum/u);
});

test("checksummed snapshots with malformed primitive fields are rejected before rendering", async () => {
  const draft = addPrimitive(createDraft("recipe-malformed", "2026-08-12T00:00:00.000Z"), glitch).draft;
  let snapshot = await createSnapshot(draft, "2026-08-12T00:01:00.000Z");
  snapshot.recipe.items[0].sourcePrompt = null;
  snapshot = await resignSnapshot(snapshot);

  await assert.rejects(parseExportFile(JSON.stringify(snapshot), productionPrimitiveIdentities), /sourcePrompt/u);
  await assert.rejects(decodeSnapshot(encodeSnapshot(snapshot), productionPrimitiveIdentities), /sourcePrompt/u);
});

test("imported and shared snapshots reject repeated non-blendable dimensions", async () => {
  const conflictingDraft = {
    ...createDraft("recipe-dimension-conflict", "2026-08-13T00:00:00.000Z"),
    items: [shallowDepth, deepDepth],
  };
  const snapshot = await createSnapshot(conflictingDraft, "2026-08-13T00:01:00.000Z");

  await assert.rejects(
    parseExportFile(JSON.stringify(snapshot), productionPrimitiveIdentities),
    /dimension.*một giá trị/u,
  );
  await assert.rejects(
    decodeSnapshot(encodeSnapshot(snapshot), productionPrimitiveIdentities),
    /dimension.*một giá trị/u,
  );
});

test("imported and shared snapshots preserve the style.medium blend exception", async () => {
  let styleDraft = addPrimitive(createDraft("recipe-style-blend"), glitch).draft;
  styleDraft = addPrimitive(styleDraft, watercolor).draft;
  const snapshot = await createSnapshot(styleDraft, "2026-08-13T00:02:00.000Z");

  const imported = await parseExportFile(JSON.stringify(snapshot), productionPrimitiveIdentities);
  const shared = await decodeSnapshot(encodeSnapshot(snapshot), productionPrimitiveIdentities);
  assert.equal(imported.recipe.items.length, 2);
  assert.equal(shared.recipe.items.length, 2);
  assert.equal(deriveBlendConflicts({ ...styleDraft, items: imported.recipe.items }).length, 1);
});

test("snapshot versions, item bounds, identities and accepted blend keys are enforced", async () => {
  let draft = addPrimitive(createDraft("recipe-bounds", "2026-08-12T00:00:00.000Z"), glitch).draft;
  draft = addPrimitive(draft, watercolor).draft;
  const valid = await createSnapshot(draft, "2026-08-12T00:01:00.000Z");
  const cases = [
    {
      expected: /Phiên bản snapshot/u,
      mutate: (snapshot) => { snapshot.schemaVersion = "2.0.0"; },
    },
    {
      expected: /Phiên bản snapshot/u,
      mutate: (snapshot) => { snapshot.datasetVersion = "2.0.0"; },
    },
    {
      expected: /primitiveId.*duy nhất/u,
      mutate: (snapshot) => { snapshot.recipe.items[1].primitiveId = snapshot.recipe.items[0].primitiveId; },
    },
    {
      expected: /blend key/u,
      mutate: (snapshot) => { snapshot.recipe.acceptedBlendKeys = ["primitive.style.glitch-art::primitive.style.unknown"]; },
    },
    {
      expected: /tối đa 90/u,
      mutate: (snapshot) => {
        snapshot.recipe.items = Array.from({ length: 91 }, (_, index) => ({
          ...glitch,
          primitiveId: `primitive.style.test-${index}`,
          slug: `test-${index}`,
        }));
      },
    },
  ];

  for (const scenario of cases) {
    const snapshot = structuredClone(valid);
    scenario.mutate(snapshot);
    await assert.rejects(parseExportFile(JSON.stringify(await resignSnapshot(snapshot)), productionPrimitiveIdentities), scenario.expected);
  }
});

test("snapshot primitive identities must match the canonical production registry", async () => {
  const draft = addPrimitive(createDraft("recipe-canonical", "2026-08-12T00:00:00.000Z"), glitch).draft;
  const valid = await createSnapshot(draft, "2026-08-12T00:01:00.000Z");
  const cases = [
    {
      mutate: (snapshot) => {
        snapshot.recipe.items[0].primitiveId = "primitive.style.not-in-production";
        snapshot.recipe.items[0].slug = "not-in-production";
      },
    },
    {
      mutate: (snapshot) => { snapshot.recipe.items[0].slug = watercolor.slug; },
    },
  ];

  for (const scenario of cases) {
    const snapshot = structuredClone(valid);
    scenario.mutate(snapshot);
    await assert.rejects(
      parseExportFile(JSON.stringify(await resignSnapshot(snapshot)), productionPrimitiveIdentities),
      /bộ dữ liệu Prompt Atlas production/u,
    );
  }
});

test("snapshot dimensions must match canonical metadata while legacy style recipes remain readable", async () => {
  const portraitDraft = addPrimitive(createDraft("recipe-dimension"), portraitRatio).draft;
  const validPortrait = await createSnapshot(portraitDraft, "2026-08-13T00:01:00.000Z");
  const forgedDimension = structuredClone(validPortrait);
  forgedDimension.recipe.items[0].dimensionId = "camera.depth-of-field";
  await assert.rejects(
    parseExportFile(JSON.stringify(await resignSnapshot(forgedDimension)), productionPrimitiveIdentities),
    /bộ dữ liệu Prompt Atlas production/u,
  );

  const legacyDraft = addPrimitive(createDraft("recipe-legacy-style"), glitch).draft;
  const legacySnapshot = await createSnapshot(legacyDraft, "2026-08-13T00:02:00.000Z");
  delete legacySnapshot.recipe.items[0].dimensionId;
  const signedLegacySnapshot = await resignSnapshot(legacySnapshot);
  const opened = await parseExportFile(JSON.stringify(signedLegacySnapshot), productionPrimitiveIdentities);
  assert.equal(opened.recipe.items[0].primitiveId, glitch.primitiveId);

  const storage = new FakeStorage();
  const forked = forkSnapshot(storage, opened, { uuid: () => "legacy-fork" });
  assert.equal(forked.items[0].dimensionId, "style.medium");
});
