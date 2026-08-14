import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
const providerColours = /#(?:c94828|3157ff)/iu;
const forbiddenSvgFeatures = /<(?:text|linearGradient|radialGradient|filter|mask)\b|font-family|\bopacity=/iu;
const approvedCoreColours = new Set(["#121311", "#d8ff45", "#f1eee6"]);

const variants = [
  "public/brand/prompt-atlas-mark-primary.svg",
  "public/brand/prompt-atlas-mark-reverse.svg",
  "public/brand/prompt-atlas-mark-mono.svg",
  "public/brand/prompt-atlas-favicon-16.svg",
  "public/brand/prompt-atlas-favicon-32.svg",
  "public/brand/prompt-atlas-favicon-64.svg",
  "public/favicon.svg",
];

test("brand SVG variants are provider-neutral flat geometry on the 64-unit grid", async () => {
  for (const relativePath of variants) {
    const svg = await read(relativePath);
    assert.match(svg, /viewBox="0 0 64 64"/u, `${relativePath} must use the master grid`);
    assert.doesNotMatch(svg, providerColours, `${relativePath} contains a provider colour`);
    assert.doesNotMatch(svg, forbiddenSvgFeatures, `${relativePath} contains a forbidden SVG feature`);
    assert.doesNotMatch(svg, /\d+\.\d+/u, `${relativePath} must stay on integer-aligned geometry`);
    assert.match(svg, /<(?:rect|path)\b/u, `${relativePath} must contain vector geometry`);
    for (const colour of svg.match(/#[\da-f]{6}/giu) ?? []) {
      assert.equal(approvedCoreColours.has(colour.toLowerCase()), true, `${relativePath} contains ${colour}`);
    }
  }

  const mono = await read("public/brand/prompt-atlas-mark-mono.svg");
  assert.doesNotMatch(mono, /#(?:f1eee6|d8ff45)/iu, "monochrome mark must use ink only");
});

test("active header, favicon, manifest and structured metadata use the approved mark", async () => {
  const [header, layout, manifest] = await Promise.all([
    read("src/components/SiteHeader.astro"),
    read("src/layouts/BaseLayout.astro"),
    read("public/site.webmanifest"),
  ]);

  assert.match(header, /aria-label="Prompt Atlas — trang chủ"/u);
  assert.match(header, /src="\/brand\/prompt-atlas-mark-reverse\.svg"/u);
  assert.match(header, /<strong>PROMPT ATLAS<\/strong>/u);
  assert.match(header, /<small>BY LDKTECH<\/small>/u);
  assert.doesNotMatch(header, providerColours);

  assert.match(layout, /rel="icon" href="\/favicon\.svg"/u);
  assert.match(layout, /rel="manifest" href="\/site\.webmanifest"/u);
  assert.match(layout, /\/brand\/prompt-atlas-mark-primary\.svg/u);
  assert.match(manifest, /"src": "\/brand\/prompt-atlas-favicon-64\.svg"/u);
  assert.doesNotMatch(manifest, providerColours);
  assert.doesNotMatch(`${header}\n${layout}\n${manifest}`, /legacy\/favicon-provider-split/u);
});

test("OG identity is learning-first and the former favicon remains recoverable only as legacy", async () => {
  const [builder, mediaManifest, legacy] = await Promise.all([
    read("scripts/build-og-cover.mjs"),
    read("public/media/manifest.json"),
    read("public/brand/legacy/favicon-provider-split.svg"),
  ]);

  assert.match(builder, /OUTPUT → PROMPT → COMPOSE/u);
  assert.match(builder, /Output\/Prompt Plate/u);
  assert.doesNotMatch(builder, /ChatGPT × Gemini/u);
  assert.doesNotMatch(builder, providerColours);
  assert.match(mediaManifest, /Nhìn output trước, hiểu prompt/u);
  assert.match(legacy, providerColours);

  const ogEntry = JSON.parse(mediaManifest).assets.find((asset) => asset.file === "og-cover.webp");
  const ogStat = await fs.stat(path.join(root, "public/media/og-cover.webp"));
  assert.equal(ogEntry.bytes, ogStat.size, "OG manifest byte count must match the generated asset");
});
