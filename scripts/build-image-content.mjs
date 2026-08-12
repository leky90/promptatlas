import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASED_AT = "2026-08-12T00:00:00Z";
const DATASET_VERSION = "1.0.0";
const TAXONOMY_VERSION = "1.0.0-draft.2";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const sha256Text = (value) => sha256(Buffer.from(value, "utf8"));

const productRoutes = {
  chatgpt: {
    id: "legacy-chatgpt-ui",
    displayName: "ChatGPT image generation (legacy atlas)",
    provider: "OpenAI",
    interface: "chatgpt-ui",
    identityStatus: "legacy-label",
    modelFamily: "ChatGPT image generation",
    modelVersion: {
      status: "unavailable",
      source: "not-exposed-by-legacy-ui",
      reason: "The historical UI run did not expose an immutable model version.",
    },
  },
  gemini: {
    id: "legacy-gflow-cli",
    displayName: "Gemini image generation through gflow-cli (legacy atlas)",
    provider: "Google",
    interface: "legacy-cli",
    identityStatus: "legacy-label",
    modelFamily: "Gemini image generation",
    modelVersion: {
      status: "provider-alias",
      identifier: "legacy-gflow-gemini-image-route",
      source: "legacy-generation-summary",
    },
  },
};

const provenance = (sourceType, sourceReference) => ({
  sourceType,
  author: "LDKTech",
  createdAt: RELEASED_AT,
  updatedAt: RELEASED_AT,
  sourceReference,
});

const rights = (assetPath) => ({
  license: {
    id: "LDKTech project use",
    version: "1.0.0",
    scope: "Prompt Atlas website, research comparison and derived thumbnails",
    proof: {
      type: "project-manifest",
      reference: `public/media/manifest.json#${assetPath}`,
      verifiedAt: RELEASED_AT,
    },
  },
  consent: {
    required: false,
    status: "not-required",
    basis: "Synthetic image output; no real-person identity claim is attached to the asset.",
  },
  restrictions: ["retain-provenance", "no-third-party-identity-claim"],
  retention: {
    policy: "until-replaced",
    reviewAt: "2027-08-12T00:00:00Z",
  },
  takedown: { status: "active" },
});

async function publishedAsset(style, routeKey, sourceAsset) {
  const image = style.images[routeKey];
  const fullPath = path.join(repositoryRoot, "public", image.full);
  const thumbnailPath = path.join(repositoryRoot, "public", image.thumb);
  const [fullBuffer, thumbnailBuffer, fullStat] = await Promise.all([
    readFile(fullPath),
    readFile(thumbnailPath),
    stat(fullPath),
  ]);
  return {
    id: `asset.${style.slug}.${routeKey}`,
    recipeId: `recipe.style.${style.slug}`,
    productRouteId: productRoutes[routeKey].id,
    sourceAssetId: sourceAsset.id,
    kind: "image",
    path: image.full,
    mimeType: "image/webp",
    width: image.width,
    height: image.height,
    bytes: fullStat.size,
    sha256: sha256(fullBuffer),
    thumbnail: {
      path: image.thumb,
      width: 560,
      height: 373,
      sha256: sha256(thumbnailBuffer),
    },
    alt: {
      vi: `${style.title} — kết quả từ ${productRoutes[routeKey].displayName}.`,
      en: `${style.name} — output from ${productRoutes[routeKey].displayName}.`,
    },
    rights: rights(image.full),
    provenance: provenance("derived", sourceAsset.originalPath),
  };
}

