import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`provider-neutral brand header remains legible on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    const brand = page.getByRole("link", { name: "Prompt Atlas — trang chủ" });
    await expect(brand).toBeVisible();
    await expect(brand.locator("img")).toHaveAttribute("src", "/brand/prompt-atlas-mark-reverse.svg");
    await expect(brand).toContainText("PROMPT ATLAS");

    const geometry = await brand.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const image = element.querySelector("img")?.getBoundingClientRect();
      return {
        brandWithinViewport: box.left >= 0 && box.right <= document.documentElement.clientWidth,
        imageWidth: image?.width ?? 0,
        imageHeight: image?.height ?? 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.brandWithinViewport).toBe(true);
    expect(geometry.imageWidth).toBeGreaterThanOrEqual(32);
    expect(geometry.imageHeight).toBeGreaterThanOrEqual(32);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
  });
}

test("favicon, manifest and brand SVGs resolve", async ({ request }) => {
  for (const asset of [
    "/favicon.svg",
    "/site.webmanifest",
    "/brand/prompt-atlas-mark-primary.svg",
    "/brand/prompt-atlas-mark-reverse.svg",
    "/brand/prompt-atlas-mark-mono.svg",
    "/brand/prompt-atlas-favicon-16.svg",
    "/brand/prompt-atlas-favicon-32.svg",
    "/brand/prompt-atlas-favicon-64.svg",
  ]) {
    expect((await request.get(asset)).ok(), asset).toBe(true);
  }
});
