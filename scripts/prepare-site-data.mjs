#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const siteRoot = process.cwd();
const workspaceRoot = path.resolve(siteRoot, "..");
const manifestPath = path.join(workspaceRoot, "output/imagegen/manifest.json");
const evaluationPath = path.join(workspaceRoot, "output/comparison/evaluation.json");
const openaiDir = path.join(workspaceRoot, "output/imagegen");
const gflowDir = path.join(workspaceRoot, "output/gflow-cli");
const stylesDir = path.join(siteRoot, "public/media/styles");
const thumbsDir = path.join(siteRoot, "public/media/thumbs");
const dataDir = path.join(siteRoot, "src/data");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const evaluation = JSON.parse(await fs.readFile(evaluationPath, "utf8"));

await fs.mkdir(stylesDir, { recursive: true });
await fs.mkdir(thumbsDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });

const guideRows = `
1|Nhiễu số có chủ đích, lệch kênh màu và nhịp quét như màn hình lỗi.|RGB split;scanline;digital displacement
2|Hình học đối xứng, vật liệu sang trọng và nhịp trang trí của thập niên 1920.|gold geometry;symmetry;luxury
3|Nhân vật đại chúng gặp tỷ lệ mộng mị và những vật thể phi lý.|big eyes;dream logic;polished surrealism
4|Màu in giới hạn, hạt giấy và độ lệch mực tạo cảm giác thủ công.|limited inks;paper grain;misregistration
5|Nét viền rõ, biểu cảm lớn và màu phẳng giàu ánh sáng.|clean linework;expressive eyes;cel color
6|Nhân vật như rối vải với đường may, len nỉ và tỷ lệ thân thiện.|felt texture;visible seams;puppet proportions
7|Chủ thể được cấu tạo từ nếp gấp giấy và mặt phẳng sắc.|paper folds;faceted silhouette;clean background
8|Đô thị tương lai, neon, mưa và công nghệ dày đặc trong bóng tối.|neon rain;future city;high contrast
9|Lớp màu trong, mép loang và khoảng trắng tự nhiên của giấy.|transparent wash;soft blooms;paper texture
10|Hình khối đất sét, dấu tay nhẹ và chuyển động stop-motion vui nhộn.|clay texture;stop motion;playful motion
11|Minh họa kể chuyện với phép màu, hình khối thân thiện và ánh sáng mơ mộng.|storybook line;magic;gentle palette
12|Hoài niệm máy tính 1990s, hồng–tím, lưới phối cảnh và mặt trời retro.|pink cyan;grid horizon;retro computer
13|Mọi bề mặt được lắp từ khối đồ chơi có chốt nối và tỷ lệ mô hình.|toy bricks;studs;diorama
14|Đường cong hữu cơ, tóc chảy và hoa văn bao khung giàu trang trí.|whiplash curves;floral frame;ornament
15|Tranh minh họa tập trung vào hình, bảng màu và nét cọ có chủ đích.|editorial figure;controlled palette;painted marks
16|Lớp sơn dày, ánh sáng cổ điển và bề mặt canvas tạo chiều sâu.|oil impasto;classical light;canvas
17|Chữ hoặc con số trở thành hình ảnh, vừa đọc được vừa mang tính biểu tượng.|letterform image;readability;visual metaphor
18|Một đường liên tục tối giản tạo toàn bộ chân dung hoặc vật thể.|continuous line;negative space;minimalism
19|Không gian sáng, gỗ nhạt, công năng rõ và trang trí tiết chế.|light wood;bright neutral;functional calm
20|Sinh vật hoặc thực vật xa lạ với phát quang sinh học và cấu trúc ngoài Trái Đất.|alien biology;bioluminescence;strange anatomy
21|Các lớp giấy cắt chồng lên nhau tạo tiền cảnh, trung cảnh và bóng đổ.|layered paper;cut edges;shallow depth
22|Màu lỏng tự chảy thành vân, tế bào và xoáy không thể lặp lại.|fluid marbling;organic cells;flow
23|Kịch tính, chuyển động xoáy, ánh sáng sân khấu và tương phản mạnh.|dramatic light;swirling motion;ornate scale
24|Bố cục chân dung cân bằng, ánh sáng mềm và không gian phong cảnh cổ điển.|balanced portrait;sfumato;classical landscape
25|Hình ảnh ghép từ mảnh nhỏ, đường grout và màu vật liệu rời.|tesserae;grout lines;fragmented color
26|Kiến trúc vươn cao, sương tối và cảm giác linh thiêng pha bất an.|pointed arches;mist;medieval gloom
27|Màu sắc và nét cọ bóp méo hiện thực để đẩy cảm xúc lên trước.|emotional distortion;urgent brushwork;charged color
28|Da thuộc dày được dập, chạm và nhuộm để tạo họa tiết nổi.|tooled leather;embossed relief;warm brown
29|Mảng màu phẳng, đường viền khắc gỗ và sóng mây cách điệu Nhật Bản.|woodblock line;flat color;stylized waves
30|Đồng thau, bánh răng, hơi nước và cơ khí giả tưởng thời Victoria.|brass gears;steam;retro machinery
31|Nét cọ rời ghi lại ánh sáng tức thời hơn là mô tả chi tiết tuyệt đối.|broken brushwork;atmospheric light;color shimmer
32|Hình ảnh xây từ pixel vuông, bảng màu giới hạn và nhịp game cổ điển.|hard pixels;limited palette;8-bit clarity
33|Bề mặt phấn mềm, màu dịu và chuyển sắc mờ như bụi pigment.|powdery color;soft edge;dreamy palette
34|Sơn chảy dọc bề mặt, tạo vệt dài và cảm giác hình ảnh đang tan.|vertical drips;melting form;wet paint
35|Mảng kính màu được giữ bởi đường chì, phát sáng như cửa sổ nhà thờ.|lead lines;colored glass;luminous panels
36|Chữ lớn, outline mạnh, sơn xịt và năng lượng bề mặt đô thị.|spray texture;bold lettering;brick wall
37|Hàng nghìn chấm màu nhỏ hòa lại thành hình khi nhìn từ xa.|color dots;optical mixing;patient rhythm
38|Màu cơ bản mạnh, halftone và hình ảnh hàng hóa kiểu truyện tranh.|halftone;bold primaries;commercial icon
39|Mảng đen–màu rõ, vết dao khắc và độ lặp của bản in thủ công.|carved block;flat impression;folk rhythm
40|Nét bút bi xanh dày mỏng, cross-hatching và cảm giác ghi chép tức thời.|blue ink;cross hatch;quick sketch
41|Silhouette trắng trên nền Prussian blue với mép phủ hóa chất tự nhiên.|Prussian blue;photogram silhouette;rough border
42|Graphite, nét dựng hình và vùng shading để lộ quá trình phác.|graphite line;construction marks;shading
43|Pigment huỳnh quang bùng lên trên nền tối dưới ánh sáng UV.|fluorescent pigment;black ground;UV glow
44|Hình được tạo từ các mũi X đều đặn trên nền vải lưới.|x stitches;fabric grid;thread color
45|Acrylic được đổ và kéo tự do tạo vân tế bào, dòng chảy và lớp màu.|poured acrylic;cells;marbled layers
46|Kiến trúc và cơ thể tương lai dùng đường cong liên tục, vật liệu mới và lạc quan công nghệ.|future curves;bio-tech;optimism
47|Bề mặt 3D được giản lược thành ít đa giác phẳng có cạnh rõ.|faceted 3D;simple geometry;flat shading
48|Hình phẳng, đường sạch và tỷ lệ icon rõ ở kích thước nhỏ.|clean paths;flat shape;scalable icon
49|Phóng đại chi tiết rất nhỏ với độ sâu trường ảnh mỏng và texture sắc.|extreme close-up;shallow depth;micro texture
50|Khoảnh khắc đời thường không dàn dựng, nhiều lớp người và nhịp phố.|candid moment;urban layers;available light
51|Đen trắng tương phản, mưa, bóng đổ và nhân vật bí ẩn kiểu trinh thám.|monochrome;hard shadow;rainy mystery
52|Hình, màu và nhịp thay cho chủ thể hiện thực, ưu tiên cảm giác và cấu trúc.|nonfigurative shape;color rhythm;gesture
53|Thế giới 3D xây từ các khối voxel, có cảm giác mô hình game isometric.|cubic units;isometric view;blocky 3D
54|Đường cháy nâu trên gỗ sáng tạo chân dung và texture pyrography.|burn marks;wood grain;sepia line
55|Nét cọ thô, màu gay gắt và hình tượng đô thị có năng lượng bản năng.|raw brushwork;intense color;urban emotion
56|Giấy được cắt, gấp và dựng thành khối nổi như tác phẩm điêu khắc.|layered feathers;paper relief;crafted depth
57|Một đường sáng neon liên tục mô tả hình trên nền đen.|glowing contour;dark ground;signage clarity
58|Hình học cơ bản, lưới công năng và chữ sans-serif theo tinh thần Bauhaus.|primary geometry;functional grid;sans type
59|Màu cực mạnh, biến dạng lỏng và nhịp thị giác như trải nghiệm ảo giác.|melting color;optical swirl;high saturation
60|Sản phẩm được dàn ánh sáng, vật liệu và bao bì để tạo cảm giác thương mại cao cấp.|studio light;product staging;material detail
61|Hoạt hình màu nước Nhật Bản với thiên nhiên dịu, nhân vật ấm và ánh sáng hoài niệm.|watercolor animation;gentle nature;warm character
62|Màn trập lâu biến chuyển động thành dải sáng liên tục trên bối cảnh tĩnh.|light trails;night exposure;fixed scene
63|Tỷ lệ dễ thương, mắt sáng, má hồng và màu pastel thân thiện.|cute face;pastel;rounded form
64|Biểu tượng cô đọng bằng silhouette, ít chi tiết và nhận diện tức thì.|compact symbol;flat color;small-size clarity
65|Phối cảnh hồn nhiên, tỷ lệ không học thuật và màu kể chuyện trực tiếp.|childlike perspective;flat narrative;honest color
66|Nhiều góc nhìn được bẻ thành mặt phẳng hình học cùng lúc.|multiple viewpoints;geometric planes;fragmented figure
67|Mực đen loãng–đậm, sương và khoảng trống tạo chiều sâu thủy mặc.|ink wash;mist;negative space
68|Đầu lớn, thân nhỏ, biểu cảm rõ và chi tiết nhân vật được cô đọng.|big head;small body;clear expression
69|Không gian quen mà sai lệch, vắng người và có logic giấc mơ liminal.|liminal room;uncanny calm;dream logic
70|Cấu trúc tế bào, lát cắt nhuộm màu và chi tiết chỉ thấy qua kính hiển vi.|cell structure;stained specimen;micrograph
71|Action line, tương phản mực và khoảnh khắc kịch tính như một panel truyện tranh.|dynamic action;ink contour;panel drama
72|Vật liệu cũ, bất toàn có chủ ý và dấu sửa chữa tôn trọng thời gian.|patina;kintsugi;quiet imperfection
73|Chất lỏng đen bóng dựng gai theo từ trường, vừa hữu cơ vừa cơ khí.|magnetic spikes;black gloss;fluid geometry
74|Silhouette được lấp bằng hoa văn lặp thiền định và nét mực dày đặc.|pattern fill;meditative line;ornamental detail
75|Nét ghi chép tự do, icon nhỏ và nhiều ý tưởng cùng sống trên một trang.|loose sketch;notebook;playful icons
76|Lớp bề mặt bị cạo để lộ màu dưới, tạo đường nét hai tông có texture.|scratched layer;revealed color;incised line
77|Biểu tượng tâm linh, hình học thiêng và ánh sáng năng lượng mang tính thị kiến.|sacred geometry;cosmic energy;meditation
78|Collage phi lý, vật thể rời và chữ vụn chống lại logic thẩm mỹ thông thường.|absurd collage;found objects;anti-logic
79|Tranh thư Nhật tối giản: một vật đời thường, nét mộc và lời nhắn viết tay.|single motif;rustic brush;handwritten note
80|Chân dung được lắp từ đồ vật tìm thấy như nút, xu và mảnh vải.|found objects;material collage;relief portrait
81|Hai thời đại cố ý va vào nhau để tạo nghịch lý hình ảnh.|time collision;historic setting;modern device
82|Ít nét mực, nhiều khoảng trắng và chuyển động được cô đọng bằng bút pháp.|minimal ink;blank space;gesture
83|Mực vẩy và dải cọ bùng ra để mô tả chuyển động của cơ thể hoặc vải.|ink splash;ribbon motion;energetic gesture
84|Chữ viết tay là hình ảnh chính, chú trọng nhịp bút, độ đọc và khoảng trống.|brush lettering;stroke rhythm;readability
85|Hình được thiết kế theo đường cong cơ thể, linework bền và mảng mực rõ.|body placement;tattoo line;ink shading
86|Vỏ vật thể bị khoét để lộ một thế giới thu nhỏ có chiều sâu bên trong.|cutaway shell;miniature world;negative cavity
87|Màu bột đục, mảng phẳng giàu sắc và cạnh cọ rõ hơn màu nước.|opaque paint;matte color;crisp brush edge
88|Ukiyo-e và glitch chen vào phố cyberpunk, tạo va chạm giữa mộc bản và nhiễu số.|neon samurai;woodblock waves;digital glitch
89|Lớp giấy cắt gặp loang màu nước và ánh sáng cổ tích trong một cảnh quan kể chuyện.|paper layers;watercolor wash;magic glow
90|Màu pop và vaporwave phủ lên cấu trúc lắp ghép từ nhựa, đồ vật và chi tiết tìm thấy.|pop color;sunset grid;plastic assemblage
`.trim();

