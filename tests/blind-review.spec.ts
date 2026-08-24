import { expect, test } from "@playwright/test";

const completeOutput = async (page: import("@playwright/test").Page) => {
  const rows = page.locator("[data-review-dimension]");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    await row.getByRole("radio", { name: "4" }).check();
    await row.getByLabel("Confidence").selectOption("high");
    await row.getByRole("button", { name: "Gắn vùng hiện tại" }).click();
  }
  await page.getByLabel("Rationale").fill("Vùng đã chọn cho thấy output thực hiện rõ yêu cầu quan sát được.");
  await page.getByRole("button", { name: "Lưu đánh giá bất biến" }).click();
};

test("blind review stays neutral until completion and supports keyboard-localized evidence", async ({ page }) => {
  await page.goto("/review/");
  await expect(page.locator("[data-blind-review]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review mù" })).toHaveAttribute("href", "/review/");
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("main").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
  await expect(page.locator("[data-output-tab]")).toHaveCount(2);

  const evidenceCanvas = page.locator("[data-evidence-canvas]");
  await evidenceCanvas.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-evidence-region]")).toBeVisible();
  const initialX = await page.locator("[data-evidence-region]").getAttribute("data-region-x");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-evidence-region]")).not.toHaveAttribute("data-region-x", initialX ?? "");

  await completeOutput(page);
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("main").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);

  await page.locator("[data-evidence-canvas]").focus();
  await page.keyboard.press("Enter");
  await completeOutput(page);

  await expect(page.locator("[data-review-status]")).toContainText("Đã hoàn tất");
  await expect(page.locator("[data-review-disclosure]")).toBeVisible();
  expect(await page.locator("[data-review-disclosure]").innerText()).toMatch(/OpenAI|Google/iu);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"));
  expect(stored).toHaveLength(2);
  expect(new Set(stored.map((item: { id: string }) => item.id)).size).toBe(2);

  await page.getByRole("button", { name: "Bắt đầu review độc lập mới" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("main").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
});
