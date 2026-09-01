import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/discover/",
  "/anatomy/",
  "/composer/",
  "/review",
  "/compare/",
  "/methodology/",
  "/about/",
  "/privacy/",
  "/terms/",
] as const;

const heroRoutes = [
  ["/", "contrast"],
  ["/discover/", "concept"],
  ["/anatomy/", "concept"],
  ["/compare/", "contrast"],
  ["/composer/", "action"],
  ["/review/", "focus"],
] as const;

test("hero measurements wait for the actual normal and italic Instrument Sans faces", async ({ page }) => {
  await page.route(/instrument-sans-.*\.woff2$/u, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  for (const [route, variant] of [
    ["/", "contrast"],
    ["/discover/", "concept"],
  ] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const evidence = await page.locator(`.hero-title--${variant}`).evaluate((element) => {
      const titleStyle = getComputedStyle(element);
      const emphasis = element.querySelector("em");
      const emphasisStyle = emphasis ? getComputedStyle(emphasis) : null;
      const faces = [...document.fonts]
        .filter((face) => face.family.replace(/["']/gu, "") === "Instrument Sans Variable")
        .map((face) => ({ status: face.status, style: face.style, weight: face.weight }));
      const covers = (style: string, weight: number) => faces.some((face) => {
        const [minimum, maximum = minimum] = face.weight.split(/\s+/u).map(Number);
        return face.status === "loaded" && face.style === style && weight >= minimum && weight <= maximum;
      });
      return {
        status: document.fonts.status,
        normalLoaded: covers("normal", Number(titleStyle.fontWeight)),
        italicLoaded: emphasisStyle ? covers("italic", Number(emphasisStyle.fontWeight)) : false,
      };
    });

    expect(evidence.status, `${route} font set`).toBe("loaded");
    expect(evidence.normalLoaded, `${route} normal face`).toBe(true);
    if (variant === "concept") expect(evidence.italicLoaded, `${route} italic face`).toBe(true);
  }
});

test("hero titles share one foundation and render only their semantic emphasis", async ({ page }) => {
  for (const [route, variant] of heroRoutes) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const title = page.locator(`.hero-title--${variant}`);
    await expect(title).toHaveCount(1);

    const titleStyle = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      const emphasis = element.querySelector("em");
      const emphasisStyle = emphasis ? getComputedStyle(emphasis) : null;
      const faces = [...document.fonts]
        .filter((face) => face.family.replace(/["']/gu, "") === "Instrument Sans Variable")
        .map((face) => ({ status: face.status, style: face.style, weight: face.weight }));
      const covers = (fontStyle: string, weight: number) => faces.some((face) => {
        const [minimum, maximum = minimum] = face.weight.split(/\s+/u).map(Number);
        return face.status === "loaded" && face.style === fontStyle && weight >= minimum && weight <= maximum;
      });
      return {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        synthesis: style.fontSynthesis,
        fontSetStatus: document.fonts.status,
        normalFaceLoaded: covers("normal", Number(style.fontWeight)),
        italicFaceLoaded: emphasisStyle ? covers("italic", Number(emphasisStyle.fontWeight)) : false,
      };
    });

    expect(titleStyle.family).toContain("Instrument Sans");
    expect(Number(titleStyle.weight)).toBe(620);
    expect(Number.parseFloat(titleStyle.lineHeight) / Number.parseFloat(titleStyle.size)).toBeCloseTo(0.9, 5);
    expect(Number.parseFloat(titleStyle.letterSpacing) / Number.parseFloat(titleStyle.size)).toBeCloseTo(-0.06, 5);
    expect(titleStyle.synthesis).toContain("none");
    expect(titleStyle.fontSetStatus).toBe("loaded");
    expect(titleStyle.normalFaceLoaded, `${route} normal Instrument Sans face`).toBe(true);

    const emphasis = title.locator("em");
    if (variant === "focus") {
      await expect(emphasis).toHaveCount(0);
    } else {
      await expect(emphasis).toHaveCount(1);
    }
    if (variant === "concept") {
      await expect(emphasis).toHaveCSS("font-style", "italic");
      expect(titleStyle.italicFaceLoaded, `${route} italic Instrument Sans face`).toBe(true);
    }
  }
});

test("primary routes share the approved typography tokens and hero scale", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const heroSizes: number[] = [];

    for (const route of routes) {
      await page.goto(route);
      const styles = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        const heading = getComputedStyle(document.querySelector("h1")!);
        return {
          meta: root.getPropertyValue("--type-meta").trim(),
          control: root.getPropertyValue("--type-control").trim(),
          card: root.getPropertyValue("--type-card").trim(),
          hero: root.getPropertyValue("--type-hero").trim(),
          bodyFamily: body.fontFamily,
          heroSize: Number.parseFloat(heading.fontSize),
        };
      });

      expect(Number.parseFloat(styles.meta) * 16, `${route} metadata token`).toBe(12);
      expect(Number.parseFloat(styles.control) * 16, `${route} control token`).toBe(13);
      expect(Number.parseFloat(styles.card) * 16, `${route} card token`).toBe(14);
      expect(styles.hero, `${route} hero token`).toContain("clamp(");
      expect(styles.bodyFamily, `${route} display font`).toContain("Instrument Sans");
      heroSizes.push(styles.heroSize);
    }

    expect(Math.max(...heroSizes) - Math.min(...heroSizes), `${width}px hero scale`).toBeLessThanOrEqual(1);
  }

  await page.goto("/review");
  await expect(page.locator("[data-review-status] small").first()).toHaveCSS("font-family", /IBM Plex Mono/u);
});