const guides = new Map(guideRows.split("\n").map((row) => {
  const [id, summary, cues] = row.split("|");
  return [Number(id), { summary, cues: cues.split(";") }];
}));

const familySets = {
  "Lai phong cách": new Set([88, 89, 90]),
  "Nhiếp ảnh": new Set([49, 50, 51, 60, 62]),
  "Kỹ thuật số": new Set([1, 8, 12, 13, 20, 30, 32, 46, 47, 53, 57, 63, 64, 68, 69, 70, 73]),
  "Thủ công": new Set([6, 7, 10, 21, 22, 25, 28, 35, 41, 43, 44, 45, 54, 56, 72, 74, 76, 79, 80, 85, 86]),
  "Hội họa": new Set([9, 14, 16, 23, 24, 26, 27, 29, 31, 33, 34, 37, 39, 52, 55, 58, 59, 65, 66, 67, 77, 81, 82, 83, 87]),
};

function familyFor(index) {
  for (const [family, indexes] of Object.entries(familySets)) {
    if (indexes.has(index)) return family;
  }
  return "Minh họa";
}

function slugFor(item) {
  return path.parse(item.filename).name.replace(/^\d{3}-/, "");
}

function subtitleFor(title, style) {
  const match = title.match(/\((.+)\)$/);
  return match ? match[1].replace(/\s+/g, " ").trim() : style;
}

