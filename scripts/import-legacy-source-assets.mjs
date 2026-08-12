import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASED_AT = "2026-08-12T00:00:00Z";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const padId = (id) => String(id).padStart(3, "0");

const routeDefinitions = {
  chatgpt: {
    productRouteId: "legacy-chatgpt-ui",
    directory: "imagegen",
    extension: "png",
    mimeType: "image/png",
  },
  gemini: {
    productRouteId: "legacy-gflow-cli",
    directory: "gflow-cli",
    extension: "jpg",
    mimeType: "image/jpeg",
  },
};

export async function importLegacySourceAssets({ sourceRoot }) {
  const styles = JSON.parse(await readFile(path.join(repositoryRoot, "src/data/styles.json"), "utf8"));
  if (styles.length !== 90) throw new Error(`expected 90 legacy styles, received ${styles.length}`);

  const assets = [];
  for (const style of styles) {
    for (const [routeKey, route] of Object.entries(routeDefinitions)) {
      const filename = `${padId(style.id)}-${style.slug}.${route.extension}`;
      const absolutePath = path.join(sourceRoot, route.directory, filename);
      const [buffer, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
      assets.push({
        id: `source.${style.slug}.${routeKey}`,
        recipeId: `recipe.style.${style.slug}`,
        productRouteId: route.productRouteId,
        originalPath: `output/${route.directory}/${filename}`,
        mimeType: route.mimeType,
        bytes: metadata.size,
        sha256: sha256(buffer),
        capturedAt: "2026-08-11T00:00:00Z",
        availability: "project-archive",
      });
    }
  }

  return {
    schemaVersion: "1.0.0",
    importedAt: RELEASED_AT,
    sourceRootLabel: "Prompt Atlas legacy generation archive",
    assets,
  };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const sourceRootFlagIndex = process.argv.indexOf("--source-root");
  const outputFlagIndex = process.argv.indexOf("--output");
  const sourceRoot = path.resolve(
    sourceRootFlagIndex >= 0 ? process.argv[sourceRootFlagIndex + 1] : path.join(repositoryRoot, "..", "output"),
  );
  const output = path.resolve(
    outputFlagIndex >= 0
      ? process.argv[outputFlagIndex + 1]
      : path.join(repositoryRoot, "src/data/legacy-source-assets.v1.json"),
  );
  const manifest = await importLegacySourceAssets({ sourceRoot });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ valid: true, output, assetCount: manifest.assets.length }, null, 2)}\n`);
}
