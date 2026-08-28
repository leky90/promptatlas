import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Request } from "@playwright/test";

const auditedRoutes = ["/", "/discover/", "/anatomy/", "/composer/"];
const testOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4321";

test("Spotlight is global, keyboard-first and restores focus", async ({ page }) => {
  for (const route of auditedRoutes) {
    await page.goto(route);
    const trigger = page.getByRole("button", { name: /Tìm trong Prompt Atlas/u });
    await trigger.focus();
    await page.keyboard.press("Control+K");

    const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Tìm phong cách, prompt primitive hoặc Image Anatomy" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("slash search, shortcut help and grouped góc máy results expose valid actions", async ({ page }) => {
  await page.goto("/discover/?group=camera&view=list");
  await page.keyboard.press("/");

  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  const search = dialog.getByRole("combobox", { name: "Tìm phong cách, prompt primitive hoặc Image Anatomy" });
  await search.fill("góc máy");
  await expect(dialog.getByRole("rowgroup", { name: "Prompt primitives" })).toBeVisible();
  await expect(dialog.getByRole("rowgroup", { name: "Image Anatomy" })).toBeVisible();
  await expect(dialog.locator("[data-spotlight-count]" )).not.toHaveText("0 kết quả");

  const primitive = dialog.locator('[data-spotlight-type="primitive"]:visible').first();
  await expect(primitive.getByRole("link", { name: /Mở trong Học prompt/u })).toHaveAttribute("href", /\/discover\/\?q=/u);
  const add = primitive.getByRole("button", { name: /Thêm .* vào prompt/u });
  await search.press("Tab");
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  await page.goto("/composer/");
  await expect(page.locator("[data-recipe-item]")).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/discover\/\?group=camera&view=list/u);
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  if (await dialog.isVisible()) await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+/");
  await expect(page.getByRole("dialog", { name: "Phím tắt Prompt Atlas" })).toBeVisible();
});

test("Spotlight preserves selected Composer actions after reopen and re-filter", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");

  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  const search = dialog.getByRole("combobox");
  await search.fill("góc máy");
  await dialog.locator('[data-spotlight-type="primitive"]:visible').first().getByRole("button").click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+K");
  await search.fill("góc");
  await search.fill("góc máy");

  const selectedAction = dialog.locator('[data-spotlight-type="primitive"]:visible').first().getByRole("button");
  await expect(selectedAction).toHaveAttribute("aria-pressed", "true");
  await expect(selectedAction.locator("[data-composer-add-label]")).toHaveText("Đã thêm");
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");
});

test("Spotlight maps persisted legacy style aliases without duplicating Composer", async ({ page }) => {
  await page.goto("/");
  const canonical = page.locator('[data-style-card][data-slug="interlocking-toy-brick-diorama"]');
  await canonical.locator("[data-prompt-disclosure] summary").click();
  await canonical.getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  await page.evaluate(() => {
    const draftId = localStorage.getItem("pa:drafts:active:v1");
    const key = `pa:drafts:v1:${draftId}`;
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    draft.items[0].primitiveId = "primitive.style.lego";
    draft.items[0].slug = "lego";
    localStorage.setItem(key, JSON.stringify(draft));
  });

  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  const search = dialog.getByRole("combobox");
  await search.fill("lego");
  let action = dialog.locator('[data-spotlight-type="style"]:visible').first().getByRole("button");
  await expect(action).toHaveAttribute("aria-pressed", "true");
  await expect(action.locator("[data-composer-add-label]")).toHaveText("Đã thêm");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+K");
  await search.fill("interlocking");
  await search.fill("lego");
  action = dialog.locator('[data-spotlight-type="style"]:visible').first().getByRole("button");
  await expect(action).toHaveAttribute("aria-pressed", "true");
  await action.click();
  await expect(page.locator("[data-composer-count]").first()).toHaveText("1");
  await expect(action.locator("[data-composer-add-label]")).toHaveText("Đã thêm");
});

test("Discover and Home communicate the canonical shared-discovery vocabulary", async ({ page }) => {
  await page.goto("/discover/");
  await expect(page).toHaveTitle("Discover Prompt primitives | Prompt Atlas");
  await expect(page.locator(".discover-intro .eyebrow")).toContainText("PROMPT PRIMITIVES");
  await expect(page.locator(".discover-specimens")).toHaveAttribute("aria-label", "Mẫu Prompt primitives");
  await expect(page.locator(".discover-search label")).toHaveText("Tìm trong Prompt primitives");
  await expect(page.locator("#library-title")).toHaveText("Prompt primitives");

  await page.goto("/");
  await expect(page.locator(".search-field kbd")).toHaveCount(0);
});

