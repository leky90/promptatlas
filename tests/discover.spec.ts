import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const testOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4321";

test("discovery filters hierarchical taxonomy and preserves URL-backed view state", async ({ page }) => {
  await page.goto("/discover/");

  const nav = page.locator("[data-site-nav]");
  await expect(nav.locator('a[href="/discover/"]')).toContainText("Discover");
  await expect(nav.locator('a[href="/composer/"]')).toContainText("Composer");
  await expect(nav.locator('a[href="/compare/"]')).toContainText("Benchmarks");
  await expect(nav.locator('a[href="/methodology/"]')).toContainText("Methodology");
  await expect(nav.getByRole("link", { name: "Discover", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-primitive-card]")).toHaveCount(187);
  await expect(page.locator("[data-primitive-card]:visible")).toHaveCount(24);
  await expect(page.locator("[data-visible-count]")).toHaveText("24");
  const taxonomyPanel = page.locator("[data-facet-panel]");
  await expect(taxonomyPanel).not.toHaveAttribute("aria-hidden", "true");
  await expect(taxonomyPanel).not.toHaveAttribute("hidden", "");
  expect(await taxonomyPanel.evaluate((element) => (element as HTMLElement).inert)).toBe(false);

  await page.locator('.taxonomy-quick [data-group-filter="subject"]').click();
  await expect(page.locator("[data-result-count]")).toHaveText("55");
  await expect(page).toHaveURL(/group=subject/u);

  await page.locator('[data-view="list"]').click();
  await expect(page.locator("[data-primitive-grid]")).toHaveAttribute("data-view", "list");
  await expect(page).toHaveURL(/view=list/u);
  await page.locator("[data-load-more]").click();
  await expect(page.locator("[data-primitive-card]:visible")).toHaveCount(48);
  await expect(page).toHaveURL(/batch=2/u);

  await page.reload();
  await expect(page.locator("[data-result-count]")).toHaveText("55");
  await expect(page.locator("[data-primitive-grid]")).toHaveAttribute("data-view", "list");
  await expect(page.locator("[data-primitive-card]:visible")).toHaveCount(48);
});

test("primitive cards support search, copy, details and composer entry", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  await page.goto("/discover/");

  await page.locator("[data-discover-search]").fill("craftsperson repairing a ceramic bowl");
  await expect(page.locator("[data-result-count]")).toHaveText("1");
  await expect(page).toHaveURL(/q=craftsperson/u);

  const card = page.locator("[data-primitive-card]:visible");
  await expect(card).toHaveCount(1);
  const copy = card.getByRole("button", { name: /Sao chép prompt fragment/u });
  await copy.click();
  await expect(copy.locator("[data-copy-label]")).toHaveText("Đã sao chép");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("a craftsperson");

  await card.locator("[data-primitive-details] summary").click();
  await expect(card.locator("[data-primitive-details]")).toHaveAttribute("open", "");
  await expect(card).toContainText("subject.person.role");

  await card.getByRole("button", { name: "Thêm Vai trò vào prompt" }).click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");
  await page.goto("/composer/");
  await expect(page.locator("[data-recipe-item]")).toHaveCount(1);
  await expect(page.locator("[data-composer-preview]")).toContainText("a craftsperson");
});

test("Composer rejects a second value from one dimension and honors an explicit aspect ratio", async ({ page }) => {
  await page.goto("/discover/?q=trường%20ảnh%20nông");
  await page.locator("[data-primitive-card]:visible").getByRole("button", { name: /Thêm trường ảnh nông vào prompt/u }).click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  await page.locator("[data-discover-search]").fill("trường ảnh sâu");
  await page.locator("[data-primitive-card]:visible").getByRole("button", { name: /Thêm trường ảnh sâu vào prompt/u }).click();
  await expect(page.locator("[data-toast]")).toContainText("Dimension này đã có một giá trị");
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  await page.locator("[data-discover-search]").fill("khung dọc 4:5");
  await page.locator("[data-primitive-card]:visible").getByRole("button", { name: /Thêm khung dọc 4:5 vào prompt/u }).click();
  await page.goto("/composer/");
  await expect(page.locator("[data-recipe-item]")).toHaveCount(2);
  await expect(page.locator("[data-composer-preview]")).toContainText("Composition/framing: portrait 4:5 aspect ratio");
  await expect(page.locator("[data-composer-preview]")).not.toContainText("landscape 3:2");
});

test("discovery has no serious accessibility violations", async ({ page }) => {
  await page.goto("/discover/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});
