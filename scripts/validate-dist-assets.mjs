import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const productionOrigin = "https://prompt-atlas.ldktech.com";

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function localAssetPath(reference, basePath = "/") {
  reference = reference.trim().replace(/^["']|["']$/gu, "");
  if (reference.startsWith("#") || reference.startsWith("data:")) return null;
  const url = new URL(reference, new URL(basePath, productionOrigin));
  if (url.origin !== productionOrigin || !url.pathname.startsWith("/_astro/")) return null;
  const decodedPath = decodeURIComponent(url.pathname.slice(1));
  if (decodedPath.includes("/#")) return null;
  return decodedPath;
}

const files = await walk(dist);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
if (htmlFiles.length === 0) throw new Error("dist contains no HTML files");

const assetPaths = new Set();
for (const htmlFile of htmlFiles) {
  const html = await fs.readFile(htmlFile, "utf8");
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gu)) {
    const assetPath = localAssetPath(match[1], "/" + path.relative(dist, htmlFile));
    if (assetPath) assetPaths.add(assetPath);
  }
}

for (const stylesheet of [...assetPaths].filter((file) => file.endsWith(".css"))) {
  const css = await fs.readFile(path.join(dist, stylesheet), "utf8");
  for (const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/gu)) {
    const assetPath = localAssetPath(match[1], "/" + stylesheet);
    if (assetPath) assetPaths.add(assetPath);
  }
}

if (![...assetPaths].some((file) => file.endsWith(".css"))) {
  throw new Error("dist HTML does not reference an Astro stylesheet");
}
if (![...assetPaths].some((file) => file.endsWith(".js"))) {
  throw new Error("dist HTML does not reference an Astro JavaScript module");
}

for (const assetPath of assetPaths) {
  const absolute = path.resolve(dist, assetPath);
  if (!absolute.startsWith(dist + path.sep)) throw new Error("unsafe asset path: " + assetPath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size === 0) throw new Error("missing or empty build asset: /" + assetPath);
}

console.log(JSON.stringify({
  valid: true,
  htmlFiles: htmlFiles.length,
  astroAssets: assetPaths.size,
  stylesheets: [...assetPaths].filter((file) => file.endsWith(".css")).length,
  scripts: [...assetPaths].filter((file) => file.endsWith(".js")).length,
  fonts: [...assetPaths].filter((file) => /\.woff2?$/u.test(file)).length,
}, null, 2));
