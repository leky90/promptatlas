import { expect, test, type Page } from "@playwright/test";

const heroRoutes = [
  ["/", "contrast", "home"],
  ["/discover/", "concept", "discover"],
  ["/anatomy/", "concept", "anatomy"],
  ["/compare/", "contrast", "compare"],
  ["/composer/", "action", "composer"],
  ["/review/", "focus", "review"],
] as const;

const pixelEvidenceRoutes = new Set(["/", "/discover/", "/composer/", "/review/"]);

async function inspectHeroInk(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator(".hero-title").evaluate((element) => {
    type Rect = { bottom: number; left: number; right: number; top: number };
    type Surface = { bounds: Rect; name: string; owner: Element };

    const toRect = (rect: DOMRect, outset = 0): Rect => ({
      bottom: rect.bottom + outset,
      left: rect.left - outset,
      right: rect.right + outset,
      top: rect.top - outset,
    });
    const describe = (node: Element) => {
      const html = node as HTMLElement;
      const classes = typeof html.className === "string" && html.className.trim()
        ? `.${html.className.trim().replace(/\s+/gu, ".")}`
        : "";
      return `${node.tagName.toLowerCase()}${html.id ? `#${html.id}` : ""}${classes}`;
    };
    const clips = (value: string) => ["auto", "clip", "hidden", "scroll"].includes(value);
    const length = (value: string) => Number.parseFloat(value) || 0;
    const titleStyle = getComputedStyle(element);
    const titleRect = element.getBoundingClientRect();
    const titleStroke = length(titleStyle.getPropertyValue("-webkit-text-stroke-width"));
    const surfaces: Surface[] = [{ bounds: toRect(titleRect, titleStroke), name: "title", owner: element }];
    const emphasis = element.querySelector("em");
    const emphasisRects = emphasis ? [...emphasis.getClientRects()] : [];
    let emphasisEvidence: null | {
      fontStyle: string;
      horizontalOverhang: { left: number; right: number };
      lineBounds: Rect[];
      strokeWidth: number;
    } = null;
    let marker: null | { bounds: Rect; background: string; content: string } = null;

    if (emphasis) {
      const style = getComputedStyle(emphasis);
      const strokeWidth = length(style.getPropertyValue("-webkit-text-stroke-width"));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context is required for hero ink measurement");
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = emphasis.textContent ?? "";
      const metrics = context.measureText(text);
      const horizontalOverhang = {
        left: Math.max(0, metrics.actualBoundingBoxLeft),
        right: Math.max(0, metrics.actualBoundingBoxRight - metrics.width),
      };
      const lineBounds = emphasisRects.map((rect) => ({
        bottom: rect.bottom + strokeWidth,
        left: rect.left - horizontalOverhang.left - strokeWidth,
        right: rect.right + horizontalOverhang.right + strokeWidth,
        top: rect.top - strokeWidth,
      }));
      for (const [index, bounds] of lineBounds.entries()) {
        surfaces.push({ bounds, name: `emphasis-line-${index + 1}`, owner: emphasis });
      }
      emphasisEvidence = { fontStyle: style.fontStyle, horizontalOverhang, lineBounds, strokeWidth };

      const pseudo = getComputedStyle(emphasis, "::after");
      if (pseudo.content !== "none") {
        const anchor = emphasisRects.at(-1);
        if (!anchor) throw new Error("Decorated emphasis has no rendered line box");
        const bottom = anchor.bottom - length(pseudo.bottom);
        const bounds = {
          bottom,
          left: anchor.left + length(pseudo.left),
          right: anchor.right - length(pseudo.right),
          top: bottom - length(pseudo.height),
        };
        marker = { background: pseudo.backgroundColor, bounds, content: pseudo.content };
        surfaces.push({ bounds, name: "marker", owner: emphasis });
      }
    }

    const clippingAncestors = new Map<string, { bounds: Rect; overflowX: string; overflowY: string }>();
    const clippedInk: string[] = [];
    for (const surface of surfaces) {
      for (let ancestor: Element | null = surface.owner; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = clips(style.overflowX);
        const clipsY = clips(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const html = ancestor as HTMLElement;
        const rect = ancestor.getBoundingClientRect();
        const bounds = {
          bottom: rect.top + html.clientTop + html.clientHeight,
          left: rect.left + html.clientLeft,
          right: rect.left + html.clientLeft + html.clientWidth,
          top: rect.top + html.clientTop,
        };
        const label = describe(ancestor);
        clippingAncestors.set(label, { bounds, overflowX: style.overflowX, overflowY: style.overflowY });
        const outsideX = clipsX && (surface.bounds.left < bounds.left - 0.5 || surface.bounds.right > bounds.right + 0.5);
        const outsideY = clipsY && (surface.bounds.top < bounds.top - 0.5 || surface.bounds.bottom > bounds.bottom + 0.5);
        if (outsideX || outsideY) clippedInk.push(`${surface.name} outside ${label}`);
      }
    }

    const faces = [...document.fonts]
      .filter((face) => face.family.replace(/["']/gu, "") === "Instrument Sans Variable")
      .map((face) => ({ status: face.status, style: face.style, weight: face.weight }));
    const covers = (fontStyle: string, weight: number) => faces.some((face) => {
      const [minimum, maximum = minimum] = face.weight.split(/\s+/u).map(Number);
      return face.status === "loaded" && face.style === fontStyle && weight >= minimum && weight <= maximum;
    });
    const emphasisStyle = emphasis ? getComputedStyle(emphasis) : null;
    const renderedBounds = surfaces.map(({ bounds, name }) => ({ bounds, name }));
    const union = renderedBounds.reduce((current, surface) => ({
      bottom: Math.max(current.bottom, surface.bounds.bottom),
      left: Math.min(current.left, surface.bounds.left),
      right: Math.max(current.right, surface.bounds.right),
      top: Math.min(current.top, surface.bounds.top),
    }), toRect(titleRect));
    const padding = 8;
    const clipLeft = Math.max(0, Math.floor(union.left - padding));
    const clipTop = Math.max(0, Math.floor(union.top - padding));
    const clipRight = Math.min(innerWidth, Math.ceil(union.right + padding));
    const clipBottom = Math.min(innerHeight, Math.ceil(union.bottom + padding));

    return {
      clippedInk: [...new Set(clippedInk)],
      clippingAncestors: [...clippingAncestors.entries()].map(([name, value]) => ({ name, ...value })),
      emphasis: emphasisEvidence,
      fontEvidence: {
        italicLoaded: emphasisStyle ? covers("italic", Number(emphasisStyle.fontWeight)) : false,
        normalLoaded: covers("normal", Number(titleStyle.fontWeight)),
        status: document.fonts.status,
      },
      marker,
      renderedBounds,
      screenshotClip: {
        height: Math.max(1, clipBottom - clipTop),
        width: Math.max(1, clipRight - clipLeft),
        x: clipLeft,
        y: clipTop,
      },
      title: toRect(titleRect, titleStroke),
      viewport: {
        clientWidth: document.documentElement.clientWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
      },
    };
  });
}

test("all approved hero titles fit desktop and mobile without clipping", async ({ page }) => {
  let clippingAncestorsInspected = 0;
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [route, variant, snapshotName] of heroRoutes) {
      await page.goto(route);
      const audit = await inspectHeroInk(page);
      expect(audit.fontEvidence.status, `${route} font set at ${viewport.width}px`).toBe("loaded");
      expect(audit.fontEvidence.normalLoaded, `${route} normal face at ${viewport.width}px`).toBe(true);
      if (variant === "concept") {
        expect(audit.fontEvidence.italicLoaded, `${route} italic face at ${viewport.width}px`).toBe(true);
      }
      expect(audit.title.left, `${route} left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
      expect(audit.title.right, `${route} right edge at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      expect(audit.title.top, `${route} diacritic top at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
      expect(audit.title.bottom, `${route} bottom edge at ${viewport.width}px`).toBeLessThanOrEqual(viewport.height + 1);
      expect(audit.viewport.scrollWidth, `${route} horizontal overflow at ${viewport.width}px`)
        .toBeLessThanOrEqual(audit.viewport.clientWidth + 1);
      clippingAncestorsInspected += audit.clippingAncestors.length;
      expect(audit.clippedInk, `${route} clipped decorated ink at ${viewport.width}px`).toEqual([]);

      for (const surface of audit.renderedBounds) {
        expect(surface.bounds.left, `${route} ${surface.name} left at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
        expect(surface.bounds.right, `${route} ${surface.name} right at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
        expect(surface.bounds.top, `${route} ${surface.name} top at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
        expect(surface.bounds.bottom, `${route} ${surface.name} bottom at ${viewport.width}px`).toBeLessThanOrEqual(viewport.height + 1);
      }

      if (variant === "focus") {
        expect(audit.emphasis, `${route} focus emphasis at ${viewport.width}px`).toBeNull();
      } else {
        expect(audit.emphasis?.lineBounds.length, `${route} emphasis lines at ${viewport.width}px`).toBeGreaterThan(0);
      }
      if (variant === "action") {
        expect(audit.marker?.content, `${route} marker content at ${viewport.width}px`).not.toBe("none");
        expect(audit.marker?.background, `${route} marker fill at ${viewport.width}px`).not.toBe("rgba(0, 0, 0, 0)");
      } else {
        expect(audit.marker, `${route} unexpected marker at ${viewport.width}px`).toBeNull();
      }

      if (pixelEvidenceRoutes.has(route)) {
        await expect(page).toHaveScreenshot(`hero-ink-${snapshotName}-${viewport.width}.png`, {
          animations: "disabled",
          caret: "hide",
          clip: audit.screenshotClip,
        });
      }
    }
  }
  expect(clippingAncestorsInspected, "clipping ancestors inspected across the route matrix").toBeGreaterThan(0);
});

test("hero ink audit catches clipped markers even when document overflow is suppressed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/composer/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".hero-title").evaluate((title) => {
    (title as HTMLElement).style.overflow = "clip";
    const emphasis = title.querySelector("em") as HTMLElement;
    emphasis.style.display = "inline-block";
    emphasis.style.transform = "translateX(320px)";
  });

  const audit = await inspectHeroInk(page);
  expect(audit.viewport.scrollWidth).toBeLessThanOrEqual(audit.viewport.clientWidth + 1);
  expect(audit.clippedInk).toContain("marker outside h1#composer-title.hero-title.hero-title--action");
});

test("tablet discovery and Composer remain usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/discover/");

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

  const toggle = page.locator("[data-facet-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.locator('[data-dimension-filter="composition.aspect-ratio"]').click();
  await expect(page).toHaveURL(/dimension=composition.aspect-ratio/u);

  const add = page.locator("[data-primitive-card]:visible").first().getByRole("button", { name: /Thêm .* vào prompt/u });
  await add.click();
  await expect(page.locator("[data-composer-tray]")).toContainText("1 thành phần");
  await page.locator("[data-composer-tray] summary").click();
  await page.locator("[data-composer-tray]").getByRole("link", { name: "Mở Composer" }).click();
  await expect(page.locator("[data-composer-workspace]")).toBeVisible();
});