const evalByIndex = new Map(evaluation.evaluations.map((item) => [item.index, item]));

const records = manifest.map((item) => {
  const slug = slugFor(item);
  const review = evalByIndex.get(item.index);
  const guide = guides.get(item.index);
  return {
    id: item.index,
    slug,
    name: item.style,
    title: item.title,
    subtitle: subtitleFor(item.title, item.style),
    family: familyFor(item.index),
    summary: guide.summary,
    cues: guide.cues,
    sourcePrompt: item.sourcePrompt,
    generationPrompt: item.generationPrompt,
    images: {
      chatgpt: {
        full: `/media/styles/${slug}-chatgpt.webp`,
        thumb: `/media/thumbs/${slug}-chatgpt.webp`,
        width: 1200,
        height: 800,
      },
      gemini: {
        full: `/media/styles/${slug}-gemini.webp`,
        thumb: `/media/thumbs/${slug}-gemini.webp`,
        width: 1200,
        height: 896,
      },
    },
    scores: {
      chatgpt: review.scores.openai,
      gemini: review.scores.gflow,
    },
    winner: review.winner === "OpenAI" ? "ChatGPT" : review.winner === "GFlow" ? "Gemini" : "Hòa",
    observation: review.observation || `${item.style} cho thấy hai cách diễn giải khác nhau về cùng chủ thể và medium.`,
    related: [],
  };
});

