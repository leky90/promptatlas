import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let dist;

const requiredHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "content-security-policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

function parseGlobalHeaders(source) {
  const lines = source.split(/\r?\n/u);
  const wildcardIndex = lines.findIndex((line) => line.trim() === "/*");
  assert.notEqual(wildcardIndex, -1, "Cloudflare Pages must define a global /* header rule");

  const headers = new Map();
  for (const line of lines.slice(wildcardIndex + 1)) {
    if (!/^\s+/u.test(line)) break;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return headers;
}

function parseRouteBlocks(source) {
  const blocks = new Map();
  let route;

  for (const line of source.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    if (!/^\s/u.test(line)) {
      route = line.trim();
      assert.equal(blocks.has(route), false, `duplicate Cloudflare Pages route block: ${route}`);
      blocks.set(route, new Map());
      continue;
    }
    if (!route) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    blocks.get(route).set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return blocks;
}

function cacheControlDirectives(value) {
  return value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
}

before(async () => {
  dist = await mkdtemp(path.join(tmpdir(), "ldk-738-runtime-"));
  execFileSync(path.join(root, "node_modules", ".bin", "astro"), ["build", "--outDir", dist], {
    cwd: root,
    stdio: "pipe",
  });
});

after(async () => {
  await rm(dist, { recursive: true, force: true });
});

test("the dedicated health endpoint exposes only the documented safe response", async () => {
  const raw = await readFile(path.join(dist, "health.json"), "utf8");
  assert.equal(raw, '{"status":"ok"}\n');
  assert.deepEqual(JSON.parse(raw), { status: "ok" });
});

test("Review publishes complete default Open Graph and Twitter metadata", async () => {
  const html = await readFile(path.join(dist, "review", "index.html"), "utf8");
  const required = [
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="vi_VN">',
    '<meta property="og:site_name" content="Prompt Atlas by LDKTech">',
    '<meta property="og:title" content="Không gian blind review ảnh | Prompt Atlas">',
    '<meta property="og:description" content="Workspace review ảnh A/B/N trung tính với scoring theo dimension, evidence vùng ảnh, confidence và adjudication append-only.">',
    '<meta property="og:url" content="https://prompt-atlas.ldktech.com/review/">',
    '<meta property="og:image" content="https://prompt-atlas.ldktech.com/media/og-cover.webp">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Không gian blind review ảnh | Prompt Atlas">',
    '<meta name="twitter:description" content="Workspace review ảnh A/B/N trung tính với scoring theo dimension, evidence vùng ảnh, confidence và adjudication append-only.">',
    '<meta name="twitter:image" content="https://prompt-atlas.ldktech.com/media/og-cover.webp">',
    '<link rel="canonical" href="https://prompt-atlas.ldktech.com/review/">',
  ];

  for (const tag of required) assert.equal(html.includes(tag), true, `Review is missing ${tag}`);
});

test("the static source keeps the accepted custom-500 boundary and custom 404", async () => {
  await access(path.join(dist, "404.html"));
  await assert.rejects(access(path.join(dist, "500.html")));
  await assert.rejects(access(path.join(root, "src", "pages", "500.astro")));
});

test("Cloudflare Pages applies the required baseline headers to every route", async () => {
  const source = await readFile(path.join(dist, "_headers"), "utf8");
  const actual = parseGlobalHeaders(source);

  for (const [name, value] of Object.entries(requiredHeaders)) {
    assert.equal(actual.get(name), value, `${name} must match the approved baseline`);
  }
});

test("Cloudflare Pages gives immutable caching only to Astro hashed assets", async () => {
  const source = await readFile(path.join(dist, "_headers"), "utf8");
  const blocks = parseRouteBlocks(source);
  const lines = source.split(/\r?\n/u);
  const assetIndex = lines.findIndex((line) => line.trim() === "/_astro/*");
  assert.notEqual(assetIndex, -1, "Cloudflare Pages must define a hashed-asset header rule");
  assert.equal(
    lines[assetIndex + 1]?.trim(),
    "Cache-Control: public, max-age=31536000, immutable",
    "content-hashed Astro assets must be long-lived and immutable",
  );
  assert.deepEqual(
    [...blocks]
      .filter(([, headers]) => cacheControlDirectives(headers.get("cache-control") ?? "").includes("immutable"))
      .map(([route]) => route),
    ["/_astro/*"],
    "immutable caching must not apply to stable routes",
  );

  const healthIndex = lines.findIndex((line) => line.trim() === "/health.json");
  assert.notEqual(healthIndex, -1, "the health contract must have an explicit cache rule");
  assert.equal(lines[healthIndex + 1]?.trim(), "Cache-Control: no-store");
  assert.equal(lines[healthIndex + 2]?.trim(), "Content-Type: application/json; charset=utf-8");
});
