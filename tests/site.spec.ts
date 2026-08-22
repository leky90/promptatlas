import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const styles = JSON.parse(readFileSync(new URL("../src/data/styles.json", import.meta.url), "utf8")) as Array<{
  slug: string;
  images: { chatgpt: { full: string; thumb: string }; gemini: { full: string; thumb: string } };
}>;
const testOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4321";

test("atlas previews one output and the prompt before reuse actions", async ({ context, page }) => {
  const errors: string[] = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await expect(page.locator("[data-style-card]")).toHaveCount(90);
  const firstCard = page.locator("[data-style-card]").first();
  await expect(firstCard.locator("[data-learning-output] img")).toHaveCount(1);
  await expect(firstCard.locator("[data-comparison-eligible]")).toHaveCount(0);
  const disclosure = firstCard.locator("[data-prompt-disclosure]");
  await expect(disclosure.getByText("Xem prompt", { exact: true })).toBeVisible();
  const firstCopy = disclosure.locator("[data-copy-value]");
  await expect(firstCopy).not.toBeVisible();
  await disclosure.locator("summary").click();
  await expect(disclosure.locator("[data-prompt-preview]")).toBeVisible();
  await expect(firstCopy).toBeVisible();
  await firstCopy.click();
  await expect(firstCopy.locator("[data-copy-label]")).toHaveText("Đã sao chép");
  expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(100);
  await page.locator("[data-style-search]").fill("sumi-e");
  await expect(page.locator("[data-result-count]")).toHaveText("01");
  await expect(page.locator('[data-style-card][data-slug="sumi-e"]')).toBeVisible();

  await page.locator("[data-style-search]").fill("không-có-phong-cách-này");
  await expect(page.locator("[data-empty-state]")).toBeVisible();
  await page.locator("[data-reset-filters]").click();
  await expect(page.locator("[data-result-count]")).toHaveText("90");

  await page.locator('[data-family-filter="Nhiếp ảnh"]').click();
  const visible = page.locator("[data-style-card]:visible");
  expect(await visible.count()).toBeGreaterThan(0);
  for (let index = 0; index < await visible.count(); index += 1) {
    await expect(visible.nth(index)).toHaveAttribute("data-family", "Nhiếp ảnh");
  }

  await page.locator('[data-family-filter="all"]').click();
  const firstFavorite = page.locator("[data-favorite]").first();
  const savedSlug = await firstFavorite.getAttribute("data-favorite");
  await firstFavorite.click();
  await expect(firstFavorite).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-saved-filter]").click();
  await expect(page.locator("[data-result-count]")).toHaveText("01");
  await expect(page.locator(`[data-style-card][data-slug="${savedSlug}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test("gallery keeps an observable loading state until a thumbnail resolves", async ({ page }) => {
  let releaseThumbnail = () => {};
  const thumbnailGate = new Promise<void>((resolve) => {
    releaseThumbnail = resolve;
  });
  await page.route("**/media/thumbs/glitch-art-chatgpt.webp", async (route) => {
    await thumbnailGate;
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const output = page.locator('[data-style-card][data-slug="glitch-art"] [data-image-frame]');
  await expect(output).toHaveAttribute("aria-busy", "true");
  await expect(output).toHaveAttribute("data-image-state", "loading");

  releaseThumbnail();
  await expect(output).toHaveAttribute("aria-busy", "false");
  await expect(output).toHaveAttribute("data-image-state", "loaded");
});

test("gallery exposes thumbnail failures to assistive technology", async ({ page }) => {
  await page.route("**/media/thumbs/glitch-art-chatgpt.webp", (route) => route.abort("failed"));

  await page.goto("/");
  const output = page.locator('[data-style-card][data-slug="glitch-art"] [data-image-frame]');
  await expect(output).toHaveAttribute("aria-busy", "false");
  await expect(output).toHaveAttribute("data-image-state", "error");
  await expect(output.getByRole("status")).toHaveText("Không tải được ảnh");
});

test("gallery keeps thumbnails visible when JavaScript is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await page.goto("/");
    const output = page.locator('[data-style-card][data-slug="glitch-art"] [data-image-frame]');
    await expect.poll(() => output.locator("img").evaluate((image) => {
      const thumbnail = image as HTMLImageElement;
      return thumbnail.complete && thumbnail.naturalWidth > 0;
    })).toBe(true);
    await expect(output).not.toHaveAttribute("aria-busy", "true");
    await expect(output.locator("[data-image-load-state]")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("compare workbench reads query state and navigates records", async ({ page }) => {
  await page.goto("/compare/?style=sumi-e");
  await expect(page.locator("[data-comparison-classification]")).toContainText("Chẩn đoán product route lịch sử");
  await expect(page.locator("[data-compare-name]")).toHaveText("Sumi-e");
  await expect(page.locator("[data-compare-select]")).toHaveValue("sumi-e");
  await expect(page.locator('[data-compare-image="chatgpt"]')).toHaveAttribute("src", /sumi-e-chatgpt/);
  const taxonomy = page.locator('[data-compare-taxonomy="chatgpt"]');
  await expect(taxonomy).toContainText("ProviderOpenAI");
  await expect(taxonomy).toContainText("ModelChatGPT image generation");
  await expect(taxonomy).toContainText("Model disclosureKhông công khai");
  await expect(taxonomy).toContainText("Product routeChatGPT image generation (legacy atlas)");
  await expect(taxonomy).toContainText("Outputasset.sumi-e.chatgpt");
  await expect(page.locator("[data-compare-taxonomy] dd small")).toHaveCount(8);
  await expect(page.locator('[data-compare-route="chatgpt"] small')).toContainText("legacy-chatgpt-ui");
  await expect(page.locator('[data-compare-settings="chatgpt"] small')).toContainText("Selection:");
  await expect(page.locator('[data-compare-output="chatgpt"] small')).toContainText("Run:");
  await expect(page.locator("[data-compare-prompt]")).toContainText("Use case: stylized-concept");
  await expect(page.locator('[data-compare-settings="chatgpt"]')).toContainText("aspect-ratio");
  await expect(page.locator('[data-compare-settings="chatgpt"]')).toContainText("3:2");
  await expect(page.locator("[data-score-axis]")).toHaveCount(3);
  await expect(page.locator('[data-score-axis="adherence"]')).toContainText("Tuân thủ prompt");
  await expect(page.locator('[data-score-axis="aesthetics"]')).toContainText("Chất lượng thẩm mỹ");
  await expect(page.locator('[data-score-axis="artifacts"]')).toContainText("Artifact");
  await expect(page.locator("[data-compare-rationale]")).toContainText(/sumi-e/iu);
  await expect(page.locator("[data-compare-uncertainty]")).toContainText("một output");
  const comparePayload = JSON.parse(await page.locator("#compare-data").textContent() ?? "[]");
  expect(comparePayload.length).toBeGreaterThan(0);
  expect(Object.hasOwn(comparePayload[0].style, "winner")).toBe(false);
  expect(Object.hasOwn(comparePayload[0].evidence.scores.chatgpt, "average")).toBe(false);
  expect(Object.hasOwn(comparePayload[0].evidence.scores.gemini, "average")).toBe(false);
  await expect(page.getByText("Điểm trung bình", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-compare-winner], .aggregate__score")).toHaveCount(0);
  await expect(page.getByText(/nhỉnh hơn/iu)).toHaveCount(0);
  await page.locator("[data-compare-next]").click();
  await expect(page).toHaveURL(/style=splash-ink/);
  await expect(page.locator("[data-compare-name]")).toHaveText("Splash Ink");
  await expect(page.locator("[data-compare-taxonomy] dd small")).toHaveCount(8);
  await expect(page.locator('[data-compare-output="chatgpt"]')).toContainText("asset.splash-ink.chatgpt");
  await expect(page.locator('[data-compare-output="chatgpt"] small')).toContainText("Run:");
});

test("detail teaches output, prompt anatomy and usage before evidence", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  await page.goto("/styles/sumi-e/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sumi-e");
  await expect(page.locator('[data-learning-step="output"] [data-learning-output] img')).toHaveCount(1);
  await expect(page.locator("[data-prompt-anchor]")).toBeVisible();
  await expect(page.locator("[data-prompt-anatomy]")).toBeVisible();
  await expect(page.locator("[data-how-to-use]")).toBeVisible();
  await expect(page.locator("[data-compose-step]")).toBeVisible();
  const order = await page.locator("[data-learning-step]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-learning-step")),
  );
  expect(order).toEqual(["output", "prompt-anatomy", "how-to-use", "compose", "evidence"]);
  await page.getByRole("button", { name: "Thêm Sumi-e vào prompt" }).click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");
  const copy = page.locator("[data-copy-target]");
  await copy.click();
  await expect(copy.locator("[data-copy-label]")).toHaveText("Đã sao chép");
  expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(100);

  const evidence = page.locator("[data-evidence-panel]");
  await expect(evidence).toHaveAttribute("data-comparison-eligible", "true");
  await expect(evidence.locator("[data-evidence-result]").first()).not.toBeVisible();
  await evidence.locator(":scope > summary").click();
  await expect(evidence.locator("[data-evidence-result]")).toHaveCount(2);
  await expect(evidence.locator("[data-evidence-result]").first()).toBeVisible();
  await expect(evidence).toContainText("Provider");
  await expect(evidence).toContainText("Model");
  await expect(evidence).toContainText("Model disclosure");
  await expect(evidence).toContainText("Product route");
  await expect(evidence).toContainText("Settings");
  await expect(evidence).toContainText("Output");
  await expect(evidence).toContainText(/uncertainty/iu);
});

test("detail links exact prompt provenance when source metadata is available", async ({ page }) => {
  await page.goto("/styles/sumi-e/");
  const source = page.locator("[data-prompt-source]");
  await expect(source).toContainText("LDKTech");
  await expect(source).toContainText("src/data/styles.json");
  await expect(source.getByRole("link", { name: "Mở nguồn trên GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/leky90/promptatlas/blob/main/src/data/styles.json",
  );
});

test("methodology keeps the three evidence axes independent and discloses legacy scope", async ({ page }) => {
  await page.goto("/methodology/");
  await expect(page.locator("[data-method-axis]")).toHaveCount(3);
  await expect(page.locator('[data-method-axis="adherence"]')).toContainText("Tuân thủ prompt");
  await expect(page.locator('[data-method-axis="aesthetics"]')).toContainText("Chất lượng thẩm mỹ");
  await expect(page.locator('[data-method-axis="artifacts"]')).toContainText("10 = ít artifact");
  await expect(page.getByText(/product route, không phải immutable API model snapshot/iu)).toBeVisible();
  await expect(page.getByText(/không có video comparison/iu)).toBeVisible();
  await expect(page.getByText(/điểm trung bình là trung bình cộng/iu)).toHaveCount(0);
});

for (const path of ["/", "/discover/", "/compare/", "/styles/sumi-e/", "/methodology/"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious).toEqual([]);
  });
}

test("all style routes and published media resolve", async ({ request }) => {
  const routes = styles.map((style) => `/styles/${style.slug}/`);
  const media = styles.flatMap((style) => [
    style.images.chatgpt.full,
    style.images.chatgpt.thumb,
    style.images.gemini.full,
    style.images.gemini.thumb,
  ]);
  for (const batch of [routes, media]) {
    for (let index = 0; index < batch.length; index += 24) {
      const responses = await Promise.all(batch.slice(index, index + 24).map((path) => request.head(path)));
      responses.forEach((response) => expect(response.ok(), response.url()).toBeTruthy());
    }
  }
});
