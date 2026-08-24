import { expect, test } from "@playwright/test";

const fillOutput = async (
  page: import("@playwright/test").Page,
  { score = "4", rationale = (index: number) => `Rationale riêng cho dimension ${index + 1}.` } = {},
) => {
  const rows = page.locator("[data-review-dimension]");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    await row.getByRole("radio", { name: score, exact: true }).check();
    await row.getByLabel("Confidence").selectOption("high");
    await row.getByRole("button", { name: "Gắn vùng hiện tại" }).click();
    await row.getByLabel("Rationale").fill(rationale(index));
  }
};

const completeOutput = async (page: import("@playwright/test").Page) => {
  await fillOutput(page);
  await page.getByRole("button", { name: "Lưu đánh giá bất biến" }).click();
};

test("blind review stays neutral until completion and supports keyboard-localized evidence", async ({ page }) => {
  await page.goto("/review");
  await expect(page.locator("[data-blind-review]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review mù" })).toHaveAttribute("href", "/review");
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("html").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
  expect(await page.locator("#blind-review-data").textContent()).not.toMatch(/OpenAI|Google|legacy-chatgpt-ui|legacy-gflow-cli/iu);
  const downloadedStyles = await page.evaluate(async () => {
    const urls = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.endsWith(".css"));
    return (await Promise.all(urls.map((url) => fetch(url).then((response) => response.text())))).join("\n");
  });
  expect(downloadedStyles).not.toMatch(/OpenAI|Google|ChatGPT|Gemini|--chatgpt|--gemini/iu);
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
  expect(new Set(stored[0].ratings.map((rating: { rationale: string }) => rating.rationale)).size).toBe(6);

  await page.getByRole("button", { name: "Bắt đầu review độc lập mới" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Đang mù");
  expect(await page.locator("main").innerText()).not.toMatch(/OpenAI|Google|ChatGPT|Gemini/iu);
});

test("dimension rationale must remain independently attributable", async ({ page }) => {
  await page.goto("/review");
  await page.locator("[data-evidence-canvas]").focus();
  await page.keyboard.press("Enter");
  await fillOutput(page, { rationale: () => "Cùng một rationale cho mọi dimension." });
  await page.getByRole("button", { name: "Lưu đánh giá bất biến" }).click();

  await expect(page.locator("[data-form-message]")).toContainText(/rationale.*riêng|khác nhau/iu);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"))).toHaveLength(0);
});

test("stale reviewer tabs cannot replace an immutable stored review", async ({ page }) => {
  await page.goto("/review");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-stale-tab");
  });
  await page.reload();

  const stalePage = await page.context().newPage();
  await stalePage.addInitScript(() => sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-stale-tab"));
  await stalePage.goto("/review");

  for (const [candidate, score] of [[page, "4"], [stalePage, "1"]] as const) {
    await candidate.locator("[data-evidence-canvas]").focus();
    await candidate.keyboard.press("Enter");
    await fillOutput(candidate, { score, rationale: (index) => `Tab score ${score}, dimension ${index + 1}.` });
  }

  await page.getByRole("button", { name: "Lưu đánh giá bất biến" }).click();
  await stalePage.getByRole("button", { name: "Lưu đánh giá bất biến" }).click();
  await expect(stalePage.locator("[data-form-message]")).toContainText(/already exists|immutable|đã tồn tại|bất biến/iu);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"));
  expect(stored).toHaveLength(1);
  expect(stored[0].ratings[0].score).toBe(4);
  await stalePage.close();
});

test("simultaneous reviewer tabs serialize immutable history writes", async ({ page }) => {
  await page.goto("/review");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-simultaneous");
  });
  await page.reload();

  const competingPage = await page.context().newPage();
  await competingPage.addInitScript(() => sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-simultaneous"));
  await competingPage.goto("/review");
  const observer = await page.context().newPage();
  await observer.goto("/review");
  await observer.evaluate(() => {
    (window as typeof window & { reviewStorageEvents: string[] }).reviewStorageEvents = [];
    window.addEventListener("storage", (event) => {
      if (event.key === "pa:blind-review:v1" && event.newValue) {
        (window as typeof window & { reviewStorageEvents: string[] }).reviewStorageEvents.push(event.newValue);
      }
    });
  });
  await observer.evaluate(() => new Promise<void>((acquired) => {
    void navigator.locks.request("pa:blind-review:history", async () => {
      await new Promise<void>((release) => {
        (window as typeof window & { releaseReviewStorageLock: () => void }).releaseReviewStorageLock = release;
        acquired();
      });
    });
  }));

  for (const [candidate, score] of [[page, "4"], [competingPage, "1"]] as const) {
    await candidate.locator("[data-evidence-canvas]").focus();
    await candidate.keyboard.press("Enter");
    await fillOutput(candidate, { score, rationale: (index) => `Concurrent score ${score}, dimension ${index + 1}.` });
  }

  await Promise.all([
    page.getByRole("button", { name: "Lưu đánh giá bất biến" }).click(),
    competingPage.getByRole("button", { name: "Lưu đánh giá bất biến" }).click(),
  ]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"))).toHaveLength(0);
  await observer.evaluate(() => (window as typeof window & { releaseReviewStorageLock: () => void }).releaseReviewStorageLock());
  await page.waitForTimeout(100);

  const writes = await observer.evaluate(() => (window as typeof window & { reviewStorageEvents: string[] }).reviewStorageEvents);
  expect(writes).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-review:v1") ?? "[]"))).toHaveLength(1);
  const messages = await Promise.all([
    page.locator("[data-form-message]").innerText(),
    competingPage.locator("[data-form-message]").innerText(),
  ]);
  expect(messages.filter((value) => /already exists|immutable|đã tồn tại|bất biến/iu.test(value))).toHaveLength(1);
  await competingPage.close();
  await observer.close();
});

