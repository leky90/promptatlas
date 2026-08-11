# 02 · Product concept và art direction

## Product model

> Dành cho người sáng tạo cần chọn ngôn ngữ hình ảnh, Prompt Atlas giúp họ tìm, hiểu và đối chiếu 90 phong cách bằng cặp output thật và prompt có thể sao chép, đồng thời làm rõ giới hạn của phép so sánh.

### Actors và top jobs

- Explorer: browse/search, lọc theo family, đánh dấu yêu thích.
- Evaluator: so ChatGPT/Gemini, đọc score và methodology.
- Practitioner: copy prompt, chỉnh prompt trong công cụ riêng, quay lại style đã lưu.

### Entities và quan hệ

- `Style` có một `Prompt`, một `Family`, hai `Generation`, một `Evaluation` và nhiều `RelatedStyle`.
- `Generation` thuộc một `Provider`, có image, aspect, format và score theo năm tiêu chí.
- `Evaluation` có winner, observation và methodology chung.
- `Favorite` là state cục bộ theo style id; không rời khỏi trình duyệt.

### Verbs

- Chính: discover, search, filter, inspect, compare, copy.
- Hỗ trợ: favorite, reset, share bằng URL.
- Reversible: filter, favorite, provider view.
- Không có hành động phá hủy hoặc gửi dữ liệu.

### Lifecycle/state

- Gallery: all → filtered → empty → reset.
- Copy: idle → copied → trở lại idle.
- Favorite: off ↔ on, lưu `localStorage`.
- Compare: style A selected → style B selected → đổi provider/metric, không gọi mạng.

## Positioning

Tên: **Prompt Atlas by LDKTech**  
Value proposition: **90 phong cách. 180 hình ảnh. Một cách nhìn rõ ràng.**

Brand attributes:

- Investigative, không hype.
- Tactile, không bóng bẩy vô danh.
- Generous, không giấu prompt hoặc phương pháp.

Tone: ngắn, chính xác, tò mò; giải thích thuật ngữ khi cần; không dùng superlative thiếu bằng chứng.

## Ba visual territories

### A · Editorial light table — Chọn

- Ý tưởng: bàn soi ảnh của một art director, nơi contact sheet, nhãn mẫu và vạch đo trở thành UI.
- Composition: grid bất đối xứng, khung ảnh cứng, đường seam giữa hai model.
- Type: grotesk đọc tốt + mono cho số, score, prompt.
- Color: giấy ấm, mực carbon, acid-lime để chỉ thao tác/selection, cobalt cho data phụ.
- Surface: gần phẳng, border 1px, radius rất nhỏ, texture giấy cực nhẹ.
- Motion: cut/slide nhanh 160–220ms; ảnh không zoom quá mức.
- Signature: paired specimen card và compare lightbox.
- Rủi ro: có thể quá “print”; khắc phục bằng search sticky, focus rõ và trạng thái tương tác giàu feedback.

### B · Dark model lab — Loại

- Nền tối, neon cyan/magenta, chart kỹ thuật.
- Phù hợp “AI benchmark” nhưng quá phổ biến, làm màu ảnh sai cảm nhận và tạo cảm giác dashboard.

### C · Museum style archive — Loại

- Nền trắng, serif, nhiều khoảng thở, item như hiện vật.
- Sang và đọc tốt nhưng yếu ở tác vụ compare nhanh, dễ trở thành gallery tĩnh.

## Design director brief

### Visual fingerprint

- Composition: editorial modular, ảnh chiếm 60–75% viewport; data nằm ở rail/strip.
- Typography: `Instrument Sans Variable` cho display/reading; `IBM Plex Mono` cho labels, prompt và số.
- Color roles:
  - Paper `#F1EEE6`, ink `#121311`, soft ink `#5B5C56`.
  - Acid `#D8FF45` cho selected/action.
  - Cobalt `#3157FF` cho Gemini data accent; rust `#C94828` cho ChatGPT accent.
  - Success `#0B6B4B`, error `#A52C2C`.
- Shape: 0–4px radius; chips là nhãn mẫu hình chữ nhật; không dùng pill/card bo tròn mặc định.
- Depth: shadow chỉ cho lớp ảnh nổi/compare, không dùng glassmorphism.
- Image: `object-fit: contain`, nền trung tính; không crop trong compare/detail. Thumbnail gallery có crop an toàn 3:2 để scan nhanh và mở detail xem nguyên khung.
- Controls: chữ + icon inline SVG, target ≥44px với control chính.
- Density: desktop 3 cột gallery, tablet 2, mobile 1; filter bar sticky.
- Motion: seam reveal, score fill và toast copy; tắt khi `prefers-reduced-motion`.

### Signature moments

1. **Paired specimen**: mỗi card có hai nửa ảnh với nhãn CHATGPT/GEMINI và score nằm trên đường seam; hiểu phép so sánh trong một glance.
2. **Compare lightbox**: selector phong cách thay trực tiếp hai ảnh và score rails, giữ nguyên framing thay vì overlay sai lệch.

### Forbidden defaults

- Hero gradient tím/xanh, glass cards, blobs, animated particles.
- Logo robot/brain/sparkles chung chung.
- Card grid bo tròn lớn với icon tròn.
- Autoplay carousel, infinite scroll, hidden prompt paywall.
- Dùng màu đơn độc để chỉ provider/winner.

## Media direction

- Giữ nguyên hai output như bằng chứng; không retouch, xóa marker hoặc thay chữ.
- WebP full + thumbnail; khai báo dimensions; lazy-load trừ ảnh trên fold.
- OG image ghép từ tài sản dự án và typography của brand.
- Alt text nêu style, prompt scene và provider; tránh mô tả điểm số trong alt.