for (const record of records) {
  record.related = records
    .filter((candidate) => candidate.slug !== record.slug && candidate.family === record.family)
    .sort((a, b) => Math.abs(a.id - record.id) - Math.abs(b.id - record.id))
    .slice(0, 3)
    .map((candidate) => candidate.slug);
}

const mediaAssets = [];

async function convertRecord(record, item) {
  const stem = path.parse(item.filename).name;
  const sources = {
    chatgpt: path.join(openaiDir, `${stem}.png`),
    gemini: path.join(gflowDir, `${stem}.jpg`),
  };

  for (const provider of ["chatgpt", "gemini"]) {
    const fullName = `${record.slug}-${provider}.webp`;
    const thumbName = `${record.slug}-${provider}.webp`;
    const fullOutput = path.join(stylesDir, fullName);
    const thumbOutput = path.join(thumbsDir, thumbName);

    await sharp(sources[provider])
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(fullOutput);

    await sharp(sources[provider])
      .rotate()
      .resize({ width: 560, height: 373, fit: "cover", position: "attention" })
      .webp({ quality: 76, effort: 5 })
      .toFile(thumbOutput);

    const [fullStat, thumbStat] = await Promise.all([fs.stat(fullOutput), fs.stat(thumbOutput)]);
    mediaAssets.push(
      {
        file: `styles/${fullName}`,
        kind: "image",
        usage: `${record.name} detail and comparison — ${provider}`,
        alt: `${record.name} — ${record.sourcePrompt}, kết quả ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
        sourceType: "provided-generated",
        source: provider === "chatgpt" ? "OpenAI image generation output" : "GFlow CLI / Nano Banana Pro output",
        sourceUrl: null,
        creator: "LDKTech image-styles project",
        license: "project use",
        createdOrDownloadedAt: "2026-08-11",
        transformations: ["resize down to max 1200px", "convert WebP quality 82"],
        bytes: fullStat.size,
      },
      {
        file: `thumbs/${thumbName}`,
        kind: "image",
        usage: `${record.name} gallery thumbnail — ${provider}`,
        alt: `${record.name} — ${record.sourcePrompt}, kết quả ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
        sourceType: "derived",
        source: `media/styles/${fullName}`,
        sourceUrl: null,
        creator: "LDKTech image-styles project",
        license: "project use",
        createdOrDownloadedAt: "2026-08-11",
        transformations: ["attention crop 560x373", "convert WebP quality 76"],
        bytes: thumbStat.size,
      },
    );
  }
}