test("mobile navigation and core layouts remain usable", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator("[data-nav-toggle]");
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator("[data-site-nav]")).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-site-nav]").getByRole("link", { name: "Kiểm chứng provider" })).toBeVisible();

  await page.locator("[data-style-search]").fill("watercolor");
  await expect(page.locator("[data-result-count]")).not.toHaveText("00");
  await expect(page.locator('[data-style-card][data-slug="watercolor"]')).toBeVisible();

  await page.goto("/compare/?style=watercolor");
  await expect(page.locator("[data-compare-select]")).toBeVisible();
  await expect(page.locator("[data-compare-name]")).toHaveText("Màu nước");
  await expect(page.locator("[data-compare-image]")).toHaveCount(2);
  await expect(page.locator("[data-score-axis]")).toHaveCount(3);
  const compareViewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(compareViewport.scrollWidth).toBeLessThanOrEqual(compareViewport.clientWidth);
});

test("mobile discovery uses a facet drawer and keeps composer entry reachable", async ({ page }) => {
  await page.goto("/discover/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ngôn ngữ nhìn thấy");
  await expect(page.locator("[data-primitive-card]:visible")).toHaveCount(24);

  const toggle = page.locator("[data-facet-toggle]");
  const panel = page.locator("[data-facet-panel]");
  await expect(toggle).toBeVisible();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await toggle.click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).not.toHaveAttribute("aria-hidden", "true");
  await expect(panel).not.toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(false);

  await page.getByRole("button", { name: "Đóng taxonomy" }).click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('[data-dimension-filter="camera.shot-size"]').click();
  await expect(page).toHaveURL(/dimension=camera.shot-size/u);
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(panel).toHaveAttribute("hidden", "");
  expect(await panel.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(toggle).toBeFocused();
  await expect(page.locator("[data-result-count]")).not.toHaveText("0");

  const add = page.locator("[data-primitive-card]:visible").first().getByRole("button", { name: /Thêm .* vào prompt/u });
  const addBox = await add.boundingBox();
  expect(addBox?.height).toBeGreaterThanOrEqual(44);
  await add.click();
  await expect(page.locator("[data-composer-tray]")).toBeVisible();
  await expect(page.locator("[data-composer-tray]")).toContainText("1 thành phần");
  await expect(page.getByText(/^Video$/u)).toHaveCount(0);
});

