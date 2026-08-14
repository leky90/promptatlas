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

test("compare workbench reads query state and navigates records", async ({ page }) => {
  await page.goto("/compare/?style=sumi-e");
  await expect(page.locator("[data-compare-name]")).toHaveText("Sumi-e");
  await expect(page.locator("[data-compare-select]")).toHaveValue("sumi-e");
  await expect(page.locator('[data-compare-image="chatgpt"]')).toHaveAttribute("src", /sumi-e-chatgpt/);
  const taxonomy = page.locator('[data-compare-taxonomy="chatgpt"]');
  await expect(taxonomy).toContainText("ProviderOpenAI");
  await expect(taxonomy).toContainText("ModelChatGPT image generation");
  await expect(taxonomy).toContainText("PipelineChatGPT image generation (legacy atlas)");
  await expect(taxonomy).toContainText("Resultasset.sumi-e.chatgpt");
  await page.locator("[data-compare-next]").click();
  await expect(page).toHaveURL(/style=splash-ink/);
  await expect(page.locator("[data-compare-name]")).toHaveText("Splash Ink");
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
  await evidence.locator("summary").click();
  await expect(evidence.locator("[data-evidence-result]")).toHaveCount(2);
  await expect(evidence.locator("[data-evidence-result]").first()).toBeVisible();
  await expect(evidence).toContainText("Provider");
  await expect(evidence).toContainText("Model");
  await expect(evidence).toContainText("Pipeline");
  await expect(evidence).toContainText("Result");
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
