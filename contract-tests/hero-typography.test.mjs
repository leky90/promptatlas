import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared hero typography exposes the approved semantic variants", async () => {
  const css = await read("src/styles/hero-typography.css");
  for (const selector of [
    ".hero-title",
    ".hero-title--contrast",
    ".hero-title--concept",
    ".hero-title--action",
    ".hero-title--focus",
  ]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(css, /font-synthesis:\s*none/u);
  assert.match(css, /line-break:\s*strict/u);
  assert.match(css, /text-wrap:\s*balance/u);
});

test("both document shells load the shared hero contract and true italic face", async () => {
  const [baseLayout, review] = await Promise.all([
    read("src/layouts/BaseLayout.astro"),
    read("src/pages/review.astro"),
  ]);
  for (const source of [baseLayout, review]) {
    assert.match(source, /instrument-sans\/wght-italic\.css/u);
    assert.match(source, /styles\/hero-typography\.css/u);
  }
});

test("each Atlas hero opts into exactly one approved variant", async () => {
  const routes = [
    ["src/pages/index.astro", "contrast"],
    ["src/pages/discover.astro", "concept"],
    ["src/pages/anatomy/index.astro", "concept"],
    ["src/pages/compare.astro", "contrast"],
    ["src/components/ComposerWorkspace.astro", "action"],
  ];

  for (const [path, variant] of routes) {
    const source = await read(path);
    assert.match(source, new RegExp(`hero-title hero-title--${variant}`));
    assert.equal((source.match(/<em>/gu) ?? []).length, 1, path);
  }
});

test("the Atlas homepage keeps the shared hero font at mobile widths", async () => {
  const css = await read("src/styles/global.css");
  assert.doesNotMatch(
    css,
    /\.atlas-page\s+#hero-title\s*\{[^}]*font-family\s*:/su,
  );
});

test("Blind Review uses the focus title and real brand mark without BaseLayout", async () => {
  const review = await read("src/pages/review.astro");
  assert.match(review, /hero-title hero-title--focus/u);
  assert.match(review, /\/brand\/prompt-atlas-mark-primary\.svg/u);
  assert.doesNotMatch(review, /<BaseLayout/u);
});
