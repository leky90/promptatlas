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
