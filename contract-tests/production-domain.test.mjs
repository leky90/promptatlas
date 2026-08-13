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
  "public/robots.txt",
  "src/pages/index.astro",
  "src/pages/discover.astro",
  "src/pages/styles/[slug].astro",
  "scripts/prepare-site-data.mjs",
];

test("active production surfaces use only the Prompt Atlas hostname", async () => {
  for (const relativePath of activeDomainFiles) {
    const contents = await fs.readFile(path.join(root, relativePath), "utf8");
    assert.equal(contents.includes(retiredHost), false, relativePath + " still references " + retiredHost);
  }

  await assert.rejects(fs.access(path.join(root, "public/CNAME")));
  assert.match(
    await fs.readFile(path.join(root, "astro.config.mjs"), "utf8"),
    new RegExp("https://" + productionHost),
  );
  assert.match(
    await fs.readFile(path.join(root, "public/robots.txt"), "utf8"),
    new RegExp("https://" + productionHost + "/sitemap-index\\.xml"),
  );
});

test("Cloudflare Pages owns deploys and GitHub Actions is manual verification only", async () => {
  await assert.rejects(fs.access(path.join(root, ".github/workflows/deploy.yml")));

  const workflow = await fs.readFile(path.join(root, ".github/workflows/verify.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /actions\/deploy-pages/u);
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/u);

  const deployGuide = await fs.readFile(path.join(root, "DEPLOY.md"), "utf8");
  assert.match(deployGuide, /Cloudflare Pages/u);
  assert.match(deployGuide, /npm run verify:pages/u);
  assert.equal((await fs.readFile(path.join(root, ".node-version"), "utf8")).trim(), "24");
});
