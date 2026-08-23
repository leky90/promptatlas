import { expect, test } from "@playwright/test";

test("tablet discovery and Composer remain usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/discover/");

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

  const toggle = page.locator("[data-facet-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.locator('[data-dimension-filter="composition.aspect-ratio"]').click();
  await expect(page).toHaveURL(/dimension=composition.aspect-ratio/u);

  const add = page.locator("[data-primitive-card]:visible").first().getByRole("button", { name: /Thêm .* vào prompt/u });
  await add.click();
  await expect(page.locator("[data-composer-tray]")).toContainText("1 thành phần");
  await page.locator("[data-composer-tray] summary").click();
  await page.locator("[data-composer-tray]").getByRole("link", { name: "Mở Composer" }).click();
  await expect(page.locator("[data-composer-workspace]")).toBeVisible();
});

test("mobile navigation and core layouts remain usable", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator("[data-nav-toggle]");
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator("[data-site-nav]")).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-site-nav]").getByRole("link", { name: "Kiểm chứng provider" })).toBeVisible();

  await page.locator("[data-style-search]").fill("watercolor");
  await expect(page.locator("[data-result-count]")).not.toHaveText("00");
  await expect(page.locator('[data-style-card][data-slug="watercolor"]')).toBeVisible();

  await page.goto("/compare/?style=watercolor");
  await expect(page.locator("[data-compare-select]")).toBeVisible();
  await expect(page.locator("[data-compare-name]")).toHaveText("Watercolor");
  await expect(page.locator("[data-compare-image]")).toHaveCount(2);
  await expect(page.locator("[data-score-axis]")).toHaveCount(3);
  const compareViewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(compareViewport.scrollWidth).toBeLessThanOrEqual(compareViewport.clientWidth);
});

test("mobile discovery uses a facet drawer and keeps composer entry reachable", async ({ page }) => {
  await page.goto("/discover/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ngôn ngữ nhìn thấy");
  await expect(page.locator("[data-primitive-card]:visible")).toHaveCount(24);

  const toggle = page.locator("[data-facet-toggle]");
  const panel = page.locator("[data-facet-panel]");
  await expect(toggle).toBeVisible();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await toggle.click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).not.toHaveAttribute("aria-hidden", "true");
  await expect(panel).not.toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(false);

  await page.getByRole("button", { name: "Đóng taxonomy" }).click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('[data-dimension-filter="camera.shot-size"]').click();
  await expect(page).toHaveURL(/dimension=camera.shot-size/u);
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(toggle).toBeFocused();
  await expect(page.locator("[data-result-count]")).not.toHaveText("0");

  const add = page.locator("[data-primitive-card]:visible").first().getByRole("button", { name: /Thêm .* vào prompt/u });
  const addBox = await add.boundingBox();
  expect(addBox?.height).toBeGreaterThanOrEqual(44);
  await add.click();
  await expect(page.locator("[data-composer-tray]")).toBeVisible();
  await expect(page.locator("[data-composer-tray]")).toContainText("1 thành phần");
  await expect(page.getByText(/^Video$/u)).toHaveCount(0);
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
  for (const card of [page.locator("[data-style-card]").first(), page.locator("[data-style-card]").nth(1)]) {
    await card.locator("[data-prompt-disclosure] summary").click();
    await card.getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  }
  const tray = page.locator("[data-composer-tray]");
  await expect(tray).toBeVisible();
  await expect(tray).toContainText("2 thành phần");
  await expect(tray).not.toHaveAttribute("open", "");
  expect(await tray.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");
  await tray.locator("summary").click();
  await expect(tray).toHaveAttribute("open", "");
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

test("mobile Image Anatomy keeps filters and evidence within the viewport", async ({ page }) => {
  await page.goto("/anatomy/");
  await page.locator('[data-category-filter="camera"]').click();
  await expect(page.locator('[data-anatomy-dimension="camera.angle"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/anatomy/subject-person-role/");
  await expect(page.locator('[data-value-tier="core"]')).not.toHaveCount(0);
  await expect(page.locator('[data-value-tier="advanced"]')).not.toHaveCount(0);
  await expect(page.locator("main img[alt]").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
