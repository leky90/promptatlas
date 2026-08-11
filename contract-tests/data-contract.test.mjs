import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPromptAtlasValidator } from "../scripts/validate-prompt-atlas-data.mjs";

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
const validateDataset = createPromptAtlasValidator({ schema, taxonomy });
const mutateFixture = (mutate) => {
  const copy = structuredClone(fixture);
  mutate(copy);
  return validateDataset(copy);
};

test("example dataset conforms to the schema and cross-record contract", () => {
  const result = validateDataset(fixture);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("taxonomy is ordered, bilingual, exhaustive and unambiguous", () => {
  assert.equal(taxonomy.schemaVersion, fixture.schemaVersion);
  assert.equal(taxonomy.taxonomyVersion, fixture.taxonomyVersion);
  assert.deepEqual(taxonomy.supportedLocales, ["vi", "en"]);
  assert.deepEqual(
    taxonomy.categories.map((category) => category.id),
    expectedCategories,
  );

  assert.equal(dimensionIds.size, dimensions.length, "dimension IDs must be globally unique");

  const coverageIds = taxonomy.prdCoverage.map((coverage) => coverage.id);
  const coveredDimensions = new Set(taxonomy.prdCoverage.flatMap((coverage) => coverage.dimensionIds));
  assert.equal(new Set(coverageIds).size, coverageIds.length, "PRD coverage group IDs must be unique");
  assert.deepEqual([...coveredDimensions].sort(), [...dimensionIds].sort(), "every dimension must map to the PRD");
  for (const requiredDimension of [
    "subject.person.eye-spacing",
    "subject.person.hair-density",
    "subject.person.hair-color",
    "subject.person.footwear",
    "camera.lens-distortion",
    "camera.perspective-compression",
  ]) {
    assert.ok(dimensionIds.has(requiredDimension), `missing explicit PRD dimension ${requiredDimension}`);
  }

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
    assert.ok(primitive.cardinality.minimum <= primitive.cardinality.maximum);
    if (primitive.cardinality.mode === "single") assert.equal(primitive.cardinality.maximum, 1);
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

    for (const rule of primitive.compatibility.rules) {
      const target = primitiveById.get(rule.target.primitiveId);
      assert.ok(target, `${primitive.id} rule ${rule.id} references unknown target`);
      for (const sourceValueId of rule.sourceValueIds ?? []) {
        assert.ok(primitive.values.some((value) => value.id === sourceValueId));
      }
      for (const targetValueId of rule.target.valueIds ?? []) {
        assert.ok(target.values.some((value) => value.id === targetValueId));
      }
      assert.ok(rule.reason.vi && rule.reason.en);
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
  assert.ok(fixture.primitives.some((primitive) => primitive.compatibility.rules.length > 0));
});

test("recipes resolve primitive and value references without modality leakage", () => {
  assert.equal(recipeById.size, fixture.recipes.length, "recipe IDs must be unique");

  for (const recipe of fixture.recipes) {
    const orders = recipe.items.map((item) => item.order);
    assert.equal(new Set(orders).size, orders.length, `${recipe.id} item order must be unique`);
    const enabledPrimitiveIds = recipe.items.filter((item) => item.enabled).map((item) => item.primitiveId);
    assert.equal(new Set(enabledPrimitiveIds).size, enabledPrimitiveIds.length, `${recipe.id} must respect single cardinality`);

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
    const recipe = recipeById.get(run.recipeId);
    assert.ok(recipe, `${run.id} references unknown recipe`);
    assert.equal(run.recipeVersion, recipe.version, `${run.id} must pin the recipe version`);
    assert.equal(run.datasetVersion, fixture.datasetVersion, `${run.id} must pin the dataset version`);
    assert.ok(["exact", "provider-alias", "unavailable"].includes(run.modelVersion.status));
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

test("negative: generation run without model disclosure is rejected", () => {
  const result = mutateFixture((dataset) => delete dataset.generationRuns[0].modelVersion);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("modelVersion")));
});

test("negative: model note without evidence runs is rejected", () => {
  const result = mutateFixture((dataset) => {
    dataset.primitives[0].modelNotes[0].evidenceRunIds = [];
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("evidenceRunIds")));
});

test("negative: video without bilingual accessibility metadata is rejected", () => {
  const result = mutateFixture((dataset) => {
    delete dataset.exampleAssets[1].media.alt;
    delete dataset.exampleAssets[1].media.caption;
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("alt")));
  assert.ok(result.errors.some((error) => error.message.includes("caption")));
});

test("negative: duplicate single-select primitive in a recipe is rejected", () => {
  const result = mutateFixture((dataset) => {
    const duplicate = structuredClone(dataset.recipes[0].items[0]);
    duplicate.valueId = "smooth";
    duplicate.order = 99;
    dataset.recipes[0].items.push(duplicate);
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("single-select primitive")));
});

test("negative: generation run cannot drift from recipe or dataset versions", () => {
  const result = mutateFixture((dataset) => {
    dataset.generationRuns[0].recipeVersion = "9.0.0";
    dataset.generationRuns[0].datasetVersion = "9.0.0";
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("recipeVersion")));
  assert.ok(result.errors.some((error) => error.path.includes("datasetVersion")));
});

test("negative: compatibility rules cannot reference an unknown target value", () => {
  const result = mutateFixture((dataset) => {
    const primitive = dataset.primitives.find((item) => item.id === "primitive.style.medium");
    primitive.compatibility.rules[0].target.valueIds = ["not-a-skin-value"];
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("unknown target value")));
});
