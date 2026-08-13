const baseUrl = new URL(process.env.PRODUCTION_BASE_URL ?? "https://prompt-atlas.ldktech.com");
const expectedHost = "prompt-atlas.ldktech.com";
const retiredHost = "image-styles.ldktech.com";
const servingHost = baseUrl.hostname;

if (
  servingHost !== expectedHost
  && servingHost !== "prompt-atlas-6p0.pages.dev"
  && !servingHost.endsWith(".prompt-atlas-6p0.pages.dev")
) {
  throw new Error("Production smoke must target the canonical host or a Prompt Atlas Pages deployment, received " + servingHost);
}

async function fetchOk(url, expectedType, options = {}) {
  const response = await fetch(url, { redirect: "error", ...options });
  if (!response.ok) throw new Error(url + ": expected 2xx, received " + response.status);
  const contentType = response.headers.get("content-type") ?? "";
  if (expectedType && !contentType.includes(expectedType)) {
    throw new Error(url + ": expected " + expectedType + ", received " + (contentType || "no content-type"));
  }
  return response;
}

function collectAssetUrls(html, attributePattern) {
  return [...html.matchAll(attributePattern)]
    .map((match) => new URL(match[1], baseUrl))
    .filter((url) => url.hostname === servingHost);
}

const stylesheets = new Map();
const scripts = new Map();
const coreRoutes = ["/", "/discover/", "/composer/", "/compare/", "/methodology/", "/styles/sumi-e/"];

for (const pathname of coreRoutes) {
  const url = new URL(pathname, baseUrl);
  const html = await (await fetchOk(url, "text/html")).text();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1];
  if (!canonical || new URL(canonical).hostname !== expectedHost) {
    throw new Error(url + ": missing canonical for " + expectedHost);
  }
  if (html.includes(retiredHost)) throw new Error(url + ": contains retired hostname " + retiredHost);

  for (const asset of collectAssetUrls(html, /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gu)) {
    stylesheets.set(asset.href, asset);
  }
  for (const asset of collectAssetUrls(html, /<script[^>]+src=["']([^"']+)["']/gu)) {
    scripts.set(asset.href, asset);
  }
}

if (stylesheets.size === 0) throw new Error("core routes reference no external stylesheet");
if (scripts.size === 0) throw new Error("core routes reference no external JavaScript module");

const fontAssets = new Map();
for (const stylesheet of stylesheets.values()) {
  const css = await (await fetchOk(stylesheet, "text/css")).text();
  for (const match of css.matchAll(/url\((?:["']?)([^"')]+\.woff2?)(?:["']?)\)/gu)) {
    const font = new URL(match[1], stylesheet);
    if (font.hostname === servingHost) fontAssets.set(font.href, font);
  }
}

await Promise.all([...scripts.values()].map((url) => fetchOk(url, "javascript", { method: "HEAD" })));
await Promise.all([...fontAssets.values()].map((url) => fetchOk(url, "font/", { method: "HEAD" })));

const robots = await (await fetchOk(new URL("/robots.txt", baseUrl), "text/plain")).text();
if (!robots.includes("https://" + expectedHost + "/sitemap-index.xml") || robots.includes(retiredHost)) {
  throw new Error("robots.txt does not declare the sole production sitemap");
}

const sitemapIndex = await (await fetchOk(new URL("/sitemap-index.xml", baseUrl), "xml")).text();
const childSitemaps = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
if (childSitemaps.length === 0) throw new Error("sitemap index contains no child sitemap");

const routeUrls = [];
for (const childUrl of childSitemaps) {
  const sitemap = await (
    await fetchOk(new URL(new URL(childUrl).pathname, baseUrl), "xml")
  ).text();
  routeUrls.push(...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]));
}
if (routeUrls.length < 95) throw new Error("expected at least 95 published routes, received " + routeUrls.length);
if (routeUrls.some((url) => new URL(url).hostname !== expectedHost)) {
  throw new Error("sitemap contains a non-production hostname");
}

for (let offset = 0; offset < routeUrls.length; offset += 10) {
  await Promise.all(routeUrls.slice(offset, offset + 10).map((url) => (
    fetchOk(new URL(new URL(url).pathname, baseUrl), "text/html", { method: "HEAD" })
  )));
}

await Promise.all([
  fetchOk(new URL("/media/og-cover.webp", baseUrl), "image/webp", { method: "HEAD" }),
  fetchOk(new URL("/media/styles/sumi-e-chatgpt.webp", baseUrl), "image/webp", { method: "HEAD" }),
  fetchOk(new URL("/media/primitives/001-primitive-subject-role.webp", baseUrl), "image/webp", { method: "HEAD" }),
]);

console.log(JSON.stringify({
  valid: true,
  baseUrl: baseUrl.origin,
  coreRoutes: coreRoutes.length,
  sitemapRoutes: routeUrls.length,
  mediaChecks: 3,
  stylesheetChecks: stylesheets.size,
  scriptChecks: scripts.size,
  fontChecks: fontAssets.size,
}, null, 2));