export async function buildImageContentDataset() {
  const [stylesBuffer, sourceManifestBuffer, mediaManifestBuffer] = await Promise.all([
    readFile(path.join(repositoryRoot, "src/data/styles.json")),
    readFile(path.join(repositoryRoot, "src/data/legacy-source-assets.v1.json")),
    readFile(path.join(repositoryRoot, "public/media/manifest.json")),
  ]);
  const styles = JSON.parse(stylesBuffer);
  const sourceManifest = JSON.parse(sourceManifestBuffer);
  const mediaManifest = JSON.parse(mediaManifestBuffer);

  if (styles.length !== 90) throw new Error(`expected 90 styles, received ${styles.length}`);
  if (sourceManifest.assets.length !== styles.length * 2) {
    throw new Error(`expected ${styles.length * 2} source assets, received ${sourceManifest.assets.length}`);
  }

  const manifestFiles = new Set(mediaManifest.assets.map((item) => item.file));
  const sourceByKey = new Map(
    sourceManifest.assets.map((item) => [`${item.recipeId}:${item.productRouteId}`, item]),
  );
  const stylePrimitives = [];
  const recipes = [];
  const assets = [];
  const generationRuns = [];
  const legacyRoutes = [];

  for (const style of styles) {
    const primitiveId = `primitive.style.${style.slug}`;
    const recipeId = `recipe.style.${style.slug}`;
    stylePrimitives.push({
      id: primitiveId,
      version: "1.0.0",
      legacyId: style.id,
      slug: style.slug,
      label: { vi: style.title, en: style.name },
      family: style.family,
      definition: {
        vi: style.summary,
        en: `${style.name} is identified by ${style.cues.join(", ")}.`,
      },
      cues: style.cues,
      promptFragment: {
        language: "en",
        text: `Style/medium: ${style.name}. The defining visual language, medium, materials, and mark-making must be unmistakable and dominant.`,
      },
      provenance: provenance("migrated", "src/data/styles.json"),
    });
    recipes.push({
      id: recipeId,
      version: "1.0.0",
      slug: style.slug,
      status: "active",
      primitiveIds: [primitiveId],
      sourcePrompt: style.sourcePrompt,
      generationPrompt: style.generationPrompt,
      outputSpec: { mediaType: "image", requestedAspectRatio: "3:2" },
      provenance: provenance("migrated", "src/data/styles.json"),
    });
    legacyRoutes.push({
      legacyId: style.id,
      slug: style.slug,
      route: `/styles/${style.slug}/`,
      recipeId,
      status: "preserved",
    });

    for (const routeKey of ["chatgpt", "gemini"]) {
      const route = productRoutes[routeKey];
      const sourceAsset = sourceByKey.get(`${recipeId}:${route.id}`);
      if (!sourceAsset) throw new Error(`missing source asset for ${recipeId} / ${route.id}`);
      const asset = await publishedAsset(style, routeKey, sourceAsset);
      const manifestFile = asset.path.replace(/^\/media\//, "");
      const thumbnailManifestFile = asset.thumbnail.path.replace(/^\/media\//, "");
      if (!manifestFiles.has(manifestFile) || !manifestFiles.has(thumbnailManifestFile)) {
        throw new Error(`media manifest does not prove ${asset.path} and its thumbnail`);
      }
      assets.push(asset);
      generationRuns.push({
        id: `run.${style.slug}.${routeKey}.r1`,
        recipeId,
        recipeVersion: "1.0.0",
        datasetVersion: DATASET_VERSION,
        productRoute: route,
        exactPrompt: {
          language: "en",
          text: style.generationPrompt,
          sha256: sha256Text(style.generationPrompt),
        },
        settings: [
          {
            name: "aspect-ratio",
            requestedValue: "3:2",
            supportStatus: "unknown",
            note: "The legacy run did not expose a trustworthy applied-settings snapshot.",
          },
        ],
        startedAt: "2026-08-11T00:00:00Z",
        completedAt: "2026-08-11T00:00:00Z",
        attempt: 1,
        selectionPolicy: "legacy-selected-output",
        originalAssetIds: [sourceAsset.id],
        outputAssetIds: [asset.id],
        moderation: {
          status: "not-reported",
          categories: [],
          note: "Moderation metadata was not retained in the legacy generation record.",
        },
        outcome: "success",
        quotaUsage: {
          mode: "not-recorded",
          apiCostUsd: 0,
          note: "Historical product-route output; no API charge is attributed or assumed.",
        },
        provenance: provenance("migrated", sourceAsset.originalPath),
      });
    }
  }

  return {
    $schema: "../../schemas/prompt-atlas.image.v1.schema.json",
    schemaVersion: "1.0.0",
    taxonomyVersion: TAXONOMY_VERSION,
    datasetVersion: DATASET_VERSION,
    releasedAt: RELEASED_AT,
    apiAdaptersEnabled: false,
    sourceDataset: {
      path: "src/data/styles.json",
      sha256: sha256(stylesBuffer),
      recordCount: styles.length,
    },
    stylePrimitives,
    recipes,
    sourceAssets: sourceManifest.assets,
    assets,
    generationRuns,
    legacyRoutes,
  };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const output = path.join(repositoryRoot, "src/data/prompt-atlas.image.v1.json");
  const dataset = await buildImageContentDataset();
  const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(output, "utf8").catch(() => "");
    if (current !== serialized) {
      throw new Error("canonical image dataset is stale; run npm run build:image-data");
    }
  } else {
    await writeFile(output, serialized);
  }
  process.stdout.write(`${JSON.stringify({
    valid: true,
    mode: process.argv.includes("--check") ? "check" : "write",
    styles: dataset.stylePrimitives.length,
    assets: dataset.assets.length,
    runs: dataset.generationRuns.length,
    legacyRoutes: dataset.legacyRoutes.length,
  }, null, 2)}\n`);
}
