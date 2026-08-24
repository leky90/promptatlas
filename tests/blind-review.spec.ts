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
  expect(await page.locator("#blind-review-data").textContent()).not.toMatch(/OpenAI|Google|legacy-chatgpt-ui|legacy-gflow-cli/iu);
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
  await expect(page.locator("[data-review-disclosure]")).toContainText("mapping");
  expect(await page.locator("[data-review-disclosure]").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"));
  expect(stored).toHaveLength(2);
  expect(new Set(stored.map((item: { id: string }) => item.id)).size).toBe(2);

  await page.getByRole("button", { name: "Bắt đầu review độc lập mới" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("main").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
});

test("resolved adjudication stays resolved after reload and originals remain intact", async ({ page }) => {
  await page.goto("/review/");
  const reviewData = JSON.parse(await page.locator("#blind-review-data").textContent() || "null");
  const ratings = (score: number) => [{
    dimensionId: "attribute",
    score,
    confidence: "high",
    rationale: `Observed score ${score}.`,
    evidence: [{ kind: "region", x: 0.2, y: 0.2, width: 0.3, height: 0.3 }],
  }];
  const history = reviewData.outputs.flatMap((output: { outputId: string }) => [
    {
      id: `reviewer-a:${reviewData.caseId}:${output.outputId}`,
      caseId: reviewData.caseId,
      outputId: output.outputId,
      reviewerId: "reviewer-a",
      protocolVersion: reviewData.protocolVersion,
      calibrationVersion: reviewData.calibrationVersion,
      submittedAt: "2026-08-24T00:00:00.000Z",
      ratings: ratings(4),
    },
    {
      id: `reviewer-b:${reviewData.caseId}:${output.outputId}`,
      caseId: reviewData.caseId,
      outputId: output.outputId,
      reviewerId: "reviewer-b",
      protocolVersion: reviewData.protocolVersion,
      calibrationVersion: reviewData.calibrationVersion,
      submittedAt: "2026-08-24T00:01:00.000Z",
      ratings: ratings(1),
    },
  ]);
  await page.evaluate(({ history }) => {
    localStorage.setItem("pa:blind-review:v1", JSON.stringify(history));
    sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-a");
  }, { history });
  await page.reload();

  const firstDisagreement = page.locator("[data-disagreement-list] .disagreement-item").first();
  const firstDecision = firstDisagreement.getByRole("button").first();
  await firstDecision.click();
  await expect(firstDisagreement).toHaveAttribute("data-status", "resolved");
  const immutableHistory = await page.evaluate(() => localStorage.getItem("pa:blind-review:v1"));

  await page.reload();
  await expect(page.locator('[data-disagreement-list] .disagreement-item[data-status="resolved"]')).toHaveCount(1);
  await expect(page.locator('[data-disagreement-list] .disagreement-item[data-status="resolved"] button')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("pa:blind-review:v1"))).toBe(immutableHistory);
});
