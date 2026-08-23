import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";

const testOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4321";
const addStyleCard = async (card: Locator) => {
  await card.locator("[data-prompt-disclosure] summary").click();
  await card.getByRole("button", { name: /Thêm .* vào prompt/u }).click();
};

test("catalog additions become an ordered, persistent and conflict-aware recipe", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  await page.goto("/");

  const cards = page.locator("[data-style-card]");
  const secondFragment = await cards.nth(1).locator("[data-composer-add]").getAttribute("data-primitive-fragment");
  await addStyleCard(cards.nth(0));
  await addStyleCard(cards.nth(1));
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
  await expect(preview).toContainText(secondFragment ?? "");

  await page.getByRole("button", { name: "Sao chép prompt" }).click();
  await expect(page.locator("[data-composer-live]")).toContainText("Đã sao chép");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(secondFragment ?? "");

  await page.reload();
  await expect(page.locator("[data-recipe-item]")).toHaveCount(2);
  await expect(page.locator("[data-recipe-item]").first().locator("[data-recipe-label]")).toHaveText(secondLabel ?? "");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("a V2-only style keeps its reference scene separate from its accepted style fragment", async ({ page }) => {
  await page.goto("/");
  const fractal = page.locator('[data-style-card][data-slug="fractal-art"]');
  await addStyleCard(fractal);
  await page.goto("/composer/");

  const preview = page.locator("[data-composer-preview]");
  await expect(preview).toContainText("Primary request: an intricate organic structure where fern-like branches curl into nested spirals");
  await expect(preview).toContainText("1. Style/medium: in a Fractal Art visual language, with recursive self-similarity, nested branching spirals, macro-to-micro repetition.");
  await expect(preview).not.toContainText("Primary request: in a Fractal Art visual language");
});

test("legacy alias primitive IDs remain readable in existing Composer drafts", async ({ page }) => {
  await page.goto("/");
  const canonical = page.locator('[data-style-card][data-slug="interlocking-toy-brick-diorama"]');
  await addStyleCard(canonical);
  await page.evaluate(() => {
    const draftId = localStorage.getItem("pa:drafts:active:v1");
    const key = `pa:drafts:v1:${draftId}`;
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    draft.items[0].primitiveId = "primitive.style.lego";
    draft.items[0].slug = "lego";
    localStorage.setItem(key, JSON.stringify(draft));
  });

  await page.reload();
  await expect(canonical.locator("[data-composer-add]")).toHaveAttribute("aria-pressed", "true");
  await addStyleCard(canonical);
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  await page.goto("/composer/");
  await expect(page.locator("[data-composer-error]")).toBeHidden();
  await expect(page.locator("[data-recipe-item]")).toHaveCount(1);
  await expect(page.locator("[data-composer-preview]")).toContainText("interlocking toy-brick");
});

test("share opens read-only and continue editing forks without replacing the active draft", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  await page.goto("/");
  await addStyleCard(page.locator("[data-style-card]").first());
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
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: testOrigin });
  await page.goto("/");
  await addStyleCard(page.locator("[data-style-card]").first());
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

test("a checksummed malformed snapshot fails safely without stale output", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (reason) => pageErrors.push(reason));
  await page.goto("/");
  await addStyleCard(page.locator("[data-style-card]").first());
  await page.goto("/composer/");
  await expect(page.locator("[data-composer-preview]")).toContainText("Glitch Art");

  await page.evaluate(async () => {
    const draftId = localStorage.getItem("pa:drafts:active:v1");
    const draft = JSON.parse(localStorage.getItem(`pa:drafts:v1:${draftId}`) ?? "null");
    const body = {
      format: "prompt-atlas-recipe",
      formatVersion: 1,
      schemaVersion: "1.0.0",
      datasetVersion: "1.0.0",
      snapshotId: "malformed-browser-test",
      createdAt: "2026-08-13T00:00:00.000Z",
      recipe: {
        items: [{ ...draft.items[0], sourcePrompt: null }],
        acceptedBlendKeys: [],
      },
    };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const bytes = new TextEncoder().encode(JSON.stringify({ ...body, sha256 }));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
    location.hash = `r=${payload}`;
  });

  await expect(page.locator("[data-composer-error]")).toContainText("Snapshot không hợp lệ");
  await expect(page.locator("[data-composer-preview]")).toHaveText("Thêm thành phần để tạo prompt.");
  expect(pageErrors).toEqual([]);
});

test("a checksummed unknown primitive is rejected before it can render or fork", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (reason) => pageErrors.push(reason));
  await page.goto("/");
  await addStyleCard(page.locator("[data-style-card]").first());
  await page.goto("/composer/");
  const activeBefore = await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"));

  await page.evaluate(async () => {
    const body = {
      format: "prompt-atlas-recipe",
      formatVersion: 1,
      schemaVersion: "1.0.0",
      datasetVersion: "1.0.0",
      snapshotId: "unknown-primitive-browser-test",
      createdAt: "2026-08-13T00:00:00.000Z",
      recipe: {
        items: [{
          primitiveId: "primitive.style.not-in-production",
          slug: "not-in-production",
          label: "Injected style",
          fragment: "Style/medium: arbitrary external recipe.",
          sourcePrompt: "Arbitrary external source prompt.",
        }],
        acceptedBlendKeys: [],
      },
    };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const bytes = new TextEncoder().encode(JSON.stringify({ ...body, sha256 }));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
    location.hash = `r=${payload}`;
  });

  await expect(page.locator("[data-composer-error]")).toContainText("không thuộc bộ dữ liệu Prompt Atlas production");
  await expect(page.locator("[data-composer-preview]")).toHaveText("Thêm thành phần để tạo prompt.");
  await expect(page.getByRole("button", { name: "Tiếp tục chỉnh sửa" })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("pa:drafts:active:v1"))).toBe(activeBefore);
  expect(pageErrors).toEqual([]);
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
