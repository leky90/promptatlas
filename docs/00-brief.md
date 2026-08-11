# 00 · Brief

## Mục tiêu

Xây dựng và xuất bản một website tĩnh tiếng Việt giúp người dùng:

1. So sánh khả năng tạo ảnh của ChatGPT và Gemini trên cùng 90 prompt.
2. Tìm kiếm, lọc và hình dung nhanh 90 phong cách tạo ảnh.
3. Mở từng phong cách, đọc prompt gốc, xem điểm theo rubric và sao chép prompt.

Kết quả kinh doanh mong muốn là tạo một tài nguyên evergreen cho LDKTech, có khả năng được tìm thấy qua search và giúp người dùng chuyển từ “biết tên phong cách” sang “chọn được phong cách phù hợp”.

## Người dùng và công việc chính

- Người làm nội dung/marketing: cần tìm nhanh ngôn ngữ hình ảnh cho một chiến dịch.
- Designer/creative technologist: cần đối chiếu output từ hai hệ sinh thái bằng cùng prompt.
- Người mới dùng AI: cần nhìn ví dụ trước khi hiểu thuật ngữ như risograph, sumi-e hay ferrofluid.

Công việc chính: **tìm một phong cách bằng từ khóa hoặc tín hiệu thị giác, kiểm tra prompt và hai output, rồi sao chép prompt để thử lại**.

## Bề mặt sản phẩm

Hybrid tĩnh:

- Website nội dung/SEO: trang chủ, phương pháp, 90 trang chi tiết phong cách.
- Công cụ tương tác nhẹ: tìm kiếm/lọc, yêu thích bằng `localStorage`, copy prompt, compare workspace.

Không có backend, tài khoản, upload ảnh hay gọi API tạo ảnh.

## Ràng buộc đã yêu cầu

- Dùng kết quả 90 cặp ảnh đã tạo.
- UI/UX tiện dụng, design direction phù hợp với kho tham khảo hình ảnh.
- Deploy GitHub Pages.
- Custom domain: `image-styles.ldktech.com`.

## Giả định tự chủ

- Tên sản phẩm: **Prompt Atlas by LDKTech**.
- Ngôn ngữ chính: tiếng Việt; prompt giữ nguyên tiếng Anh/song ngữ từ dữ liệu gốc.
- “ChatGPT” đại diện bộ ảnh OpenAI đã tạo; “Gemini” đại diện output GFlow CLI dùng `nano-pro / GEM_PIX_2 (Nano Banana Pro)`.
- Điểm là đánh giá thị giác thủ công một mẫu/prompt, không phải benchmark thống kê.
- Ảnh sẽ được chuyển sang WebP và có thumbnail riêng; bản gốc vẫn nằm ngoài repo website.

## Helper skills

- `build-static-demo`: lead studio cho product model, UX, art direction, implementation và QA.
- `github:github`: định tuyến publish; phần tạo repo/push/Pages dùng `git` và `gh` vì connector không bao phủ đầy đủ GitHub Pages.
- `cloudflare:cloudflare`: chỉ dùng cho DNS `image-styles.ldktech.com`; không dùng Cloudflare Pages/Workers vì hosting đã được yêu cầu là GitHub Pages.
- Không dùng `imagegen`: 180 ảnh người dùng đã cung cấp/tạo trước đó là media cuối cùng; không cần phát sinh artwork mới.
- Không dùng `design-taste-frontend`: đây là hybrid catalog + công cụ so sánh, không phải marketing surface thuần; art direction của lead skill đủ phù hợp và tránh xung đột.

## Trong phạm vi

- Trang gallery tìm kiếm/lọc 90 phong cách.
- Trang compare tổng quan và từng style.
- 90 trang detail có prompt, score, ghi chú, related styles.
- Favorites cục bộ, copy prompt, trạng thái empty/success.
- Responsive desktop/mobile, keyboard/focus, reduced motion.
- SEO metadata, sitemap, robots, Open Graph, favicon.
- Build tĩnh và deploy GitHub Pages + DNS Cloudflare.

## Ngoài phạm vi

- Sinh ảnh trực tiếp, login, đồng bộ favorites, cộng đồng, bình luận, thanh toán.
- Tuyên bố model nào tốt hơn một cách phổ quát.
- Sử dụng dữ liệu người dùng hoặc analytics bắt buộc.

## Definition of done

- 90 style records, 180 ảnh WebP đầy đủ, thumbnail và alt text đều hiện đúng.
- Search/filter/favorite/copy/compare hoạt động bằng chuột và bàn phím.
- Tất cả route build tĩnh, không 404 nội bộ, không lỗi console.
- Kiểm tra desktop và mobile bằng trình duyệt thật.
- Repo công khai trên GitHub, workflow Pages thành công.
- `https://image-styles.ldktech.com` phân giải và phục vụ build đã xác minh.

