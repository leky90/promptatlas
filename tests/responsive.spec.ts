import { expect, test } from "@playwright/test";

test("mobile navigation and core layouts remain usable", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator("[data-nav-toggle]");
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator("[data-site-nav]")).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-site-nav]").getByRole("link", { name: "So sánh model" })).toBeVisible();

  await page.locator("[data-style-search]").fill("watercolor");
  await expect(page.locator("[data-result-count]")).not.toHaveText("00");
  await expect(page.locator('[data-style-card][data-slug="watercolor"]')).toBeVisible();

  await page.goto("/compare/?style=watercolor");
  await expect(page.locator("[data-compare-select]")).toBeVisible();
  await expect(page.locator("[data-compare-name]")).toHaveText("Watercolor");
  await expect(page.locator("[data-compare-image]")).toHaveCount(2);
});

test("mobile methodology anchors clear the sticky header", async ({ page }) => {
  await page.goto("/methodology/");
  await page.getByRole("link", { name: "01 / Thiết lập" }).click();
  await expect(page).toHaveURL(/#setup$/);
  const sectionTop = await page.locator("#setup").evaluate((element) => element.getBoundingClientRect().top);
  const headerHeight = await page.locator(".site-header").evaluate((element) => element.getBoundingClientRect().height);
  expect(sectionTop).toBeGreaterThanOrEqual(headerHeight);
});

test("mobile composer tray exposes the active recipe without covering controls", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-style-card]").first().getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await page.locator("[data-style-card]").nth(1).getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  const tray = page.locator("[data-composer-tray]");
  await expect(tray).toBeVisible();
  await expect(tray).toContainText("2 thành phần");
  await tray.getByRole("link", { name: "Mở Composer" }).click();
  await expect(page).toHaveURL(/\/composer\/$/u);
  await expect(page.locator("[data-composer-workspace]")).toBeVisible();
  const copy = page.getByRole("button", { name: "Sao chép prompt" });
  await expect(copy).toBeVisible();
  const copyBox = await copy.boundingBox();
  expect(copyBox?.height).toBeGreaterThanOrEqual(44);
  const firstItem = page.locator("[data-recipe-item]").first();
  const down = firstItem.getByRole("button", { name: "Đưa xuống" });
  await down.focus();
  await expect(down).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-composer-live]")).toContainText("Đã đưa");
  await expect(page.getByText(/^Video$/u)).toHaveCount(0);
});