test("mobile methodology anchors clear the sticky header", async ({ page }) => {
  await page.goto("/methodology/");
  await page.getByRole("link", { name: "01 / Thiết lập" }).click();
  await expect(page).toHaveURL(/#setup$/);
  const sectionTop = await page.locator("#setup").evaluate((element) => element.getBoundingClientRect().top);
  const headerHeight = await page.locator(".site-header").evaluate((element) => element.getBoundingClientRect().height);
  expect(sectionTop).toBeGreaterThanOrEqual(headerHeight);
});

test("mobile composer tray exposes the active recipe without covering controls", async ({ page }) => {
  await page.goto("/");
  for (const card of [page.locator("[data-style-card]").first(), page.locator("[data-style-card]").nth(1)]) {
    await card.locator("[data-prompt-disclosure] summary").click();
    await card.getByRole("button", { name: /Thêm .* vào prompt/u }).click();
  }
  const tray = page.locator("[data-composer-tray]");
  await expect(tray).toBeVisible();
  await expect(tray).toContainText("2 thành phần");
  await expect(tray).not.toHaveAttribute("open", "");
  expect(await tray.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");
  await tray.locator("summary").click();
  await expect(tray).toHaveAttribute("open", "");
  await tray.getByRole("link", { name: "Mở Composer" }).click();
  await expect(page).toHaveURL(/\/composer\/$/u);
  await expect(page.locator("[data-composer-workspace]")).toBeVisible();
  const copy = page.getByRole("button", { name: "Sao chép prompt" });
  await expect(copy).toBeVisible();
  const copyBox = await copy.boundingBox();
  expect(copyBox?.height).toBeGreaterThanOrEqual(44);
  const firstItem = page.locator("[data-recipe-item]").first();
  const down = firstItem.getByRole("button", { name: "Đưa xuống" });
  await down.focus();
  await expect(down).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-composer-live]")).toContainText("Đã đưa");
  await expect(page.getByText(/^Video$/u)).toHaveCount(0);
});

test("mobile Image Anatomy keeps filters and evidence within the viewport", async ({ page }) => {
  await page.goto("/anatomy/");
  await page.locator('[data-category-filter="camera"]').click();
  await expect(page.locator('[data-anatomy-dimension="camera.angle"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/anatomy/subject-person-role/");
  await expect(page.locator('[data-value-tier="core"]')).not.toHaveCount(0);
  await expect(page.locator('[data-value-tier="advanced"]')).not.toHaveCount(0);
  await expect(page.locator("main img[alt]").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