test("meaningful text and controls meet the approved size and contrast floors", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const audit = await page.evaluate(() => {
      const readableSelector = "p, small, dt, dd, label, button, input, select, textarea, summary, figcaption, a";
      const controlSelector = "button, input, select, textarea, summary, label";
      const faint = "rgb(152, 153, 145)";
      const isVisible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const describe = (element: Element) => {
        const html = element as HTMLElement;
        return `${element.tagName.toLowerCase()}${html.id ? `#${html.id}` : ""}${html.className && typeof html.className === "string" ? `.${html.className.trim().replace(/\s+/gu, ".")}` : ""}`;
      };
      const readable = [...document.querySelectorAll(readableSelector)].filter(isVisible);
      const controls = [...document.querySelectorAll(controlSelector)].filter(isVisible);
      const undersizedText = readable
        .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 11)
        .map(describe);
      const undersizedControls = controls
        .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 12)
        .map(describe);
      const faintReadableText = readable
        .filter((element) => getComputedStyle(element).color === faint)
        .map(describe);
      return { undersizedText, undersizedControls, faintReadableText };
    });

    expect(audit.undersizedText, `${route} readable text below 11px`).toEqual([]);
    expect(audit.undersizedControls, `${route} controls below 12px`).toEqual([]);
    expect(audit.faintReadableText, `${route} readable ink-faint text`).toEqual([]);
  }

  for (const [route, selector] of [
    ["/", ".style-card__prompt-cue"],
    ["/discover/", ".primitive-card__definition"],
    ["/anatomy/", ".anatomy-dimension-grid article > a > p"],
  ] as const) {
    await page.goto(route);
    const sizes = await page.locator(selector).evaluateAll((elements) =>
      elements.filter((element) => element.getBoundingClientRect().height > 0)
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
    expect(Math.min(...sizes), `${route} card description floor`).toBeGreaterThanOrEqual(14);
  }
});

test("primary routes survive a 200 percent effective zoom with visible keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 500 });

  for (const route of routes) {
    await page.goto(route);
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(width.scroll, `${route} at 200% effective zoom`).toBeLessThanOrEqual(width.client + 1);

    await page.locator("body").press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus, `${route} focus target`).not.toBeNull();
    expect(focus?.outlineStyle, `${route} focus outline`).not.toBe("none");
    expect(focus?.outlineWidth, `${route} focus width`).toBeGreaterThanOrEqual(2);
  }
});

test("primary routes have no serious automated accessibility regressions", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious, route).toEqual([]);
  }
});
