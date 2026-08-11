# 01 · Research

Ngày desk research: 2026-08-11. Đây là phân tích nguồn công khai và dữ liệu dự án; không có phỏng vấn hay analytics người dùng.

## Giả thuyết người dùng và ngữ cảnh

- Người dùng thường bắt đầu bằng một ý niệm mơ hồ (“retro”, “tranh mực”, “thủ công”) hơn là biết chính xác tên style.
- Hình ảnh là tín hiệu nhận diện nhanh nhất; prompt và rubric chỉ hữu ích sau khi người dùng thấy một ví dụ phù hợp.
- Người dùng mobile cần lọc nhanh và xem hai output lần lượt; ép hai cột nhỏ sẽ làm mất chi tiết.
- Vì hai model có tỷ lệ/kích thước gốc khác nhau, so sánh phải giữ trọn khung, nêu rõ phương pháp và không tạo ảo giác pixel-perfect benchmark.

Mức tin cậy: cao với nhu cầu browse/search/compare (quan sát trực tiếp category); trung bình với hành vi favorites vì chưa có dữ liệu sử dụng thực.

## Nguồn và pattern quan sát

### PromptHero Search

Nguồn: https://prompthero.com/search

- Quan sát: search là entry point; filter theo model/category/sort; mỗi ảnh đi cùng prompt.
- Lợi ích: phù hợp cách người dùng khám phá theo hình và mô hình.
- Trade-off: feed vô hạn tạo nhiễu, chất lượng prompt không đồng đều.
- Quyết định: **adapt** search + faceted filters, nhưng giữ tập dữ liệu hữu hạn 90 style, điểm số và taxonomy rõ.
- Không sao chép: layout, nội dung prompt cộng đồng hay branding.

### OpenArt Image-to-Prompt

Nguồn: https://openart.ai/features/image-to-prompt/

- Quan sát: prompt được giải thích qua các lớp composition, lighting, palette và camera/style; copy/reuse là hành động chính.
- Lợi ích: biến prompt thành tài nguyên có thể học và chỉnh sửa.
- Trade-off: decomposition quá sâu có thể làm người mới quá tải.
- Quyết định: **adapt** bằng cách hiển thị prompt gốc, prompt đầy đủ và rubric theo progressive disclosure; copy luôn rõ ràng.

### GitHub Pages và Astro

Nguồn:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
- https://docs.astro.build/en/guides/deploy/github/

- Quan sát: GitHub Pages hỗ trợ custom workflow; custom domain cần cấu hình trong repo/API, không chỉ thêm file CNAME. Astro yêu cầu `site` là custom domain và không đặt `base` khi phục vụ ở root domain.
- Quyết định: GitHub Actions build Astro, `public/CNAME`, cấu hình Pages bằng API và CNAME DNS.

### Cloudflare DNS

Nguồn:

- https://developers.cloudflare.com/dns/manage-dns-records/
- https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/

- Quan sát: record CNAME chứa name/target/TTL và trạng thái proxy; zone `ldktech.com` đang authoritative trên Cloudflare.
- Quyết định: tạo CNAME `image-styles` → `leky90.github.io`, DNS-only để GitHub quản lý chứng chỉ custom-domain trực tiếp.

### Accessibility và media performance

Nguồn:

- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance
- https://web.dev/learn/performance/image-performance

- Quan sát: target tối thiểu 24×24 CSS px, focus indicator rõ; ảnh ngoài viewport nên lazy-load.
- Quyết định: control quan trọng tối thiểu 44px, focus 2px có offset, thumbnail lazy-load, ảnh hero/detail có kích thước khai báo.

## Độ phức tạp thông tin

- 90 Style.
- 2 Generation/style.
- 5 score/provider + average + winner.
- Prompt gốc, prompt đầy đủ, ghi chú đánh giá, family, related styles.

Search/filter phải xử lý tên tiếng Anh, mô tả tiếng Việt, prompt và family. Không cần server search vì 90 records nhỏ.

## Category conventions nên giữ

- Image-first gallery.
- Search luôn thấy ở đầu catalog.
- Model/provider label ở sát ảnh, không chỉ dùng màu.
- Copy prompt là hành động trực tiếp.
- Detail route có URL ổn định để share/bookmark.

## Pattern bị từ chối

- Dark neon “AI dashboard”: quá phổ biến, cạnh tranh với màu ảnh và giảm khả năng đọc catalog.
- Masonry vô hạn: khó so sánh có kiểm soát và làm vị trí item không ổn định.
- Slider overlay duy nhất: hai ảnh không cùng framing/tỷ lệ, overlay gây hiểu nhầm; dùng side-by-side giữ nguyên khung.
- Score radar chart: khó so con số chính xác và không cần thiết cho 5 tiêu chí; dùng thanh ngang + số.
- Modal detail: mất URL SEO/share và tạo vấn đề focus/scroll trên mobile.

## Rủi ro và trust

- Tên model là nhãn hệ sinh thái, không phải benchmark được nhà cung cấp chứng nhận.
- Chỉ một output/prompt/model; randomness chưa được đo.
- Tỷ lệ gốc khác nhau: OpenAI 3:2, Gemini 4:3.
- Ảnh Gemini có sparkle marker; website không xóa để giữ bằng chứng gốc.
- Logo ChatGPT/Gemini không dùng; chỉ nhãn văn bản để tránh tạo cảm giác được hai hãng bảo trợ.