test("simultaneous adjudications serialize the first immutable resolution", async ({ page }) => {
  await page.goto("/review");
  const reviewData = JSON.parse(await page.locator("#blind-review-data").textContent() || "null");
  const history = reviewData.outputs.flatMap((output: { outputId: string }) => [4, 1].map((score, index) => ({
    id: `reviewer-${index}:${reviewData.caseId}:${output.outputId}`,
    caseId: reviewData.caseId,
    outputId: output.outputId,
    reviewerId: `reviewer-${index}`,
    protocolVersion: reviewData.protocolVersion,
    calibrationVersion: reviewData.calibrationVersion,
    submittedAt: `2026-08-24T00:0${index}:00.000Z`,
    ratings: [{
      dimensionId: "attribute",
      score,
      confidence: "high",
      rationale: `Observed score ${score}.`,
      evidence: [{ kind: "region", x: 0.2, y: 0.2, width: 0.3, height: 0.3 }],
    }],
  })));
  await page.evaluate(({ history }) => {
    localStorage.setItem("pa:blind-review:v1", JSON.stringify(history));
    localStorage.removeItem("pa:blind-adjudications:v1");
    sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-0");
  }, { history });
  await page.reload();

  const competingPage = await page.context().newPage();
  await competingPage.addInitScript(() => sessionStorage.setItem("pa:blind-review:active-reviewer", "reviewer-0"));
  await competingPage.goto("/review");
  const observer = await page.context().newPage();
  await observer.goto("/review");
  await observer.evaluate(() => {
    (window as typeof window & { adjudicationStorageEvents: string[] }).adjudicationStorageEvents = [];
    window.addEventListener("storage", (event) => {
      if (event.key === "pa:blind-adjudications:v1" && event.newValue) {
        (window as typeof window & { adjudicationStorageEvents: string[] }).adjudicationStorageEvents.push(event.newValue);
      }
    });
  });
  await observer.evaluate(() => new Promise<void>((acquired) => {
    void navigator.locks.request("pa:blind-review:adjudications", async () => {
      await new Promise<void>((release) => {
        (window as typeof window & { releaseAdjudicationStorageLock: () => void }).releaseAdjudicationStorageLock = release;
        acquired();
      });
    });
  }));

  await Promise.all([
    page.locator("[data-disagreement-list] .disagreement-item").first().getByRole("button", { name: "Giữ score 4" }).click(),
    competingPage.locator("[data-disagreement-list] .disagreement-item").first().getByRole("button", { name: "Giữ score 1" }).click(),
  ]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-adjudications:v1") ?? "[]"))).toHaveLength(0);
  await observer.evaluate(() => (window as typeof window & { releaseAdjudicationStorageLock: () => void }).releaseAdjudicationStorageLock());
  await page.waitForTimeout(100);

  const writes = await observer.evaluate(() => (window as typeof window & { adjudicationStorageEvents: string[] }).adjudicationStorageEvents);
  expect(writes).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa:blind-adjudications:v1") ?? "[]"))).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("pa:blind-review:v1"))).toBe(JSON.stringify(history));
  await competingPage.close();
  await observer.close();
});

test("resolved adjudication stays resolved after reload and originals remain intact", async ({ page }) => {
  await page.goto("/review");
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

test("responsive evidence regions stay inside the painted image instead of letterbox space", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");
  await page.locator("[data-evidence-canvas]").scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>("[data-evidence-canvas]")!.getBoundingClientRect();
    const image = document.querySelector<HTMLImageElement>("[data-review-image]")!;
    const box = image.getBoundingClientRect();
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    return {
      canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height },
      image: { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height },
    };
  });
  expect(geometry.image.top).toBeGreaterThan(geometry.canvas.top + 20);

  await page.mouse.click(geometry.canvas.left + geometry.canvas.width / 2, geometry.canvas.top + 8);
  await expect(page.locator("[data-evidence-region]")).toBeHidden();

  await page.mouse.click(geometry.image.left + geometry.image.width / 2, geometry.image.top + geometry.image.height / 2);
  const region = await page.locator("[data-evidence-region]").boundingBox();
  expect(region).not.toBeNull();
  expect(region!.x).toBeGreaterThanOrEqual(geometry.image.left - 1);
  expect(region!.y).toBeGreaterThanOrEqual(geometry.image.top - 1);
  expect(region!.x + region!.width).toBeLessThanOrEqual(geometry.image.left + geometry.image.width + 1);
  expect(region!.y + region!.height).toBeLessThanOrEqual(geometry.image.top + geometry.image.height + 1);

  await page.mouse.click(geometry.image.left + geometry.image.width * .9, geometry.image.top + geometry.image.height * .9);
  const edgeRegion = await page.locator("[data-evidence-region]").boundingBox();
  expect(edgeRegion).not.toBeNull();
  expect(edgeRegion!.x + edgeRegion!.width).toBeLessThanOrEqual(geometry.image.left + geometry.image.width + 1);
  expect(edgeRegion!.y + edgeRegion!.height).toBeLessThanOrEqual(geometry.image.top + geometry.image.height + 1);
});
