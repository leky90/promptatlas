import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
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

export async function validateV2Content({ verifyAssets = true } = {}) {
  const [styleSchema, anatomySchema, style, styleAssets, anatomy, anatomyAssets, legacy, lock] = await Promise.all([
    readJson("schemas/prompt-atlas.style-library.v2.schema.json"),
    readJson("schemas/prompt-atlas.image-anatomy.v2.schema.json"),
    readJson("src/data/style-library.v2.json"),
    readJson("src/data/style-library-v2-assets.json"),
    readJson("src/data/image-anatomy.v2.json"),
    readJson("src/data/image-anatomy-v2-assets.json"),
    readJson("src/data/styles.json"),
    readJson("src/data/v2-content-lock.json"),
  ]);
  const errors = [];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const [path, schema, value] of [["style", styleSchema, style], ["anatomy", anatomySchema, anatomy]]) {
    const validate = ajv.compile(schema);
    if (!validate(value)) validate.errors.forEach((error) => add(errors, `${path}${error.instancePath}`, error.message ?? "schema violation"));
  }

  for (const [name, source] of Object.entries(lock.sources)) {
    const digest = await shaFile(fromRoot(source.path));
    if (digest !== source.sha256) add(errors, `lock.sources.${name}`, `sha256 mismatch: ${digest}`);
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
  if (new Set(concepts.map((item) => item.primaryFacet)).size !== 7) add(errors, "style.registry.canonicalConcepts", "must expose exactly seven primary facets");
  recipes.forEach((item) => ensureRefs(errors, item.recipeId, item.componentConceptIds, conceptIds));
  style.migrationManifest.forEach((item, index) => {
    const source = legacy[index];
    if (!targets.has(item.targetId)) add(errors, `style.migrationManifest.${index}.targetId`, `unknown target ${item.targetId}`);
    if (!source || source.id !== item.legacyId || source.slug !== item.legacySlug || source.sourcePrompt !== item.exactSourcePrompt) {
      add(errors, `style.migrationManifest.${index}`, "legacy ID, URL or exact source prompt drifted");
    }
  });

  const categoryIds = new Set(anatomy.categories.map((item) => item.categoryId));
  const dimensionIds = new Set(anatomy.dimensions.map((item) => item.dimensionId));
  const valueIds = new Set(anatomy.values.map((item) => item.valueId));
  const assetIds = new Set(anatomyAssets.assets.map((item) => item.assetId));
  unique(errors, "anatomy.categories", [...categoryIds]);
  unique(errors, "anatomy.dimensions", [...dimensionIds]);
  unique(errors, "anatomy.values", [...valueIds]);
  unique(errors, "anatomy.examples", anatomy.examples.map((item) => item.exampleId));
  unique(errors, "anatomy.assets", [...assetIds]);
  anatomy.categories.forEach((item) => ensureRefs(errors, item.categoryId, item.dimensionIds, dimensionIds));
  anatomy.dimensions.forEach((item) => {
    ensureRefs(errors, item.dimensionId, [item.categoryId], categoryIds);
    ensureRefs(errors, item.dimensionId, item.valueIds, valueIds);
  });
  anatomy.values.forEach((item) => ensureRefs(errors, item.valueId, [item.dimensionId], dimensionIds));
  anatomy.examples.forEach((item) => {
    ensureRefs(errors, item.exampleId, [item.targetValueId], valueIds);
    ensureRefs(errors, item.exampleId, [item.assetId], assetIds);
    const digest = createHash("sha256").update(item.exactPrompt).digest("hex");
    if (digest !== item.exactPromptSha256) add(errors, item.exampleId, "exact prompt hash mismatch");
  });
  anatomy.comparisonSets.forEach((item) => {
    ensureRefs(errors, item.comparisonSetId, [item.dimensionId], dimensionIds);
    ensureRefs(errors, item.comparisonSetId, [...item.coreValueIds, ...(item.participantValueIds ?? [])], valueIds);
  });
  anatomy.legacyReferenceMigrations.forEach((item) => {
    ensureRefs(errors, item.legacyReferenceId, [item.dimensionId], dimensionIds);
    ensureRefs(errors, item.legacyReferenceId, [item.targetValueId], valueIds);
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
