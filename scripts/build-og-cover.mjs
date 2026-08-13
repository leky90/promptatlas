import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const thumbs = path.join(root, "public/media/thumbs");
const output = path.join(root, "public/media/og-cover.webp");
const heroSlugs = [
  "glitch-art-chatgpt.webp",
  "art-nouveau-gemini.webp",
  "cyberpunk-plus-ukiyo-e-plus-glitch-art-chatgpt.webp",
  "pop-art-plus-vaporwave-plus-assemblage-art-gemini.webp",
];

const overlay = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#121311"/>
  <rect x="0" y="0" width="22" height="630" fill="#D8FF45"/>
  <text x="70" y="82" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="3" fill="#D8FF45">LDKTECH / VISUAL REFERENCE</text>
  <text x="70" y="190" font-family="Arial, sans-serif" font-size="78" font-weight="700" fill="#F1EEE6">PROMPT</text>
  <text x="70" y="270" font-family="Arial, sans-serif" font-size="78" font-weight="700" fill="#F1EEE6">ATLAS</text>
  <text x="70" y="354" font-family="Arial, sans-serif" font-size="29" fill="#B9BAB3">90 phong cách · 180 hình ảnh</text>
  <text x="70" y="400" font-family="Arial, sans-serif" font-size="29" fill="#B9BAB3">ChatGPT × Gemini</text>
  <line x1="70" y1="468" x2="590" y2="468" stroke="#5B5C56" stroke-width="2"/>
  <text x="70" y="520" font-family="monospace" font-size="20" fill="#F1EEE6">prompt-atlas.ldktech.com</text>
  <rect x="650" y="40" width="520" height="550" fill="none" stroke="#D8FF45" stroke-width="2"/>
</svg>`);

const composites = [{ input: overlay }];
for (const [index, filename] of heroSlugs.entries()) {
  const tile = await sharp(path.join(thumbs, filename)).resize(235, 235, { fit: "cover" }).toBuffer();
  composites.push({
    input: tile,
    left: 680 + (index % 2) * 250,
    top: 70 + Math.floor(index / 2) * 250,
  });
}

await sharp({
  create: { width: 1200, height: 630, channels: 3, background: "#121311" },
})
  .composite(composites)
  .webp({ quality: 86, effort: 5 })
  .toFile(output);

const { size } = await fs.stat(output);
console.log(`Built ${path.relative(root, output)} (${size} bytes).`);
