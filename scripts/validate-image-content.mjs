import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const duplicates = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

export function createImageContentValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

  return function validateImageContentDataset(dataset) {
    const errors = [];
    const addError = (pathValue, message) => errors.push({ path: pathValue, message });
    if (!validateSchema(dataset)) {
      for (const error of validateSchema.errors ?? []) {
        addError(error.instancePath || "/", error.message ?? "schema validation failed");
      }
      return { valid: false, errors };
    }

    const collections = [
      ["stylePrimitives", dataset.stylePrimitives],
      ["recipes", dataset.recipes],
      ["sourceAssets", dataset.sourceAssets],
      ["assets", dataset.assets],
      ["generationRuns", dataset.generationRuns],
    ];
    for (const [name, records] of collections) {
      for (const id of duplicates(records.map((record) => record.id))) {
        addError(`/${name}`, `duplicate ID ${id}`);
      }
    }

    const primitiveById = new Map(dataset.stylePrimitives.map((item) => [item.id, item]));
    const recipeById = new Map(dataset.recipes.map((item) => [item.id, item]));
    const sourceById = new Map(dataset.sourceAssets.map((item) => [item.id, item]));
    const assetById = new Map(dataset.assets.map((item) => [item.id, item]));
    const routeBySlug = new Map(dataset.legacyRoutes.map((item) => [item.slug, item]));

    if (dataset.sourceDataset.recordCount !== dataset.stylePrimitives.length) {
      addError("/sourceDataset/recordCount", "must equal the style primitive count");
    }
    if (dataset.recipes.length !== dataset.stylePrimitives.length) {
      addError("/recipes", "must contain one recipe for every migrated style");
    }
    if (dataset.legacyRoutes.length !== dataset.stylePrimitives.length) {
      addError("/legacyRoutes", "must preserve one URL for every migrated style");
    }
    const expectedLegacyIds = Array.from({ length: dataset.sourceDataset.recordCount }, (_, index) => index + 1);
    const actualLegacyIds = dataset.legacyRoutes.map((item) => item.legacyId).sort((a, b) => a - b);
    if (JSON.stringify(actualLegacyIds) !== JSON.stringify(expectedLegacyIds)) {
      addError("/legacyRoutes", "legacy IDs must be complete and contiguous");
    }

    for (const [index, recipe] of dataset.recipes.entries()) {
      for (const primitiveId of recipe.primitiveIds) {
        if (!primitiveById.has(primitiveId)) {
          addError(`/recipes/${index}/primitiveIds`, `unknown primitive ${primitiveId}`);
        }
      }
      const route = routeBySlug.get(recipe.slug);
      if (!route) addError(`/recipes/${index}/slug`, `missing preserved route for ${recipe.slug}`);
      else {
        if (route.recipeId !== recipe.id) addError(`/legacyRoutes`, `route ${route.route} points to the wrong recipe`);
        if (route.route !== `/styles/${recipe.slug}/`) {
          addError(`/legacyRoutes`, `route for ${recipe.slug} does not preserve the published URL`);
        }
      }
    }

    for (const [index, sourceAsset] of dataset.sourceAssets.entries()) {
      if (!recipeById.has(sourceAsset.recipeId)) {
        addError(`/sourceAssets/${index}/recipeId`, `unknown recipe ${sourceAsset.recipeId}`);
      }
    }

    for (const [index, asset] of dataset.assets.entries()) {
      const sourceAsset = sourceById.get(asset.sourceAssetId);
      if (!recipeById.has(asset.recipeId)) addError(`/assets/${index}/recipeId`, `unknown recipe ${asset.recipeId}`);
      if (!sourceAsset) addError(`/assets/${index}/sourceAssetId`, `unknown source asset ${asset.sourceAssetId}`);
      else {
        if (sourceAsset.recipeId !== asset.recipeId) addError(`/assets/${index}`, "source and published asset recipes differ");
        if (sourceAsset.productRouteId !== asset.productRouteId) {
          addError(`/assets/${index}`, "source and published asset product routes differ");
        }
      }
      if (asset.rights.consent.required && asset.rights.consent.status === "missing") {
        addError(`/assets/${index}/rights/consent`, "required consent cannot be missing");
      }
      if (asset.rights.takedown.status !== "active") {
        addError(`/assets/${index}/rights/takedown`, "non-active assets cannot remain published");
      }
    }

    for (const [index, run] of dataset.generationRuns.entries()) {
      const recipe = recipeById.get(run.recipeId);
      if (!recipe) {
        addError(`/generationRuns/${index}/recipeId`, `unknown recipe ${run.recipeId}`);
        continue;
      }
      if (run.recipeVersion !== recipe.version) {
        addError(`/generationRuns/${index}/recipeVersion`, `expected ${recipe.version}`);
      }
      if (run.datasetVersion !== dataset.datasetVersion) {
        addError(`/generationRuns/${index}/datasetVersion`, `expected ${dataset.datasetVersion}`);
      }
      if (run.exactPrompt.text !== recipe.generationPrompt) {
        addError(`/generationRuns/${index}/exactPrompt`, "must snapshot the exact recipe generation prompt");
      }
      if (sha256(Buffer.from(run.exactPrompt.text, "utf8")) !== run.exactPrompt.sha256) {
        addError(`/generationRuns/${index}/exactPrompt/sha256`, "prompt checksum mismatch");
      }
      if (new Date(run.completedAt) < new Date(run.startedAt)) {
        addError(`/generationRuns/${index}/completedAt`, "cannot precede startedAt");
      }
      if (run.productRoute.interface === "api") {
        addError(`/generationRuns/${index}/productRoute/interface`, "API adapters are outside the approved scope");
      }
      if (run.quotaUsage.apiCostUsd !== 0) {
        addError(`/generationRuns/${index}/quotaUsage/apiCostUsd`, "API spend must remain USD 0");
      }
      for (const sourceAssetId of run.originalAssetIds) {
        const sourceAsset = sourceById.get(sourceAssetId);
        if (!sourceAsset) addError(`/generationRuns/${index}/originalAssetIds`, `unknown source asset ${sourceAssetId}`);
        else if (sourceAsset.productRouteId !== run.productRoute.id) {
          addError(`/generationRuns/${index}/originalAssetIds`, "source asset product route does not match run snapshot");
        }
      }
      for (const outputAssetId of run.outputAssetIds) {
        const asset = assetById.get(outputAssetId);
        if (!asset) addError(`/generationRuns/${index}/outputAssetIds`, `unknown output asset ${outputAssetId}`);
        else if (asset.productRouteId !== run.productRoute.id) {
          addError(`/generationRuns/${index}/outputAssetIds`, "output asset product route does not match run snapshot");
        }
      }
    }

    return { valid: errors.length === 0, errors };
  };
}