test("Spotlight supports Arrow, Enter and accessible combobox state", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  const search = dialog.getByRole("combobox");
  await search.fill("sumi-e");
  await page.keyboard.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /spotlight-row-/u);
  await expect(dialog.locator("[data-spotlight-result-row]").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/styles\/sumi-e\/$/u);
});

test("populated Spotlight results and actions have valid accessibility semantics", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await dialog.getByRole("combobox").fill("góc máy");
  await expect(dialog.locator("[data-spotlight-result-row]")).not.toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Thêm .* vào prompt/u }).first()).toBeVisible();

  const results = await new AxeBuilder({ page }).include("[data-spotlight-dialog]").analyze();
  expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("Discover exposes a short skip-to-results path and live result count", async ({ page }) => {
  await page.goto("/discover/");
  const search = page.locator("[data-discover-search]");
  await search.focus();

  let tabStops = 0;
  while (tabStops <= 12) {
    await page.keyboard.press("Tab");
    tabStops += 1;
    if (await page.locator("[data-skip-to-results]:focus").count()) {
      await page.keyboard.press("Enter");
      break;
    }
  }

  await expect(page.locator("#discover-results")).toBeFocused();
  expect(tabStops).toBeLessThanOrEqual(12);
  await search.fill("góc máy thấp");
  await expect(page.locator("[data-discover-live]")).toContainText(/kết quả/u);
});

test("Home and Anatomy controls clear the header without desktop clipping", async ({ page }) => {
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const facets = page.locator(".atlas-toolbar .filter-row");
    const facetMetrics = await facets.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(facetMetrics.scrollWidth).toBeLessThanOrEqual(facetMetrics.clientWidth);
    expect(facetMetrics.scrollHeight).toBeLessThanOrEqual(facetMetrics.clientHeight);

    await page.goto("/anatomy/");
    await page.locator(".anatomy-toolbar-wrap").evaluate((element) => element.scrollIntoView());
    const positions = await page.evaluate(() => ({
      headerBottom: document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0,
      toolbarTop: document.querySelector(".anatomy-toolbar-wrap")?.getBoundingClientRect().top ?? 0,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(positions.toolbarTop).toBeGreaterThanOrEqual(positions.headerBottom - 1);
    expect(positions.scrollWidth).toBeLessThanOrEqual(positions.clientWidth);
  }
});

test("core discovery routes stay within the approved width and zoom matrix", async ({ page }) => {
  for (const width of [1920, 1280, 1024, 768, 390]) {
    for (const zoom of [1, 1.25, 1.5]) {
      const effectiveWidth = Math.floor(width / zoom);
      await page.setViewportSize({ width: effectiveWidth, height: Math.floor(1000 / zoom) });
      for (const route of auditedRoutes) {
        await page.goto(route);
        const geometry = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerRight: document.querySelector(".site-header")?.getBoundingClientRect().right ?? 0,
          viewportWidth: window.innerWidth,
        }));
        expect(geometry.scrollWidth, `${route} at ${width}px/${zoom * 100}%`).toBeLessThanOrEqual(geometry.clientWidth + 1);
        expect(geometry.headerRight, `${route} header at ${width}px/${zoom * 100}%`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      }
    }
  }
});

test("Anatomy captions teach the observation before technical provenance", async ({ page }) => {
  await page.goto("/anatomy/camera-angle/");
  const example = page.locator("[data-example-role]").first();
  await expect(example.locator("[data-observation-caption]")).toBeVisible();
  await expect(example.locator("[data-technical-caption]")).toBeHidden();
  await example.locator("summary").click();
  await expect(example.locator("[data-technical-caption]")).toBeVisible();
});

test("shared discovery routes avoid speculative prefetch and serious accessibility regressions", async ({ page }) => {
  for (const route of ["/", "/discover/", "/anatomy/"]) {
    const failures: string[] = [];
    const speculativeRequests: string[] = [];
    const recordResponse = (response: import("@playwright/test").Response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    };
    const recordRequest = (request: Request) => {
      if (request.resourceType() === "other" && new URL(request.url()).origin === testOrigin) {
        speculativeRequests.push(new URL(request.url()).pathname);
      }
    };
    page.on("response", recordResponse);
    page.on("request", recordRequest);
    await page.goto(route);
    await page.waitForTimeout(400);
    await expect(page.locator('script[type="speculationrules"]')).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
    expect(failures).toEqual([]);
    expect(speculativeRequests).toEqual([]);
    page.off("response", recordResponse);
    page.off("request", recordRequest);
  }
});

