import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

before(() => {
  execFileSync(path.join(root, "node_modules", ".bin", "astro"), ["build"], {
    cwd: root,
    stdio: "pipe",
  });
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
