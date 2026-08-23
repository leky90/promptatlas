import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateV2Content } from "../scripts/validate-v2-content.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

const [styleV2, anatomyV2, legacyStyles] = await Promise.all([
  readJson("../src/data/style-library.v2.json"),
  readJson("../src/data/image-anatomy.v2.json"),
  readJson("../src/data/styles.json"),
]);

test("accepted V2 packages satisfy schema, relationships and asset integrity", async () => {
  const result = await validateV2Content();
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("Style Library V2 exposes 102 canonical concepts and 3 hybrid recipes", () => {
  assert.equal(styleV2.registry.canonicalConcepts.length, 102);
  assert.equal(styleV2.registry.hybridRecipes.length, 3);
  assert.equal(new Set(styleV2.registry.canonicalConcepts.map((item) => item.primaryFacet)).size, 7);
  assert.equal(styleV2.migrationManifest.length, 90);
});

test("all 90 legacy URLs and exact source prompts survive migration", () => {
  const expected = legacyStyles.map((style) => ({
    id: style.id,
    slug: style.slug,
    prompt: style.sourcePrompt,
  }));
  const actual = styleV2.migrationManifest.map((item) => ({
    id: item.legacyId,
    slug: item.legacySlug,
    prompt: item.exactSourcePrompt,
  }));
  assert.deepEqual(actual, expected);
});

test("Image Anatomy V2 exposes the accepted hierarchy and teaching roles", () => {
  assert.equal(anatomyV2.hierarchy, "Category → Dimension → optional Subdimension → Value → Example");
  assert.equal(anatomyV2.categories.length, 7);
  assert.equal(anatomyV2.dimensions.length, 116);
  assert.equal(anatomyV2.values.length, 360);
  assert.equal(anatomyV2.examples.length, 600);
  assert.equal(anatomyV2.comparisonSets.length, 119);
  assert.equal(anatomyV2.legacyReferenceMigrations.length, 187);
  assert.ok(anatomyV2.values.some((value) => value.tier === "core"));
  assert.ok(anatomyV2.values.some((value) => value.tier === "advanced"));
  assert.ok(anatomyV2.examples.some((example) => example.role === "controlled-comparison"));
  assert.ok(anatomyV2.examples.some((example) => example.role === "application"));
  assert.ok(anatomyV2.examples.some((example) => example.role === "canonical-reference"));
});

