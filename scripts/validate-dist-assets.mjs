import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(root, "dist");
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

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1].trim());
}

function canonicalHref(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const tag = match[0];
    if (!/\brel=["']canonical["']/iu.test(tag)) continue;
    return tag.match(/\bhref=["']([^"']+)["']/iu)?.[1];
  }
  return undefined;
}

function safeDistPath(relativePath) {
  const absolute = path.resolve(dist, relativePath);
  if (absolute !== dist && !absolute.startsWith(dist + path.sep)) {
    throw new Error("unsafe sitemap path: " + relativePath);
  }
  return absolute;
}

async function isFile(file) {
  try {
    return (await fs.stat(file)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function directHtmlPath(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (url.search || url.hash) return null;
  if (pathname === "/") return "index.html";
  if (pathname.endsWith("/")) return path.join(pathname.slice(1), "index.html");
  if (pathname.endsWith(".html")) return pathname.slice(1);
  return null;
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

const sitemapIndexPath = path.join(dist, "sitemap-index.xml");
if (!await isFile(sitemapIndexPath)) throw new Error("dist contains no sitemap index");
const sitemapUrls = locations(await fs.readFile(sitemapIndexPath, "utf8"));
if (sitemapUrls.length === 0) throw new Error("sitemap index contains no child sitemap");

const routeUrls = [];
for (const sitemapReference of sitemapUrls) {
  const sitemapUrl = new URL(sitemapReference);
  if (sitemapUrl.origin !== productionOrigin) throw new Error("sitemap index contains a non-production URL: " + sitemapReference);
  const sitemapPath = safeDistPath(decodeURIComponent(sitemapUrl.pathname).slice(1));
  if (!await isFile(sitemapPath)) throw new Error("missing child sitemap: " + sitemapUrl.pathname);
  routeUrls.push(...locations(await fs.readFile(sitemapPath, "utf8")));
}
if (routeUrls.length === 0) throw new Error("sitemap contains no routes");
if (new Set(routeUrls).size !== routeUrls.length) throw new Error("sitemap contains duplicate routes");

for (const routeReference of routeUrls) {
  const routeUrl = new URL(routeReference);
  if (routeUrl.origin !== productionOrigin) throw new Error("sitemap contains a non-production URL: " + routeReference);
  const htmlPath = directHtmlPath(routeUrl);
  if (!htmlPath || !await isFile(safeDistPath(htmlPath))) {
    throw new Error("sitemap route is not directly served: " + routeUrl.pathname);
  }
  const html = await fs.readFile(safeDistPath(htmlPath), "utf8");
  const canonical = canonicalHref(html);
  if (!canonical || new URL(canonical, routeUrl).href !== routeUrl.href) {
    throw new Error("sitemap canonical mismatch: " + routeUrl.pathname);
  }
}

console.log(JSON.stringify({
  valid: true,
  htmlFiles: htmlFiles.length,
  astroAssets: assetPaths.size,
  stylesheets: [...assetPaths].filter((file) => file.endsWith(".css")).length,
  scripts: [...assetPaths].filter((file) => file.endsWith(".js")).length,
  fonts: [...assetPaths].filter((file) => /\.woff2?$/u.test(file)).length,
  sitemapRoutes: routeUrls.length,
}, null, 2));
