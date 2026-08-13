import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, "..");
const projectDirectory = path.resolve(siteDirectory, "..");

const promptManifestPath = path.join(projectDirectory, "output/ldk-329/prompts.json");
const originalDirectory = path.join(projectDirectory, "output/ldk-329/originals");
const remediationSourceDirectory = path.join(projectDirectory, "output/ldk-329/remediation-sources");
const recordManifestPath = path.join(projectDirectory, "output/ldk-329/generation-records.json");
const contactSheetPath = path.join(projectDirectory, "output/ldk-329/contact-sheet.webp");
const webDirectory = path.join(siteDirectory, "public/media/primitives");
const thumbnailDirectory = path.join(siteDirectory, "public/media/primitive-thumbs");
const publicManifestPath = path.join(siteDirectory, "src/data/primitive-reference-images.v1.json");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const repositoryPath = (absolutePath) => path.relative(projectDirectory, absolutePath).split(path.sep).join("/");

async function describeImage(absolutePath) {
  const buffer = await fs.readFile(absolutePath);
  const stat = await fs.stat(absolutePath);
  const metadata = await sharp(buffer).metadata();

  return {
    repositoryPath: repositoryPath(absolutePath),
    mimeType: `image/${metadata.format}`,
    width: metadata.width,
    height: metadata.height,
    bytes: stat.size,
    sha256: sha256(buffer),
  };
}

async function buildContactSheet(entries) {
  const tileSize = 160;
  const columns = 11;
  const rows = Math.ceil(entries.length / columns);
  const composites = [];

  for (const entry of entries) {
    const left = ((entry.index - 1) % columns) * tileSize;
    const top = Math.floor((entry.index - 1) / columns) * tileSize;
    const originalPath = path.join(originalDirectory, entry.originalFilename);
    const tile = await sharp(originalPath)
      .resize(tileSize, tileSize, {
        fit: "contain",
        background: { r: 242, g: 240, b: 234, alpha: 1 },
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${tileSize}" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="${tileSize}" height="24" fill="rgba(18,18,18,.76)"/><text x="8" y="17" fill="white" font-family="sans-serif" font-size="13">${String(entry.index).padStart(3, "0")} · ${entry.group}</text></svg>`,
    );

    composites.push({ input: tile, left, top });
    composites.push({ input: label, left, top: top + tileSize - 24 });
  }

  await sharp({
    create: {
      width: columns * tileSize,
      height: rows * tileSize,
      channels: 3,
      background: { r: 242, g: 240, b: 234 },
    },
  })
    .composite(composites)
    .webp({ quality: 78, effort: 4 })
    .toFile(contactSheetPath);
}

const promptManifest = JSON.parse(await fs.readFile(promptManifestPath, "utf8"));
const entries = promptManifest.entries;

if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error("LDK-329 prompt manifest has no entries");
}

await fs.mkdir(webDirectory, { recursive: true });
await fs.mkdir(thumbnailDirectory, { recursive: true });

const builtAt = new Date().toISOString();
const records = [];

