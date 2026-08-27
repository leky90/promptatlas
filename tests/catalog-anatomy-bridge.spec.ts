import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Discover teaches the three layers and carries one primitive through Anatomy to Composer", async ({ page }) => {
  await page.goto("/discover/?q=craftsperson%20repairing%20a%20ceramic%20bowl");

  const layerGuide = page.getByRole("region", { name: "Styles, Prompt primitives và Image Anatomy" });
  await expect(layerGuide).toBeVisible();
  await expect(layerGuide).toContainText("Styles định hình ngôn ngữ thị giác");
  await expect(layerGuide).toContainText("Prompt primitives cấu trúc chỉ dẫn");
  await expect(layerGuide).toContainText("Image Anatomy tinh chỉnh thuộc tính quan sát được");

  const primitive = page.locator("[data-primitive-card]:visible");
  await expect(primitive).toHaveCount(1);
  await primitive.getByRole("button", { name: "Thêm Vai trò vào prompt" }).click();
  const refinement = primitive.getByRole("link", { name: "Tinh chỉnh Vai trò trong Image Anatomy" });
  await expect(refinement).toHaveAttribute("href", "/anatomy/subject-person-role/");
  await refinement.click();

  await expect(page).toHaveURL(/\/anatomy\/subject-person-role\/$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vai trò");
  const continuation = page.getByRole("region", { name: "Tiếp tục hành trình Prompt primitive" });
  await expect(continuation).toContainText("So sánh Core và Advanced");
  await continuation.getByRole("link", { name: "Tiếp tục trong Composer" }).click();

  await expect(page).toHaveURL(/\/composer\/$/u);
  await expect(page.locator("[data-recipe-item]")).toHaveCount(1);
  await expect(page.locator("[data-composer-preview]")).toContainText("a craftsperson");
});

test("Anatomy refinement journey only names tiers present on the dimension", async ({ page }) => {
  await page.goto("/anatomy/camera-angle/");

  const continuation = page.getByRole("region", { name: "Tiếp tục hành trình Prompt primitive" });
  await expect(continuation).toContainText("Khám phá các mốc Core");
  await expect(continuation).not.toContainText("Advanced");
  await expect(page.locator('[data-anatomy-tier="advanced"]')).toHaveCount(0);
});

test("Home and Anatomy expose one catalog-toolbar geometry contract", async ({ page }) => {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const snapshots = [];

    for (const route of ["/", "/anatomy/"]) {
      await page.goto(route);
      const toolbar = page.locator('[data-catalog-toolbar="standard"]');
      await expect(toolbar).toBeVisible();
      snapshots.push(await toolbar.evaluate((element) => {
        const search = element.querySelector<HTMLElement>("[data-catalog-search]")!;
        const filters = element.querySelector<HTMLElement>("[data-catalog-filters]")!;
        const status = element.querySelector<HTMLElement>("[data-catalog-status]")!;
        const input = search.querySelector<HTMLInputElement>("input")!;
        const styles = getComputedStyle(element);
        const controlHeights = [input, ...filters.querySelectorAll<HTMLElement>("button"), ...status.querySelectorAll<HTMLElement>("button")]
          .filter((control) => control.getClientRects().length > 0)
          .map((control) => control.getBoundingClientRect().height);
        return {
          contract: element.getAttribute("data-catalog-toolbar"),
          controlHeights,
          columnGap: styles.columnGap,
          rowGap: styles.rowGap,
          searchTop: Math.round(search.getBoundingClientRect().top - element.getBoundingClientRect().top),
          filtersTop: Math.round(filters.getBoundingClientRect().top - element.getBoundingClientRect().top),
          statusTop: Math.round(status.getBoundingClientRect().top - element.getBoundingClientRect().top),
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      }));
    }

    expect(snapshots[0].contract).toBe("standard");
    expect(snapshots[1].contract).toBe("standard");
    expect(snapshots[0].controlHeights.every((height) => height === 48)).toBe(true);
    expect(snapshots[1].controlHeights.every((height) => height === 48)).toBe(true);
    expect(snapshots[0].columnGap).toBe(snapshots[1].columnGap);
    expect(snapshots[0].rowGap).toBe(snapshots[1].rowGap);
    expect(snapshots[0].searchTop).toBe(snapshots[1].searchTop);
    expect(snapshots[0].filtersTop).toBe(snapshots[1].filtersTop);
    expect(snapshots[0].statusTop).toBe(snapshots[1].statusTop);
    for (const snapshot of snapshots) expect(snapshot.scrollWidth).toBeLessThanOrEqual(snapshot.clientWidth + 1);
  }
});

test("Discover declares its dense toolbar exception while following application rhythm", async ({ page }) => {
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/discover/");
    const toolbar = page.locator('[data-catalog-toolbar="dense"]');
    await expect(toolbar).toBeVisible();
    const geometry = await toolbar.evaluate((element) => {
      const wrapper = element.closest<HTMLElement>(".discover-toolbar-wrap")!;
      const header = document.querySelector<HTMLElement>(".site-header")!;
      const controlHeights = [...element.querySelectorAll<HTMLElement>("input, button, a[data-skip-to-results]")]
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => control.getBoundingClientRect().height);
      return {
        controlHeights,
        wrapperPosition: getComputedStyle(wrapper).position,
        stickyOffset: Math.round(wrapper.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.controlHeights.every((height) => height === 48)).toBe(true);
    expect(geometry.wrapperPosition).toBe(width <= 620 ? "relative" : "sticky");
    if (geometry.wrapperPosition === "sticky") expect(geometry.stickyOffset).toBeGreaterThanOrEqual(-1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  }

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});
