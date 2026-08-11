import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

const [taxonomy, schema, fixture] = await Promise.all([
  readJson("../src/data/taxonomy.v1.json"),
  readJson("../schemas/prompt-atlas.v1.schema.json"),
  readJson("../schemas/examples/prompt-atlas.v1.example.json"),
]);

const expectedCategories = [
  "subject",
  "object",
  "scene",
  "composition",
  "camera",
  "lighting",
  "color",
  "style",
  "motion",
  "temporal",
  "audio",
];

const dimensions = taxonomy.categories.flatMap((category) => category.dimensions);
const dimensionIds = new Set(dimensions.map((dimension) => dimension.id));
const primitiveById = new Map(fixture.primitives.map((primitive) => [primitive.id, primitive]));
const recipeById = new Map(fixture.recipes.map((recipe) => [recipe.id, recipe]));
const exampleById = new Map(fixture.exampleAssets.map((example) => [example.id, example]));
const runById = new Map(fixture.generationRuns.map((run) => [run.id, run]));
const mediaIds = new Set(fixture.exampleAssets.map((example) => example.media.id));

test("example dataset conforms to the published JSON Schema", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowMatchingProperties: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  assert.equal(validate(fixture), true, JSON.stringify(validate.errors, null, 2));
});

test("taxonomy is ordered, bilingual, exhaustive and unambiguous", () => {
  assert.equal(taxonomy.schemaVersion, "1.0.0");
  assert.equal(taxonomy.taxonomyVersion, fixture.taxonomyVersion);
  assert.deepEqual(taxonomy.supportedLocales, ["vi", "en"]);
  assert.deepEqual(
    taxonomy.categories.map((category) => category.id),
    expectedCategories,
  );

  assert.equal(dimensionIds.size, dimensions.length, "dimension IDs must be globally unique");

  let previousOrder = -1;
  for (const category of taxonomy.categories) {
    assert.ok(category.order > previousOrder, `${category.id} must have a stable display order`);
    previousOrder = category.order;
    assert.ok(category.label.vi && category.label.en, `${category.id} must be bilingual`);
    assert.ok(category.description.vi && category.description.en, `${category.id} must have a bilingual definition`);
    assert.ok(category.dimensions.length > 0, `${category.id} must contain dimensions`);

    for (const dimension of category.dimensions) {
      assert.ok(dimension.id.startsWith(`${category.id}.`), `${dimension.id} must be namespaced by category`);
      assert.ok(dimension.label.vi && dimension.label.en, `${dimension.id} must be bilingual`);
    }
  }
});

test("schema exposes the four versioned core entities", () => {
  for (const name of ["primitive", "recipe", "exampleAsset", "generationRun"]) {
    assert.ok(schema.$defs[name], `missing schema definition: ${name}`);
  }

  assert.deepEqual(schema.required, [
    "schemaVersion",
    "taxonomyVersion",
    "datasetVersion",
    "defaultLocale",
    "primitives",
    "recipes",
    "exampleAssets",
    "generationRuns",
  ]);
});

test("fixture demonstrates every taxonomy category and valid primitive values", () => {
  assert.deepEqual(
    [...new Set(fixture.primitives.map((primitive) => primitive.category))],
    expectedCategories,
  );
  assert.equal(primitiveById.size, fixture.primitives.length, "primitive IDs must be unique");

  for (const primitive of fixture.primitives) {
    assert.ok(dimensionIds.has(primitive.dimensionId), `${primitive.id} references an unknown dimension`);
    assert.equal(primitive.dimensionId.split(".")[0], primitive.category);
    assert.ok(primitive.label.vi && primitive.label.en);
    assert.ok(primitive.definition.vi && primitive.definition.en);
    assert.ok(primitive.searchAliases.vi && primitive.searchAliases.en);
    assert.ok(primitive.values.length > 0, `${primitive.id} must have at least one demonstrative value`);
    assert.ok(
      primitive.values.some((value) => value.id === primitive.defaultValueId),
      `${primitive.id} defaultValueId must resolve locally`,
    );

    for (const reference of [
      ...primitive.compatibility.requires,
      ...primitive.compatibility.compatibleWith,
      ...primitive.compatibility.conflictsWith,
    ]) {
      assert.ok(primitiveById.has(reference), `${primitive.id} references unknown primitive ${reference}`);
    }

    for (const exampleId of [...primitive.exampleIds, ...primitive.counterExampleIds]) {
      assert.ok(exampleById.has(exampleId), `${primitive.id} references unknown example ${exampleId}`);
    }

    for (const note of primitive.modelNotes) {
      for (const runId of note.evidenceRunIds) {
        assert.ok(runById.has(runId), `${primitive.id} model note references unknown run ${runId}`);
      }
    }
  }
});