for (let start = 0; start < records.length; start += 6) {
  await Promise.all(records.slice(start, start + 6).map((record, offset) =>
    convertRecord(record, manifest[start + offset])));
  process.stdout.write(`\rProcessed ${Math.min(start + 6, records.length)}/${records.length} styles`);
}
process.stdout.write("\n");

const heroSlugs = ["glitch-art", "art-nouveau", "cyberpunk-plus-ukiyo-e-plus-glitch-art", "pop-art-plus-vaporwave-plus-assemblage-art"];
const heroImages = heroSlugs.map((slug, i) => ({
  input: path.join(thumbsDir, `${slug}-${i % 2 === 0 ? "chatgpt" : "gemini"}.webp`),
  left: 680 + (i % 2) * 250,
  top: 70 + Math.floor(i / 2) * 250,
}));

const ogText = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#121311"/>
  <rect x="0" y="0" width="22" height="630" fill="#D8FF45"/>
  <text x="70" y="82" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="3" fill="#D8FF45">LDKTECH / VISUAL REFERENCE</text>
  <text x="70" y="190" font-family="Arial, sans-serif" font-size="78" font-weight="700" fill="#F1EEE6">PROMPT</text>
  <text x="70" y="270" font-family="Arial, sans-serif" font-size="78" font-weight="700" fill="#F1EEE6">ATLAS</text>
  <text x="70" y="354" font-family="Arial, sans-serif" font-size="29" fill="#B9BAB3">90 phong cách · 180 hình ảnh</text>
  <text x="70" y="400" font-family="Arial, sans-serif" font-size="29" fill="#B9BAB3">ChatGPT × Gemini</text>
  <line x1="70" y1="468" x2="590" y2="468" stroke="#5B5C56" stroke-width="2"/>
  <text x="70" y="520" font-family="monospace" font-size="20" fill="#F1EEE6">image-styles.ldktech.com</text>
  <rect x="650" y="40" width="520" height="550" fill="none" stroke="#D8FF45" stroke-width="2"/>
