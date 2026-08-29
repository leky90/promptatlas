import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const legalRoutes = [
  { path: "/about/", heading: "Về Prompt Atlas" },
  { path: "/privacy/", heading: "Chính sách quyền riêng tư" },
  { path: "/terms/", heading: "Điều khoản sử dụng" },
] as const;

test("approved legal and about routes are published as successful static pages", async ({ page }) => {
  for (const route of legalRoutes) {
    const response = await page.goto(route.path);
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://prompt-atlas.ldktech.com${route.path}`);
  }
});

test("legal copy matches the approved local-first product boundary", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.locator("main")).toContainText("Prompt Atlas không yêu cầu tài khoản");
  await expect(page.locator("main")).toContainText("không phải benchmark phổ quát");

  await page.goto("/privacy/");
  await expect(page.locator("main")).toContainText("Favorites được lưu bằng localStorage");
  await expect(page.locator("main")).toContainText("Prompt Atlas hiện không có tài khoản, đăng nhập, form gửi dữ liệu, database người dùng, analytics sản phẩm, advertising tracker hoặc cookie do ứng dụng đặt");
  await expect(page.locator("main")).toContainText("Trình duyệt không gửi fragment này trong HTTP request tới máy chủ");

  await page.goto("/terms/");
  await expect(page.locator("main")).toContainText("không phải benchmark phổ quát hay cam kết");
  await expect(page.locator("main")).toContainText(/không nội dung nào là tư vấn pháp lý/iu);
});

test("public contact path exposes the owner-declared mailbox, SLA and escalation behavior", async ({ page }) => {
  await page.goto("/about/#contact");

  const contact = page.locator("#contact");
  await expect(contact).toContainText("Ky Le");
  await expect(contact.getByRole("link", { name: "ldktech2017@gmail.com" })).toHaveAttribute("href", "mailto:ldktech2017@gmail.com");
  await expect(contact).toContainText("2 ngày làm việc");
  await expect(contact).toContainText("1 ngày làm việc");
  await expect(contact).toContainText("4 giờ làm việc");
  await expect(contact).toContainText("75% SLA");
  await expect(contact).toContainText("Site outage, security incident, privacy incident");
  await expect(contact).toContainText("bất kỳ tình huống nào có nguy cơ tiếp tục gây hại");
  await expect(contact).toContainText("không phải xác nhận thư đã được giao hoặc đọc");

  const footer = page.locator("footer");
  await expect(footer.locator('a[href="/about/"]')).toHaveText("About");
  await expect(footer.locator('a[href="/privacy/"]')).toHaveText("Privacy");
  await expect(footer.locator('a[href="/terms/"]')).toHaveText("Terms");
  await expect(footer.locator('a[href="/about/#contact"]')).toHaveText("Liên hệ");
});

test("legal and contact pages have no serious accessibility violations", async ({ page }) => {
  for (const route of legalRoutes) {
    await page.goto(route.path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  }
});