test("recipes resolve primitive and value references without modality leakage", () => {
  assert.equal(recipeById.size, fixture.recipes.length, "recipe IDs must be unique");

  for (const recipe of fixture.recipes) {
    const orders = recipe.items.map((item) => item.order);
    assert.equal(new Set(orders).size, orders.length, `${recipe.id} item order must be unique`);

    for (const item of recipe.items) {
      const primitive = primitiveById.get(item.primitiveId);
      assert.ok(primitive, `${recipe.id} references unknown primitive ${item.primitiveId}`);
      assert.ok(
        primitive.modality === "shared" || primitive.modality === recipe.modality,
        `${recipe.id} cannot use ${primitive.modality} primitive ${primitive.id}`,
      );
      if (item.valueId) {
        assert.ok(
          primitive.values.some((value) => value.id === item.valueId),
          `${recipe.id} references unknown value ${item.valueId} on ${primitive.id}`,
        );
      }
    }

    for (const conflictId of recipe.unresolvedConflictIds) {
      assert.ok(primitiveById.has(conflictId), `${recipe.id} has unknown unresolved conflict ${conflictId}`);
    }
  }
});

test("examples and runs preserve traceable reference integrity", () => {
  assert.equal(exampleById.size, fixture.exampleAssets.length, "example IDs must be unique");
  assert.equal(runById.size, fixture.generationRuns.length, "run IDs must be unique");
  assert.equal(mediaIds.size, fixture.exampleAssets.length, "media IDs must be unique");

  for (const example of fixture.exampleAssets) {
    assert.ok(recipeById.has(example.recipeId), `${example.id} references unknown recipe`);
    assert.ok(runById.has(example.generationRunId), `${example.id} references unknown run`);
    for (const primitiveId of example.primitiveIds) {
      assert.ok(primitiveById.has(primitiveId), `${example.id} references unknown primitive ${primitiveId}`);
    }
    for (const dimensionId of [...example.isolatedDimensionIds, ...example.confounders]) {
      assert.ok(dimensionIds.has(dimensionId), `${example.id} references unknown dimension ${dimensionId}`);
    }
    for (const claim of example.expectedClaims) {
      assert.ok(dimensionIds.has(claim.dimensionId), `${claim.id} references unknown dimension`);
    }
  }

  for (const run of fixture.generationRuns) {
    assert.ok(recipeById.has(run.recipeId), `${run.id} references unknown recipe`);
    for (const outputAssetId of run.outputAssetIds) {
      assert.ok(mediaIds.has(outputAssetId), `${run.id} references unknown media ${outputAssetId}`);
    }
    for (const claim of run.expectedClaims) {
      assert.ok(dimensionIds.has(claim.dimensionId), `${claim.id} references unknown dimension`);
    }
  }
});

test("version, localization and provenance fields are present on durable records", () => {
  const semver = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
  assert.match(fixture.schemaVersion, semver);
  assert.match(fixture.taxonomyVersion, semver);
  assert.match(fixture.datasetVersion, semver);

  for (const record of [...fixture.primitives, ...fixture.recipes, ...fixture.exampleAssets, ...fixture.generationRuns]) {
    assert.ok(record.provenance?.author, `${record.id} must identify its author`);
    assert.ok(record.provenance?.license, `${record.id} must declare a license`);
    assert.doesNotThrow(() => new Date(record.provenance.createdAt).toISOString());
    assert.doesNotThrow(() => new Date(record.provenance.updatedAt).toISOString());
  }
});
