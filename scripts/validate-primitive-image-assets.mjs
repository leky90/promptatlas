import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const siteDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(siteDirectory, "src/data/primitive-reference-images.v1.json");
const requiredGroupCounts = { subject: 55, object: 35, scene: 20, composition: 20, camera: 25, lighting: 20, color: 12 };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const publicPath = (value) => path.join(siteDirectory, "public", value.replace(/^\//u, ""));

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
assert(manifest.schemaVersion === "1.0.0", "primitive manifest schemaVersion must be 1.0.0");
assert(manifest.issueId === "LDK-329", "primitive manifest issueId must be LDK-329");
assert(Array.isArray(manifest.entries) && manifest.entries.length === 187, "primitive manifest must contain 187 entries");

const uniqueIds = new Set();
const uniqueIndexes = new Set();
const uniqueImages = new Set();
const uniqueThumbnails = new Set();
const groupCounts = {};

for (const entry of manifest.entries) {
  assert(Number.isInteger(entry.index) && entry.index >= 1 && entry.index <= 187, `${entry.id}: invalid index`);
  assert(typeof entry.id === "string" && /^[a-z0-9][a-z0-9.-]+$/u.test(entry.id), `${entry.id}: invalid primitive id`);
  assert(typeof entry.dimensionId === "string" && entry.dimensionId.startsWith(`${entry.group}.`), `${entry.id}: dimension/group mismatch`);
  assert(typeof entry.labelVi === "string" && entry.labelVi.trim(), `${entry.id}: missing Vietnamese label`);
  assert(typeof entry.definitionVi === "string" && entry.definitionVi.trim(), `${entry.id}: missing Vietnamese definition`);
  assert(typeof entry.promptFragment === "string" && entry.promptFragment.trim(), `${entry.id}: missing prompt fragment`);
  assert(typeof entry.exactPrompt === "string" && entry.exactPrompt.trim(), `${entry.id}: missing exact prompt`);
  assert(sha256(entry.exactPrompt) === entry.exactPromptSha256, `${entry.id}: exact prompt SHA-256 mismatch`);
  assert(entry.alt?.vi && entry.alt?.en, `${entry.id}: bilingual alt text is required`);
  assert(!uniqueIds.has(entry.id), `${entry.id}: duplicate primitive id`);
  assert(!uniqueIndexes.has(entry.index), `${entry.id}: duplicate index`);
  assert(!uniqueImages.has(entry.image), `${entry.id}: duplicate image path`);
  assert(!uniqueThumbnails.has(entry.thumbnail), `${entry.id}: duplicate thumbnail path`);
  uniqueIds.add(entry.id);
  uniqueIndexes.add(entry.index);
  uniqueImages.add(entry.image);
  uniqueThumbnails.add(entry.thumbnail);
  groupCounts[entry.group] = (groupCounts[entry.group] ?? 0) + 1;

  const [image, thumbnail] = await Promise.all([
    sharp(publicPath(entry.image)).metadata(),
    sharp(publicPath(entry.thumbnail)).metadata(),
  ]);
  assert(image.format === "webp" && image.width === entry.width && image.height === entry.height, `${entry.id}: original image metadata mismatch`);
  assert(thumbnail.format === "webp" && thumbnail.width <= 640 && thumbnail.height <= 640, `${entry.id}: thumbnail metadata mismatch`);
}

assert(JSON.stringify(groupCounts) === JSON.stringify(requiredGroupCounts), `group counts mismatch: ${JSON.stringify(groupCounts)}`);
console.log(`Validated ${manifest.entries.length}/187 primitive references, exact prompts, originals and thumbnails.`);
