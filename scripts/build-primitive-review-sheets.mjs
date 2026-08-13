import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, "..");
const projectDirectory = path.resolve(siteDirectory, "..");
const promptManifestPath = path.join(projectDirectory, "output/ldk-329/prompts.json");
const originalDirectory = path.join(projectDirectory, "output/ldk-329/originals");
const reviewDirectory = path.join(projectDirectory, "output/ldk-329/review-sheets");

const groupOrder = ["subject", "object", "scene", "composition", "camera", "lighting", "color"];
const columns = 3;
const rows = 4;
const entriesPerPage = columns * rows;
const cardWidth = 440;
const cardHeight = 390;
const imageWidth = 420;
const imageHeight = 270;
const headerHeight = 60;
const pageWidth = columns * cardWidth;
const pageHeight = headerHeight + rows * cardHeight;

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function truncate(value, length) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function textOverlay(entry) {
  const lineOne = `${String(entry.index).padStart(3, "0")} · ${entry.labelVi}`;
  const lineTwo = `Target: ${truncate(entry.promptFragment, 56)}`;
  const lineThree = `Example: ${truncate(entry.example, 58)}`;

  return Buffer.from(`<svg width="${imageWidth}" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="${imageWidth}" height="100" rx="4" fill="#ffffff"/>
    <text x="10" y="25" fill="#171717" font-family="Arial, sans-serif" font-size="17" font-weight="700">${escapeXml(lineOne)}</text>
    <text x="10" y="55" fill="#343434" font-family="Arial, sans-serif" font-size="14">${escapeXml(lineTwo)}</text>
    <text x="10" y="82" fill="#575757" font-family="Arial, sans-serif" font-size="13">${escapeXml(lineThree)}</text>
  </svg>`);
}

await fs.mkdir(reviewDirectory, { recursive: true });
const promptManifest = JSON.parse(await fs.readFile(promptManifestPath, "utf8"));
const pages = [];

for (const group of groupOrder) {
  const groupEntries = promptManifest.entries.filter((entry) => entry.group === group);
  const pageCount = Math.ceil(groupEntries.length / entriesPerPage);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageEntries = groupEntries.slice(pageIndex * entriesPerPage, (pageIndex + 1) * entriesPerPage);
    const composites = [];

    const header = Buffer.from(`<svg width="${pageWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${pageWidth}" height="${headerHeight}" fill="#171717"/>
      <text x="20" y="39" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700">LDK-329 review · ${escapeXml(group)} · page ${pageIndex + 1}/${pageCount}</text>
    </svg>`);
    composites.push({ input: header, left: 0, top: 0 });

    for (let slot = 0; slot < pageEntries.length; slot += 1) {
      const entry = pageEntries[slot];
      const left = (slot % columns) * cardWidth + 10;
      const top = headerHeight + Math.floor(slot / columns) * cardHeight + 10;
      const image = await sharp(path.join(originalDirectory, entry.originalFilename))
        .resize(imageWidth, imageHeight, {
          fit: "contain",
          background: { r: 239, g: 236, b: 228, alpha: 1 },
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      composites.push({ input: image, left, top });
      composites.push({ input: textOverlay(entry), left, top: top + imageHeight + 4 });
    }

    const filename = `${group}-${String(pageIndex + 1).padStart(2, "0")}.webp`;
    const outputPath = path.join(reviewDirectory, filename);
    await sharp({
      create: {
        width: pageWidth,
        height: pageHeight,
        channels: 3,
        background: { r: 225, g: 222, b: 214 },
      },
    })
      .composite(composites)
      .webp({ quality: 84, effort: 4 })
      .toFile(outputPath);

    pages.push({
      group,
      page: pageIndex + 1,
      pageCount,
      filename,
      entries: pageEntries.map(({ index, id, labelVi, promptFragment, example, originalFilename }) => ({
        index,
        id,
        labelVi,
        promptFragment,
        example,
        originalFilename,
      })),
    });
  }
}

await fs.writeFile(
  path.join(reviewDirectory, "index.json"),
  `${JSON.stringify({ schemaVersion: 1, issueId: "LDK-329", pages }, null, 2)}\n`,
  "utf8",
);

console.log(`Built ${pages.length} review sheets covering ${promptManifest.entries.length} entries.`);
