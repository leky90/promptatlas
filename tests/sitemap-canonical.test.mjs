import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const validator = path.join(projectRoot, "scripts", "validate-dist-assets.mjs");
const origin = "https://prompt-atlas.ldktech.com";

function writeFixture({ routeFile = true, canonical = `${origin}/review/` } = {}) {
  const dist = mkdtempSync(path.join(os.tmpdir(), "prompt-atlas-sitemap-"));
  mkdirSync(path.join(dist, "_astro"), { recursive: true });
  writeFileSync(path.join(dist, "_astro", "site.css"), "body{}\n");
  writeFileSync(path.join(dist, "_astro", "site.js"), "export {};\n");
  writeFileSync(path.join(dist, "index.html"), `<!doctype html>
<link rel="stylesheet" href="/_astro/site.css">
<script type="module" src="/_astro/site.js"></script>
<link rel="canonical" href="${origin}/">
`);
  if (routeFile) {
    mkdirSync(path.join(dist, "review"), { recursive: true });
    writeFileSync(path.join(dist, "review", "index.html"), `<!doctype html>
<link rel="stylesheet" href="/_astro/site.css">
<script type="module" src="/_astro/site.js"></script>
<link rel="canonical" href="${canonical}">
`);
  }
  writeFileSync(path.join(dist, "sitemap-index.xml"), `<?xml version="1.0"?>
<sitemapindex><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap></sitemapindex>
`);
  writeFileSync(path.join(dist, "sitemap-0.xml"), `<?xml version="1.0"?>
<urlset><url><loc>${origin}/review/</loc></url></urlset>
`);
  return dist;
}

function runValidator(dist) {
  try {
    execFileSync(process.execPath, [validator], {
      cwd: projectRoot,
      env: { ...process.env, DIST_DIR: dist },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { status: 0, error: "" };
  } catch (error) {
    return { status: error.status, error: String(error.stderr) };
  }
}

test("rejects a sitemap URL without an exact directly served HTML route", () => {
  const dist = writeFixture({ routeFile: false });
  try {
    const result = runValidator(dist);
    assert.equal(result.status, 1);
    assert.match(result.error, /sitemap route is not directly served: \/review\//u);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("rejects a sitemap URL whose page declares a different canonical", () => {
  const dist = writeFixture({ canonical: `${origin}/review` });
  try {
    const result = runValidator(dist);
    assert.equal(result.status, 1);
    assert.match(result.error, /sitemap canonical mismatch: \/review\//u);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
