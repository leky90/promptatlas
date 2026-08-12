import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("catalog additions become an ordered, persistent and conflict-aware recipe", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4321" });
  await page.goto("/");

  const cards = page.locator("[data-style-card]");
  await cards.nth(0).getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await cards.nth(1).getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("2");

  await page.locator("[data-composer-nav]").click();
  await expect(page).toHaveURL(/\/composer\/$/u);
  await expect(page.locator("[data-recipe-item]")).toHaveCount(2);
  await expect(page.locator("[data-conflict-item]")).toHaveCount(1);
  await page.locator("[data-conflict-item]").getByRole("button", { name: "Dùng như pha trộn" }).click();
  await expect(page.locator("[data-conflict-item]")).toHaveCount(0);

  const secondLabel = await page.locator("[data-recipe-item]").nth(1).locator("[data-recipe-label]").textContent();
  await page.locator("[data-recipe-item]").nth(1).getByRole("button", { name: "Đưa lên" }).click();
  await expect(page.locator("[data-recipe-item]").first().locator("[data-recipe-label]")).toHaveText(secondLabel ?? "");
  const preview = page.locator("[data-composer-preview]");
  await expect(preview).toContainText(secondLabel ?? "");

  await page.getByRole("button", { name: "Sao chép prompt" }).click();
  await expect(page.locator("[data-composer-live]")).toContainText("Đã sao chép");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(secondLabel ?? "");

  await page.reload();
  await expect(page.locator("[data-recipe-item]")).toHaveCount(2);
  await expect(page.locator("[data-recipe-item]").first().locator("[data-recipe-label]")).toHaveText(secondLabel ?? "");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("share opens read-only and continue editing forks without replacing the active draft", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4321" });
  await page.goto("/");
  await page.locator("[data-style-card]").first().getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await page.goto("/composer/");
  const activeBefore = await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"));

  await page.getByRole("button", { name: "Chia sẻ recipe" }).click();
  await page.getByRole("button", { name: "Sao chép liên kết" }).click();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  const payload = new URL(shareUrl).hash.slice(3);
  const exportedSnapshot = Buffer.from(payload, "base64url");
  await page.goto(shareUrl);

  await expect(page.locator("[data-snapshot-banner]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tiếp tục chỉnh sửa" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"))).toBe(activeBefore);

  await page.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();
  const activeAfter = await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"));
  expect(activeAfter).not.toBe(activeBefore);
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`pa:drafts:v1:${id}`) ?? "null").sourceSnapshotHash, activeAfter)).toMatch(/^[a-f0-9]{64}$/u);
  expect(await page.evaluate((id) => localStorage.getItem(`pa:drafts:v1:${id}`), activeBefore)).not.toBeNull();

  await page.locator("[data-import-composer]").setInputFiles({
    name: "prompt-atlas-recipe-import.promptatlas.json",
    mimeType: "application/json",
    buffer: exportedSnapshot,
  });
  await expect(page.locator("[data-snapshot-banner]")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"))).toBe(activeAfter);
});

test("storage failure keeps a shared snapshot readable and editing locked", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4321" });
  await page.goto("/");
  await page.locator("[data-style-card]").first().getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await page.goto("/composer/");
  await page.getByRole("button", { name: "Chia sẻ recipe" }).click();
  await page.getByRole("button", { name: "Sao chép liên kết" }).click();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(shareUrl);
  const activeBefore = await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
  });

  await page.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();
  await expect(page.locator("[data-snapshot-banner]")).toBeVisible();
  await expect(page.locator("[data-composer-error]")).toContainText("Snapshot vẫn có thể đọc và sao chép");
  await expect(page.locator("[data-composer-preview]")).toContainText("Glitch Art");
  expect(await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"))).toBe(activeBefore);
});

test("the visible import action exposes keyboard focus", async ({ page }) => {
  await page.goto("/composer/");
  const preview = page.locator("[data-composer-preview]");
  const input = page.locator("[data-import-composer]");
  const visibleTrigger = page.locator('label[for="composer-import"]');

  await preview.focus();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  const focusStyle = await visibleTrigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
});
