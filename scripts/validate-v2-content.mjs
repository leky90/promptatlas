import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const fromRoot = (path) => fileURLToPath(new URL(path, new URL("../", import.meta.url)));
const readJson = async (path) => JSON.parse(await readFile(fromRoot(path), "utf8"));
const shaFile = (path) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

const add = (errors, path, message) => errors.push({ path, message });
const unique = (errors, path, values) => {
  if (new Set(values).size !== values.length) add(errors, path, "must contain unique IDs");
};
const ensureRefs = (errors, path, values, known) => {
  values.forEach((value) => {
    if (!known.has(value)) add(errors, path, `references unknown ID ${value}`);
  });
};
const styleThumbnailPath = (relativePath) =>
  `public/media/style-v2/thumbs/${relativePath.replace(/^assets\//u, "").replace(/\.[^.]+$/u, ".webp")}`;

export async function validateV2Content({ verifyAssets = true, verifySourceLocks = true, overrides = {} } = {}) {
  const [styleSchema, anatomySchema, diskStyle, diskStyleAssets, diskAnatomy, diskAnatomyAssets, diskLegacy, lock] = await Promise.all([
    readJson("schemas/prompt-atlas.style-library.v2.schema.json"),
    readJson("schemas/prompt-atlas.image-anatomy.v2.schema.json"),
    readJson("src/data/style-library.v2.json"),
    readJson("src/data/style-library-v2-assets.json"),
    readJson("src/data/image-anatomy.v2.json"),
    readJson("src/data/image-anatomy-v2-assets.json"),
    readJson("src/data/styles.json"),
    readJson("src/data/v2-content-lock.json"),
  ]);
  const style = overrides.style ?? diskStyle;
  const styleAssets = overrides.styleAssets ?? diskStyleAssets;
  const anatomy = overrides.anatomy ?? diskAnatomy;
  const anatomyAssets = overrides.anatomyAssets ?? diskAnatomyAssets;
  const legacy = overrides.legacy ?? diskLegacy;
  const errors = [];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const [path, schema, value] of [["style", styleSchema, style], ["anatomy", anatomySchema, anatomy]]) {
    const validate = ajv.compile(schema);
    if (!validate(value)) validate.errors.forEach((error) => add(errors, `${path}${error.instancePath}`, error.message ?? "schema violation"));
  }

  if (verifySourceLocks) {
    for (const [name, source] of Object.entries(lock.sources)) {
      const digest = await shaFile(fromRoot(source.path));
      if (digest !== source.sha256) add(errors, `lock.sources.${name}`, `sha256 mismatch: ${digest}`);
    }
  }

  const concepts = style.registry.canonicalConcepts;
  const recipes = style.registry.hybridRecipes;
  const conceptIds = new Set(concepts.map((item) => item.conceptId));
  const recipeIds = new Set(recipes.map((item) => item.recipeId));
  const targets = new Set([...conceptIds, ...recipeIds]);
  unique(errors, "style.registry.canonicalConcepts", concepts.map((item) => item.conceptId));
  unique(errors, "style.registry.canonicalConcepts", concepts.map((item) => item.canonicalSlug));
  unique(errors, "style.registry.hybridRecipes", recipes.map((item) => item.recipeId));
  unique(errors, "style.migrationManifest", style.migrationManifest.map((item) => item.legacyId));
  unique(errors, "styleAssets.referenceAssets", styleAssets.referenceAssets.map((item) => item.assetId));
  if (new Set(concepts.map((item) => item.primaryFacet)).size !== 7) add(errors, "style.registry.canonicalConcepts", "must expose exactly seven primary facets");
  recipes.forEach((item) => ensureRefs(errors, item.recipeId, item.componentConceptIds, conceptIds));
  style.migrationManifest.forEach((item, index) => {
    const source = legacy[index];
    if (!targets.has(item.targetId)) add(errors, `style.migrationManifest.${index}.targetId`, `unknown target ${item.targetId}`);
    if (!source || source.id !== item.legacyId || source.slug !== item.legacySlug || source.sourcePrompt !== item.exactSourcePrompt) {
      add(errors, `style.migrationManifest.${index}`, "legacy ID, URL or exact source prompt drifted");
    }
  });

  const categoryIdsRaw = anatomy.categories.map((item) => item.categoryId);
  const dimensionIdsRaw = anatomy.dimensions.map((item) => item.dimensionId);
  const valueIdsRaw = anatomy.values.map((item) => item.valueId);
  const assetIdsRaw = anatomyAssets.assets.map((item) => item.assetId);
  const categoryIds = new Set(categoryIdsRaw);
  const dimensionIds = new Set(dimensionIdsRaw);
  const valueIds = new Set(valueIdsRaw);
  const assetIds = new Set(assetIdsRaw);
  const categoriesById = new Map(anatomy.categories.map((item) => [item.categoryId, item]));
  const dimensionsById = new Map(anatomy.dimensions.map((item) => [item.dimensionId, item]));
  const valuesById = new Map(anatomy.values.map((item) => [item.valueId, item]));
  const subdimensionIdsRaw = anatomy.dimensions.flatMap((dimension) => dimension.subdimensions.map((item) => item.subdimensionId));
  unique(errors, "anatomy.categories", categoryIdsRaw);
  unique(errors, "anatomy.dimensions", dimensionIdsRaw);
  unique(errors, "anatomy.values", valueIdsRaw);
  unique(errors, "anatomy.subdimensions", subdimensionIdsRaw);
  unique(errors, "anatomy.examples", anatomy.examples.map((item) => item.exampleId));
  unique(errors, "anatomy.comparisonSets", anatomy.comparisonSets.map((item) => item.comparisonSetId));
  unique(errors, "anatomy.legacyReferenceMigrations", anatomy.legacyReferenceMigrations.map((item) => item.legacyReferenceId));
  unique(errors, "anatomy.assets", assetIdsRaw);
  anatomy.categories.forEach((item) => {
    unique(errors, `${item.categoryId}.dimensionIds`, item.dimensionIds);
    ensureRefs(errors, item.categoryId, item.dimensionIds, dimensionIds);
    item.dimensionIds.forEach((dimensionId) => {
      const dimension = dimensionsById.get(dimensionId);
      if (dimension && dimension.categoryId !== item.categoryId) {
        add(errors, `${item.categoryId}.dimensionIds`, `${dimensionId} belongs to category ${dimension.categoryId}`);
      }
    });
  });
  anatomy.dimensions.forEach((item) => {
    ensureRefs(errors, item.dimensionId, [item.categoryId], categoryIds);
    if (!categoriesById.get(item.categoryId)?.dimensionIds.includes(item.dimensionId)) {
      add(errors, item.dimensionId, `missing category backlink from ${item.categoryId}`);
    }
    unique(errors, `${item.dimensionId}.valueIds`, item.valueIds);
    ensureRefs(errors, item.dimensionId, item.valueIds, valueIds);
    item.valueIds.forEach((valueId) => {
      const value = valuesById.get(valueId);
      if (value && value.dimensionId !== item.dimensionId) {
        add(errors, `${item.dimensionId}.valueIds`, `${valueId} belongs to dimension ${value.dimensionId}`);
      }
    });
    item.subdimensions.forEach((subdimension) => {
      if (subdimension.legacyDimensionId !== item.dimensionId) {
        add(errors, subdimension.subdimensionId, `legacyDimensionId must equal parent dimension ${item.dimensionId}`);
      }
      unique(errors, `${subdimension.subdimensionId}.valueIds`, subdimension.valueIds);
      ensureRefs(errors, subdimension.subdimensionId, subdimension.valueIds, valueIds);
      subdimension.valueIds.forEach((valueId) => {
        const value = valuesById.get(valueId);
        if (!item.valueIds.includes(valueId)) {
          add(errors, `${subdimension.subdimensionId}.valueIds`, `${valueId} is missing from parent dimension ${item.dimensionId}`);
        }
        if (value && (value.dimensionId !== item.dimensionId || value.subdimensionId !== subdimension.subdimensionId)) {
          add(errors, `${subdimension.subdimensionId}.valueIds`, `${valueId} does not point back to this dimension and subdimension`);
        }
      });
    });
  });
  anatomy.values.forEach((item) => {
    ensureRefs(errors, item.valueId, [item.dimensionId], dimensionIds);
    const dimension = dimensionsById.get(item.dimensionId);
    if (dimension && !dimension.valueIds.includes(item.valueId)) {
      add(errors, item.valueId, `missing dimension backlink from ${item.dimensionId}`);
    }
    if (item.subdimensionId) {
      const subdimension = dimension?.subdimensions.find((candidate) => candidate.subdimensionId === item.subdimensionId);
      if (!subdimension) {
        add(errors, item.valueId, `references unknown subdimension ${item.subdimensionId} in ${item.dimensionId}`);
      } else if (!subdimension.valueIds.includes(item.valueId)) {
        add(errors, item.valueId, `missing subdimension backlink from ${item.subdimensionId}`);
      }
    }
  });
  anatomy.examples.forEach((item) => {
    ensureRefs(errors, item.exampleId, [item.targetValueId], valueIds);
    ensureRefs(errors, item.exampleId, [item.assetId], assetIds);
    const digest = createHash("sha256").update(item.exactPrompt).digest("hex");
    if (digest !== item.exactPromptSha256) add(errors, item.exampleId, "exact prompt hash mismatch");
  });
  anatomy.comparisonSets.forEach((item) => {
    ensureRefs(errors, item.comparisonSetId, [item.dimensionId], dimensionIds);
    const comparedValueIds = [...item.coreValueIds, ...(item.participantValueIds ?? [])];
    ensureRefs(errors, item.comparisonSetId, comparedValueIds, valueIds);
    comparedValueIds.forEach((valueId) => {
      const value = valuesById.get(valueId);
      if (value && value.dimensionId !== item.dimensionId) {
        add(errors, item.comparisonSetId, `${valueId} belongs to dimension ${value.dimensionId}, not ${item.dimensionId}`);
      }
    });
  });
  anatomy.legacyReferenceMigrations.forEach((item) => {
    ensureRefs(errors, item.legacyReferenceId, [item.dimensionId], dimensionIds);
    ensureRefs(errors, item.legacyReferenceId, [item.targetValueId], valueIds);
    const value = valuesById.get(item.targetValueId);
    if (value && value.dimensionId !== item.dimensionId) {
      add(errors, item.legacyReferenceId, `${item.targetValueId} belongs to dimension ${value.dimensionId}, not ${item.dimensionId}`);
    }
  });

  if (styleAssets.referenceAssets.length !== 15) add(errors, "styleAssets.referenceAssets", "must contain 15 accepted assets");
  if (anatomyAssets.assets.length !== 600) add(errors, "anatomyAssets.assets", "must contain 600 accepted assets");
  if (verifyAssets) {
    for (const item of styleAssets.referenceAssets) {
      const path = fromRoot(`public/media/style-v2/${item.relativePath}`);
      try {
        await access(path);
        if (await shaFile(path) !== item.sha256) add(errors, item.assetId, "asset sha256 mismatch");
      } catch {
        add(errors, item.assetId, "asset file is missing");
      }
      const thumbnail = fromRoot(styleThumbnailPath(item.relativePath));
      try {
        const metadata = await stat(thumbnail);
        if (metadata.size > 250_000) add(errors, item.assetId, "derived thumbnail exceeds 250 KB");
      } catch {
        add(errors, item.assetId, "derived thumbnail is missing");
      }
    }
    for (const item of anatomyAssets.assets) {
      const path = fromRoot(`public/media/anatomy-v2/${item.path}`);
      try {
        await access(path);
        if (await shaFile(path) !== item.sha256) add(errors, item.assetId, "asset sha256 mismatch");
      } catch {
        add(errors, item.assetId, "asset file is missing");
      }
    }
  }
  return { valid: errors.length === 0, errors, root };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await validateV2Content();
  if (!result.valid) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log("Style Library V2 and Image Anatomy V2 validation passed (615 assets). ");
  }
}
