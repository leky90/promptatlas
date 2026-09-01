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
