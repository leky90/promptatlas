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