export async function validateImageAssetIntegrity(dataset, root = repositoryRoot) {
  const errors = [];
  for (const [index, asset] of dataset.assets.entries()) {
    for (const [kind, item] of [
      ["asset", { path: asset.path, sha256: asset.sha256, bytes: asset.bytes }],
      ["thumbnail", asset.thumbnail],
    ]) {
      const absolutePath = path.join(root, "public", item.path);
      try {
        const [buffer, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
        if (sha256(buffer) !== item.sha256) {
          errors.push({ path: `/assets/${index}/${kind}/sha256`, message: `checksum mismatch for ${item.path}` });
        }
        if (item.bytes !== undefined && metadata.size !== item.bytes) {
          errors.push({ path: `/assets/${index}/${kind}/bytes`, message: `byte size mismatch for ${item.path}` });
        }
      } catch (error) {
        errors.push({ path: `/assets/${index}/${kind}`, message: `cannot read ${item.path}: ${error.message}` });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const [schema, dataset, stylesBuffer] = await Promise.all([
    readFile(path.join(repositoryRoot, "schemas/prompt-atlas.image.v1.schema.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "src/data/prompt-atlas.image.v1.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "src/data/styles.json")),
  ]);
  const contract = createImageContentValidator(schema)(dataset);
  const integrity = await validateImageAssetIntegrity(dataset);
  if (sha256(stylesBuffer) !== dataset.sourceDataset.sha256) {
    contract.errors.push({ path: "/sourceDataset/sha256", message: "source style dataset checksum mismatch" });
    contract.valid = false;
  }
  const result = {
    valid: contract.valid && integrity.valid,
    contract,
    integrity,
    summary: {
      styles: dataset.stylePrimitives.length,
      recipes: dataset.recipes.length,
      sourceAssets: dataset.sourceAssets.length,
      assets: dataset.assets.length,
      runs: dataset.generationRuns.length,
      legacyRoutes: dataset.legacyRoutes.length,
      apiCostUsd: dataset.generationRuns.reduce((sum, run) => sum + run.quotaUsage.apiCostUsd, 0),
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
