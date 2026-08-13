import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionHost = "prompt-atlas.ldktech.com";
const retiredHost = "image-styles.ldktech.com";

const activeDomainFiles = [
  "astro.config.mjs",
  "public/CNAME",
  "public/robots.txt",
  "src/pages/index.astro",
  "src/pages/discover.astro",
  "src/pages/styles/[slug].astro",
  "scripts/prepare-site-data.mjs",
];

test("active production surfaces use only the Prompt Atlas hostname", async () => {
  for (const relativePath of activeDomainFiles) {
    const contents = await fs.readFile(path.join(root, relativePath), "utf8");
    assert.equal(contents.includes(retiredHost), false, `${relativePath} still references ${retiredHost}`);
  }

  assert.equal((await fs.readFile(path.join(root, "public/CNAME"), "utf8")).trim(), productionHost);
  assert.match(await fs.readFile(path.join(root, "astro.config.mjs"), "utf8"), new RegExp(`https://${productionHost}`));
  assert.match(await fs.readFile(path.join(root, "public/robots.txt"), "utf8"), new RegExp(`https://${productionHost}/sitemap-index\\.xml`));
});

test("the GitHub Pages deploy workflow is enabled", async () => {
  await fs.access(path.join(root, ".github/workflows/deploy.yml"));
  await assert.rejects(fs.access(path.join(root, ".github/workflows/deploy.yml.disabled")));
});
