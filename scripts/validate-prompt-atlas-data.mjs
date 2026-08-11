import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const uniqueDuplicates = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

const rangeIsOrdered = (range) =>
  range?.minimum === undefined || range?.maximum === undefined || range.minimum <= range.maximum;

export function createPromptAtlasValidator({ schema, taxonomy }) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowMatchingProperties: true,
  });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

  const taxonomyCategories = new Map(taxonomy.categories.map((category) => [category.id, category]));
  const dimensionIds = new Set(taxonomy.categories.flatMap((category) => category.dimensions.map((item) => item.id)));

  return function validatePromptAtlasDataset(dataset) {
    const errors = [];
    const addError = (pathValue, message) => errors.push({ path: pathValue, message });

    if (!validateSchema(dataset)) {
      for (const error of validateSchema.errors ?? []) {
        addError(error.instancePath || "/", error.message ?? "schema validation failed");
      }
      return { valid: false, errors };
    }

    const primitives = new Map(dataset.primitives.map((primitive) => [primitive.id, primitive]));
    const recipes = new Map(dataset.recipes.map((recipe) => [recipe.id, recipe]));
    const examples = new Map(dataset.exampleAssets.map((example) => [example.id, example]));
    const runs = new Map(dataset.generationRuns.map((run) => [run.id, run]));
    const mediaIds = new Set(dataset.exampleAssets.map((example) => example.media.id));
    const ruleIds = new Set();

    for (const [collectionName, records] of [
      ["primitives", dataset.primitives],
      ["recipes", dataset.recipes],
      ["exampleAssets", dataset.exampleAssets],
      ["generationRuns", dataset.generationRuns],
    ]) {
      for (const duplicate of uniqueDuplicates(records.map((record) => record.id))) {
        addError(`/${collectionName}`, `duplicate ID ${duplicate}`);
      }
    }

    for (const duplicate of uniqueDuplicates(dataset.exampleAssets.map((example) => example.media.id))) {
      addError("/exampleAssets", `duplicate media ID ${duplicate}`);
    }

    const coveredDimensions = new Set();
    for (const [coverageIndex, coverage] of taxonomy.prdCoverage.entries()) {
      for (const dimensionId of coverage.dimensionIds) {
        coveredDimensions.add(dimensionId);
        if (!dimensionIds.has(dimensionId)) {
          addError(`/taxonomy/prdCoverage/${coverageIndex}`, `unknown dimension ${dimensionId}`);
        }
      }
    }
    for (const dimensionId of dimensionIds) {
      if (!coveredDimensions.has(dimensionId)) {
        addError("/taxonomy/prdCoverage", `dimension ${dimensionId} is not mapped to a PRD requirement`);
      }
    }

    for (const [index, primitive] of dataset.primitives.entries()) {
      const primitivePath = `/primitives/${index}`;
      const category = taxonomyCategories.get(primitive.category);
      if (!category) addError(`${primitivePath}/category`, `unknown category ${primitive.category}`);
      if (!dimensionIds.has(primitive.dimensionId)) {
        addError(`${primitivePath}/dimensionId`, `unknown dimension ${primitive.dimensionId}`);
      } else if (!primitive.dimensionId.startsWith(`${primitive.category}.`)) {
        addError(`${primitivePath}/dimensionId`, `dimension does not belong to category ${primitive.category}`);
      }

      const valueIds = new Set(primitive.values.map((value) => value.id));
      for (const duplicate of uniqueDuplicates(primitive.values.map((value) => value.id))) {
        addError(`${primitivePath}/values`, `duplicate value ID ${duplicate}`);
      }
      if (primitive.defaultValueId && !valueIds.has(primitive.defaultValueId)) {
        addError(`${primitivePath}/defaultValueId`, `unknown local value ${primitive.defaultValueId}`);
      }
      if (primitive.cardinality.minimum > primitive.cardinality.maximum) {
        addError(`${primitivePath}/cardinality`, "minimum cannot exceed maximum");
      }

      for (const reference of [
        ...primitive.compatibility.requires,
        ...primitive.compatibility.compatibleWith,
        ...primitive.compatibility.conflictsWith,
      ]) {
        if (!primitives.has(reference)) {
          addError(`${primitivePath}/compatibility`, `unknown primitive ${reference}`);
        }
      }

      for (const [ruleIndex, rule] of primitive.compatibility.rules.entries()) {
        const rulePath = `${primitivePath}/compatibility/rules/${ruleIndex}`;
        if (ruleIds.has(rule.id)) addError(`${rulePath}/id`, `duplicate compatibility rule ID ${rule.id}`);
        ruleIds.add(rule.id);
        for (const valueId of rule.sourceValueIds ?? []) {
          if (!valueIds.has(valueId)) addError(`${rulePath}/sourceValueIds`, `unknown source value ${valueId}`);
        }
        if (!rangeIsOrdered(rule.sourceIntensity)) {
          addError(`${rulePath}/sourceIntensity`, "minimum cannot exceed maximum");
        }

        const target = primitives.get(rule.target.primitiveId);
        if (!target) {
          addError(`${rulePath}/target/primitiveId`, `unknown target primitive ${rule.target.primitiveId}`);
        } else {
          const targetValues = new Set(target.values.map((value) => value.id));
          for (const valueId of rule.target.valueIds ?? []) {
            if (!targetValues.has(valueId)) {
              addError(`${rulePath}/target/valueIds`, `unknown target value ${valueId}`);
            }
          }
        }
        if (!rangeIsOrdered(rule.target.intensity)) {
          addError(`${rulePath}/target/intensity`, "minimum cannot exceed maximum");
        }
      }

      for (const exampleId of [...primitive.exampleIds, ...primitive.counterExampleIds]) {
        if (!examples.has(exampleId)) addError(`${primitivePath}/exampleIds`, `unknown example ${exampleId}`);
      }
      for (const [noteIndex, note] of primitive.modelNotes.entries()) {
        const notePath = `${primitivePath}/modelNotes/${noteIndex}`;
        for (const runId of note.evidenceRunIds) {
          const evidenceRun = runs.get(runId);
          if (!evidenceRun) {
            addError(`${notePath}/evidenceRunIds`, `unknown run ${runId}`);
            continue;
          }
          if (evidenceRun.provider !== note.provider) {
            addError(
              `${notePath}/evidenceRunIds`,
              `evidence run ${runId} provider ${evidenceRun.provider} does not match ${note.provider}`,
            );
          }
          if (evidenceRun.modelFamily !== note.modelFamily) {
            addError(
              `${notePath}/evidenceRunIds`,
              `evidence run ${runId} model family ${evidenceRun.modelFamily} does not match ${note.modelFamily}`,
            );
          }
          if (evidenceRun.modelVersion.status !== note.modelVersion.status) {
            addError(
              `${notePath}/evidenceRunIds`,
              `evidence run ${runId} version status ${evidenceRun.modelVersion.status} does not match ${note.modelVersion.status}`,
            );
          }
          if (
            evidenceRun.modelVersion.identifier !== undefined &&
            note.modelVersion.identifier !== undefined &&
            evidenceRun.modelVersion.identifier !== note.modelVersion.identifier
          ) {
            addError(
              `${notePath}/evidenceRunIds`,
              `evidence run ${runId} model version ${evidenceRun.modelVersion.identifier} does not match ${note.modelVersion.identifier}`,
            );
          }
        }
      }
    }

    for (const [index, recipe] of dataset.recipes.entries()) {
      const recipePath = `/recipes/${index}`;
      for (const duplicate of uniqueDuplicates(recipe.items.map((item) => item.order))) {
        addError(`${recipePath}/items`, `duplicate item order ${duplicate}`);
      }

      const enabledByPrimitive = new Map();
      for (const [itemIndex, item] of recipe.items.entries()) {
        const itemPath = `${recipePath}/items/${itemIndex}`;
        const primitive = primitives.get(item.primitiveId);
        if (!primitive) {
          addError(`${itemPath}/primitiveId`, `unknown primitive ${item.primitiveId}`);
          continue;
        }
        if (primitive.modality !== "shared" && primitive.modality !== recipe.modality) {
          addError(`${itemPath}/primitiveId`, `${primitive.modality} primitive cannot be used in ${recipe.modality} recipe`);
        }
        if (item.valueId && !primitive.values.some((value) => value.id === item.valueId)) {
          addError(`${itemPath}/valueId`, `unknown value ${item.valueId}`);
        }
        if (item.enabled) enabledByPrimitive.set(item.primitiveId, (enabledByPrimitive.get(item.primitiveId) ?? 0) + 1);
      }

      for (const [primitiveId, count] of enabledByPrimitive) {
        const primitive = primitives.get(primitiveId);
        if (primitive.cardinality.mode === "single" && count > 1) {
          addError(`${recipePath}/items`, `single-select primitive ${primitiveId} appears ${count} times`);
        }
        if (count > primitive.cardinality.maximum) {
          addError(`${recipePath}/items`, `primitive ${primitiveId} exceeds maximum ${primitive.cardinality.maximum}`);
        }
        if (count < primitive.cardinality.minimum) {
          addError(`${recipePath}/items`, `primitive ${primitiveId} is below minimum ${primitive.cardinality.minimum}`);
        }
      }

      for (const conflictId of recipe.unresolvedConflictIds) {
        if (!ruleIds.has(conflictId)) {
          addError(`${recipePath}/unresolvedConflictIds`, `unknown compatibility rule ${conflictId}`);
        }
      }
      if (recipe.status === "approved" && recipe.unresolvedConflictIds.length > 0) {
        addError(`${recipePath}/unresolvedConflictIds`, "approved recipe cannot retain unresolved conflicts");
      }
    }

    for (const [index, example] of dataset.exampleAssets.entries()) {
      const examplePath = `/exampleAssets/${index}`;
      if (example.recipeId && !recipes.has(example.recipeId)) {
        addError(`${examplePath}/recipeId`, `unknown recipe ${example.recipeId}`);
      }
      if (example.generationRunId && !runs.has(example.generationRunId)) {
        addError(`${examplePath}/generationRunId`, `unknown run ${example.generationRunId}`);
      }
      for (const primitiveId of example.primitiveIds) {
        if (!primitives.has(primitiveId)) addError(`${examplePath}/primitiveIds`, `unknown primitive ${primitiveId}`);
      }
      for (const dimensionId of [...example.isolatedDimensionIds, ...example.confounders]) {
        if (!dimensionIds.has(dimensionId)) addError(examplePath, `unknown dimension ${dimensionId}`);
      }
      for (const claim of example.expectedClaims) {
        if (!dimensionIds.has(claim.dimensionId)) {
          addError(`${examplePath}/expectedClaims`, `unknown claim dimension ${claim.dimensionId}`);
        }
      }
    }

    for (const [index, run] of dataset.generationRuns.entries()) {
      const runPath = `/generationRuns/${index}`;
      const recipe = recipes.get(run.recipeId);
      if (!recipe) {
        addError(`${runPath}/recipeId`, `unknown recipe ${run.recipeId}`);
      } else if (recipe.version !== run.recipeVersion) {
        addError(`${runPath}/recipeVersion`, `expected ${recipe.version} for ${run.recipeId}`);
      }
      if (run.datasetVersion !== dataset.datasetVersion) {
        addError(`${runPath}/datasetVersion`, `expected dataset version ${dataset.datasetVersion}`);
      }
      for (const outputAssetId of run.outputAssetIds) {
        if (!mediaIds.has(outputAssetId)) addError(`${runPath}/outputAssetIds`, `unknown media ${outputAssetId}`);
      }
      for (const claim of run.expectedClaims) {
        if (!dimensionIds.has(claim.dimensionId)) {
          addError(`${runPath}/expectedClaims`, `unknown claim dimension ${claim.dimensionId}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const datasetPath = path.resolve(process.argv[2] ?? path.join(repositoryRoot, "schemas/examples/prompt-atlas.v1.example.json"));
  const [schema, taxonomy, dataset] = await Promise.all([
    readFile(path.join(repositoryRoot, "schemas/prompt-atlas.v1.schema.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "src/data/taxonomy.v1.json"), "utf8").then(JSON.parse),
    readFile(datasetPath, "utf8").then(JSON.parse),
  ]);
  const result = createPromptAtlasValidator({ schema, taxonomy })(dataset);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