for (const entry of entries) {
  const originalPath = path.join(originalDirectory, entry.originalFilename);
  const webPath = path.join(webDirectory, entry.webFilename);
  const thumbnailPath = path.join(thumbnailDirectory, entry.webFilename);
  const originalStat = await fs.stat(originalPath);

  await sharp(originalPath)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(webPath);

  await sharp(originalPath)
    .rotate()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76, effort: 4 })
    .toFile(thumbnailPath);

  const original = await describeImage(originalPath);
  const sourceOriginal = entry.sourceOriginalFilename
    ? await describeImage(path.join(remediationSourceDirectory, entry.sourceOriginalFilename))
    : null;
  const web = await describeImage(webPath);
  const thumbnail = await describeImage(thumbnailPath);

  records.push({
    index: entry.index,
    id: entry.id,
    dimensionId: entry.dimensionId,
    group: entry.group,
    sourceIssue: entry.sourceIssue,
    sourceDocumentId: entry.sourceDocumentId,
    labelVi: entry.labelVi,
    definitionVi: entry.definitionVi,
    promptFragment: entry.promptFragment,
    example: entry.example,
    exactPrompt: entry.exactPrompt,
    exactPromptSha256: sha256(Buffer.from(entry.exactPrompt, "utf8")),
    ...(entry.evidence ? { evidence: entry.evidence } : {}),
    ...(entry.postProcessing ? { postProcessing: entry.postProcessing } : {}),
    alt: {
      vi: `Minh họa cho “${entry.labelVi}”: ${entry.example}.`,
      en: `Reference image for ${entry.id}: ${entry.example}.`,
    },
    generation: {
      purpose: "searchable prompt-to-image reference archive",
      outputsPerPrompt: 1,
      statisticalBenchmark: false,
      providerComparison: false,
      routeId: "codex-image-generation",
      interface: "image_gen.imagegen",
      provider: "OpenAI",
      modelFamily: "Codex built-in image generation",
      exactModelIdentity: null,
      exactModelIdentityStatus: "unavailable-from-interface",
      requestedAspectRatio: "1:1",
      capturedAt: originalStat.mtime.toISOString(),
      capturedAtSource: "original-file-mtime",
    },
    rights: {
      sourceType: "synthetic-generated-image",
      consentRequired: false,
      restrictions: [
        "retain prompt and provenance metadata",
        "do not claim generated people are real identities",
      ],
      status: "active",
    },
    assets: {
      ...(sourceOriginal ? { sourceOriginal } : {}),
      original,
      web: { ...web, publicPath: `/media/primitives/${entry.webFilename}` },
      thumbnail: { ...thumbnail, publicPath: `/media/primitive-thumbs/${entry.webFilename}` },
    },
  });
}

await buildContactSheet(entries);

const countsByGroup = Object.fromEntries(
  [...new Set(records.map((record) => record.group))]
    .sort()
    .map((group) => [group, records.filter((record) => record.group === group).length]),
);

const originalBytes = records.reduce((total, record) => total + record.assets.original.bytes, 0);
const webBytes = records.reduce((total, record) => total + record.assets.web.bytes, 0);
const thumbnailBytes = records.reduce((total, record) => total + record.assets.thumbnail.bytes, 0);

const generationManifest = {
  schemaVersion: "1.0.0",
  issueId: "LDK-329",
  builtAt,
  purpose: "A prompt-pattern archive with one generated illustration per prompt primitive.",
  scope: {
    statisticalBenchmark: false,
    providerComparison: false,
    qualitySelection: "no-best-of-selection",
  },
  counts: {
    total: records.length,
    byGroup: countsByGroup,
  },
  storage: {
    originalBytes,
    webBytes,
    thumbnailBytes,
    contactSheet: repositoryPath(contactSheetPath),
  },
  modelIdentityNote: "The built-in image generation interface did not expose an exact model/version identifier; the route and interface are recorded without inventing a model snapshot.",
  records,
};

const publicManifest = {
  schemaVersion: "1.0.0",
  issueId: "LDK-329",
  builtAt,
  purpose: generationManifest.purpose,
  counts: generationManifest.counts,
  entries: records.map((record) => ({
    index: record.index,
    id: record.id,
    dimensionId: record.dimensionId,
    group: record.group,
    labelVi: record.labelVi,
    definitionVi: record.definitionVi,
    promptFragment: record.promptFragment,
    example: record.example,
    exactPrompt: record.exactPrompt,
    exactPromptSha256: record.exactPromptSha256,
    ...(record.evidence ? { evidence: record.evidence } : {}),
    alt: record.alt,
    image: record.assets.web.publicPath,
    thumbnail: record.assets.thumbnail.publicPath,
    width: record.assets.web.width,
    height: record.assets.web.height,
  })),
};

await fs.writeFile(recordManifestPath, `${JSON.stringify(generationManifest, null, 2)}\n`, "utf8");
await fs.writeFile(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify(generationManifest.counts, null, 2));
console.log(`Original bytes: ${originalBytes}`);
console.log(`Web bytes: ${webBytes}`);
console.log(`Thumbnail bytes: ${thumbnailBytes}`);
console.log(`Records: ${repositoryPath(recordManifestPath)}`);
console.log(`Public manifest: ${repositoryPath(publicManifestPath)}`);
console.log(`Contact sheet: ${repositoryPath(contactSheetPath)}`);