test("late mobile discovery positioning does not contribute layout shift", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.addInitScript(() => {
    const metrics = { cls: 0 };
    Object.defineProperty(window, "__promptAtlasShift", { value: metrics, configurable: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route("**/_astro/BaseLayout*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.goto("/discover/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const cls = await page.evaluate(() => (
    window as typeof window & { __promptAtlasShift: { cls: number } }
  ).__promptAtlasShift.cls);

  expect(cls).toBeLessThanOrEqual(0.01);
});

test("mobile Home selects a responsive hero asset", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto("/");
  const mobileSource = page.locator('.hero__output source[media="(max-width: 820px)"]');
  const hero = page.locator(".hero__output img");

  await expect(mobileSource).toHaveAttribute("srcset", /cyberpunk-plus-ukiyo-e-plus-glitch-art-chatgpt-mobile\.webp$/u);
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname))
    .toMatch(/cyberpunk-plus-ukiyo-e-plus-glitch-art-chatgpt-mobile\.webp$/u);
});

test("mobile Home LCP title uses a network-independent font stack", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto("/");
  const fontFamily = await page.locator("#hero-title").evaluate((title) => getComputedStyle(title).fontFamily);

  expect(fontFamily).not.toContain("Instrument Sans Variable");
  expect(fontFamily).toContain("system-ui");
});

test("production pages inline the global stylesheet", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
});

test("below-fold Home cards do not compete with the hero image", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto("/");
  const cardImages = page.locator("[data-style-card] img");

  await expect(cardImages.first()).toHaveAttribute("loading", "lazy");
  await expect(cardImages.first()).not.toHaveAttribute("fetchpriority", "high");
});

test("Anatomy preloads metric fonts without penalizing Home", async ({ page }) => {
  await page.goto("/anatomy/");
  const preloadNames = await page.locator('link[rel="preload"][as="font"]').evaluateAll((links) => (
    links.map((link) => new URL((link as HTMLLinkElement).href).pathname.split("/").pop() ?? "")
  ));

  expect(preloadNames).toEqual(expect.arrayContaining([
    expect.stringMatching(/^ibm-plex-mono-latin-600-normal\./u),
    expect.stringMatching(/^ibm-plex-mono-vietnamese-600-normal\./u),
  ]));
  expect(preloadNames.filter((name) => name.startsWith("instrument-sans-"))).toEqual([]);
  const metricFontRequests = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes("ibm-plex-mono-")));
  expect(metricFontRequests.some((name) => name.includes("latin-ext") || name.includes("cyrillic"))).toBe(false);

  await page.goto("/");
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);
});

test("Spotlight index stays off the critical HTML path and loads on demand", async ({ page }) => {
  await page.goto("/");
  const indexSource = page.locator("#spotlight-index");
  await expect(indexSource).toHaveAttribute("data-index-url", "/spotlight-index.json");
  expect(await indexSource.evaluate((element) => element.textContent)).toBe("[]");

  const indexRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/spotlight-index.json");
  await page.getByRole("button", { name: /Tìm trong Prompt Atlas/u }).click();
  await indexRequest;
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await dialog.getByRole("combobox").fill("góc máy");
  await expect(dialog.locator("[data-spotlight-result-row]").first()).toBeVisible();
});

test("core discovery routes keep LCP and CLS within the approved local thresholds", async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 };
    Object.defineProperty(window, "__promptAtlasVitals", { value: metrics, configurable: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = Math.max(metrics.lcp, entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  for (const route of auditedRoutes) {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const metrics = await page.evaluate(() => (
      window as typeof window & { __promptAtlasVitals: { lcp: number; cls: number } }
    ).__promptAtlasVitals);
    expect(metrics.lcp, `${route} LCP`).toBeGreaterThan(0);
    expect(metrics.lcp, `${route} LCP`).toBeLessThanOrEqual(2500);
    expect(metrics.cls, `${route} CLS`).toBeLessThanOrEqual(0.1);
  }
});