</svg>`);

const composites = [{ input: ogText }];
for (const image of heroImages) {
  const tile = await sharp(image.input).resize(235, 235, { fit: "cover" }).toBuffer();
  composites.push({ input: tile, left: image.left, top: image.top });
}
await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#121311" } })
  .composite(composites)
  .webp({ quality: 86, effort: 5 })
  .toFile(path.join(siteRoot, "public/media/og-cover.webp"));

const ogStat = await fs.stat(path.join(siteRoot, "public/media/og-cover.webp"));
mediaAssets.push({
  file: "og-cover.webp",
  kind: "image",
  usage: "Open Graph cover",
  alt: "Prompt Atlas — 90 phong cách và 180 hình ảnh so sánh ChatGPT với Gemini.",
  sourceType: "derived",
  source: "Project image outputs and original SVG typography",
  sourceUrl: null,
  creator: "LDKTech image-styles project",
  license: "project use",
  createdOrDownloadedAt: "2026-08-11",
  transformations: ["editorial composite", "1200x630", "WebP quality 86"],
  bytes: ogStat.size,
});

const mediaManifest = {
  project: "prompt-atlas-ldktech",
  disclaimer: "AI outputs are retained as project evidence. ChatGPT and Gemini labels are descriptive; this project is not endorsed by OpenAI or Google.",
  fonts: [
    { package: "@fontsource-variable/instrument-sans", version: "5.3.0", license: "OFL-1.1" },
    { package: "@fontsource/ibm-plex-mono", version: "5.3.0", license: "OFL-1.1" },
  ],
  assets: mediaAssets.sort((a, b) => a.file.localeCompare(b.file)),
};

await fs.writeFile(path.join(dataDir, "styles.json"), `${JSON.stringify(records, null, 2)}\n`);
await fs.writeFile(path.join(siteRoot, "public/media/manifest.json"), `${JSON.stringify(mediaManifest, null, 2)}\n`);

const totalBytes = mediaAssets.reduce((sum, asset) => sum + asset.bytes, 0);
console.log(`Prepared ${records.length} style records and ${mediaAssets.length} media entries (${(totalBytes / 1048576).toFixed(1)} MB).`);
