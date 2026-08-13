import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, "..");
const projectDirectory = path.resolve(siteDirectory, "..");
const promptManifestPath = path.join(projectDirectory, "output/ldk-329/prompts.json");
const recordManifestPath = path.join(projectDirectory, "output/ldk-329/generation-records.json");
const publicManifestPath = path.join(siteDirectory, "src/data/primitive-reference-images.v1.json");
const contactSheetPath = path.join(projectDirectory, "output/ldk-329/contact-sheet.webp");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function validateAsset(asset, expectedFormat, maxDimension) {
  const absolutePath = path.join(projectDirectory, asset.repositoryPath);
  const buffer = await fs.readFile(absolutePath);
  const metadata = await sharp(buffer).metadata();
  const stat = await fs.stat(absolutePath);

  assert(metadata.format === expectedFormat, `${asset.repositoryPath}: expected ${expectedFormat}, got ${metadata.format}`);
  assert(metadata.width === asset.width && metadata.height === asset.height, `${asset.repositoryPath}: dimensions do not match metadata`);
  assert(stat.size === asset.bytes, `${asset.repositoryPath}: byte size does not match metadata`);
  assert(sha256(buffer) === asset.sha256, `${asset.repositoryPath}: SHA-256 does not match metadata`);
  if (maxDimension) {
    assert(metadata.width <= maxDimension && metadata.height <= maxDimension, `${asset.repositoryPath}: exceeds ${maxDimension}px`);
  }
}

const prompts = JSON.parse(await fs.readFile(promptManifestPath, "utf8"));
const generated = JSON.parse(await fs.readFile(recordManifestPath, "utf8"));
const publicData = JSON.parse(await fs.readFile(publicManifestPath, "utf8"));

assert(prompts.issueId === "LDK-329", "prompt manifest issueId must be LDK-329");
assert(prompts.generationPolicy.outputsPerPrompt === 1, "generation policy must keep one output per prompt");
assert(prompts.generationPolicy.statisticalBenchmark === false, "LDK-329 must not be labeled a statistical benchmark");
assert(prompts.generationPolicy.providerComparison === false, "LDK-329 must not be labeled a provider comparison");
assert(generated.records.length === prompts.entries.length, "generation record count must match prompt count");
assert(publicData.entries.length === prompts.entries.length, "public manifest count must match prompt count");
assert(generated.counts.total === prompts.entries.length, "generation summary total is incorrect");

const uniqueIds = new Set();
const uniqueOriginals = new Set();
const uniqueWeb = new Set();

for (let offset = 0; offset < prompts.entries.length; offset += 1) {
  const prompt = prompts.entries[offset];
  const record = generated.records[offset];
  const publicEntry = publicData.entries[offset];

  assert(prompt.index === offset + 1, `prompt index ${prompt.index}: sequence is not contiguous`);
  assert(record.index === prompt.index && publicEntry.index === prompt.index, `index ${prompt.index}: manifests are out of order`);
  assert(record.id === prompt.id && publicEntry.id === prompt.id, `index ${prompt.index}: id does not match`);
  assert(record.exactPrompt === prompt.exactPrompt && publicEntry.exactPrompt === prompt.exactPrompt, `index ${prompt.index}: exact prompt does not match`);
  assert(record.exactPromptSha256 === sha256(Buffer.from(prompt.exactPrompt, "utf8")), `index ${prompt.index}: prompt SHA-256 does not match`);
  assert(JSON.stringify(record.evidence ?? null) === JSON.stringify(prompt.evidence ?? null), `index ${prompt.index}: generation evidence does not match`);
  assert(JSON.stringify(publicEntry.evidence ?? null) === JSON.stringify(prompt.evidence ?? null), `index ${prompt.index}: public evidence does not match`);
  assert(record.generation.outputsPerPrompt === 1, `index ${prompt.index}: outputsPerPrompt must be one`);
  assert(record.generation.exactModelIdentity === null, `index ${prompt.index}: exact model identity must remain explicitly unavailable`);
  assert(record.alt.vi.length > 0 && record.alt.en.length > 0, `index ${prompt.index}: bilingual alt text is required`);
  assert(!uniqueIds.has(record.id), `duplicate id: ${record.id}`);
  assert(!uniqueOriginals.has(record.assets.original.repositoryPath), `duplicate original path: ${record.assets.original.repositoryPath}`);
  assert(!uniqueWeb.has(record.assets.web.repositoryPath), `duplicate web path: ${record.assets.web.repositoryPath}`);

  uniqueIds.add(record.id);
  uniqueOriginals.add(record.assets.original.repositoryPath);
  uniqueWeb.add(record.assets.web.repositoryPath);

  await validateAsset(record.assets.original, "png");
  if (record.assets.sourceOriginal) await validateAsset(record.assets.sourceOriginal, "png");
  await validateAsset(record.assets.web, "webp", 1280);
  await validateAsset(record.assets.thumbnail, "webp", 480);
}

for (const index of [59, 64, 145, 146, 147, 148, 149, 150, 151, 162]) {
  const entry = prompts.entries[index - 1];
  assert(entry.evidence?.observability, `index ${index}: evidence observability is required`);
  assert(entry.evidence?.noteVi && entry.evidence?.noteEn, `index ${index}: bilingual evidence note is required`);
}

const contactSheet = await sharp(contactSheetPath).metadata();
assert(contactSheet.format === "webp", "contact sheet must be WebP");
assert(contactSheet.width > 0 && contactSheet.height > 0, "contact sheet must have valid dimensions");

console.log(`Validated ${generated.records.length} prompt-to-image records.`);
console.log(`Groups: ${JSON.stringify(generated.counts.byGroup)}`);
console.log(`Contact sheet: ${contactSheet.width}x${contactSheet.height}`);
