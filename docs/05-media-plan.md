# 05 · Media plan

## Nguồn

Toàn bộ 180 ảnh là tài sản có sẵn trong workspace, sinh trong cùng dự án:

- 90 PNG OpenAI: `../output/imagegen/`.
- 90 JPEG Gemini/GFlow: `../output/gflow-cli/`.
- Prompt/provenance: `../output/imagegen/manifest.json` và `../output/gflow-cli/generation-summary.json`.

Không dùng ảnh tìm kiếm, stock hoặc hotlink.

## Asset plan

| Asset | Usage | Size/aspect | Art direction | Source | Status |
|---|---|---|---|---|---|
| `styles/{slug}-chatgpt.webp` ×90 | detail/compare | max 1200px, giữ 3:2 | không crop, không retouch | provided/generated | planned |
| `styles/{slug}-gemini.webp` ×90 | detail/compare | max 1200px, giữ 4:3 | không crop, giữ sparkle marker | provided/generated | planned |
| `thumbs/{slug}-chatgpt.webp` ×90 | gallery | 560×373 crop-safe | center crop chỉ cho scan | derived | planned |
| `thumbs/{slug}-gemini.webp` ×90 | gallery | 560×373 crop-safe | center crop chỉ cho scan | derived | planned |
| `og-cover.webp` | Open Graph | 1200×630 | contact-sheet editorial + brand type | derived from project images | planned |
| `favicon.svg` | favicon/mark | vector | split frame + seam | original SVG | planned |

## Alt text formula

`{Style} — {mô tả cảnh từ source prompt}, kết quả {ChatGPT|Gemini}.`

Alt không nhắc score/winner; số liệu nằm trong text gần ảnh. Ảnh trang trí trong background dùng alt rỗng.

## Processing

- WebP quality 82 full, 76 thumb.
- Full: resize down only, không upscale.
- Thumbnail: 560×373, crop trung tâm; detail luôn cho xem bản không crop.
- `width`/`height` khai báo trong markup.
- Gallery dùng `loading="lazy"`, `decoding="async"`; hero/preselected compare dùng eager/high priority.

## Provenance manifest

`public/media/manifest.json` ghi từng file, sourceType `provided-generated`, provider, transform và ngày xử lý. Fontsource packages/giấy phép được ghi cùng manifest.

## Coverage gate

- 360 ảnh web derivative + OG + favicon đều tồn tại.
- Không URL media từ xa.
- Không placeholder.
- Không xóa hoặc che dấu marker/watermark của output gốc.

