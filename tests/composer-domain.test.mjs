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
  addPrimitiveToActiveDraft,
  buildShareUrl,
  createSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  forkSnapshot,
  readActiveDraft,
} from "../src/scripts/composer-store.ts";

const glitch = {
  primitiveId: "primitive.style.glitch-art",
  slug: "glitch-art",
  label: "Glitch Art",
  fragment: "Style/medium: Glitch Art.",
  sourcePrompt: "A portrait looking into the camera.",
};

const watercolor = {
  primitiveId: "primitive.style.watercolor",
  slug: "watercolor",
  label: "Watercolor",
  fragment: "Style/medium: Watercolor.",
  sourcePrompt: "A portrait looking into the camera.",
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
  const opened = await decodeSnapshot(payload);

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
