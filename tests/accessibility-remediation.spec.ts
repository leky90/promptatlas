import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const primaryRoutes = ["/", "/discover/", "/anatomy/"] as const;

test("WCAG text-spacing overrides preserve every home prompt cue", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({
    content: `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }

      p {
        margin-bottom: 2em !important;
      }
    `,
  });

  const clipped = await page.locator(".style-card__prompt-cue").evaluateAll((elements) =>
    elements
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
      .map((element) => ({
        cue: element.textContent?.trim().slice(0, 80),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
  );

  expect(clipped).toEqual([]);
});

test("every aria-labelledby reference resolves on the primary routes", async ({ page }) => {
  for (const route of primaryRoutes) {
    await page.goto(route);
    const missing = await page.locator("[aria-labelledby]").evaluateAll((elements) =>
      elements.flatMap((element) =>
        (element.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/u)
          .filter(Boolean)
          .filter((id) => document.getElementById(id) === null)
          .map((id) => ({ id, element: element.outerHTML.slice(0, 160) })),
      ),
    );
    expect(missing, route).toEqual([]);
  }
});

test("primary keyboard journeys keep a visible, unobscured focus indicator", async ({ page }) => {
  for (const route of primaryRoutes) {
    await page.goto(route);
    await page.locator("body").press("Tab");

    for (let step = 0; step < 8; step += 1) {
      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        const style = getComputedStyle(active);
        const rect = active.getBoundingClientRect();
        return {
          tag: active.tagName.toLowerCase(),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          visible:
            rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth,
        };
      });

      expect(focus, `${route} keyboard step ${step + 1}`).not.toBeNull();
      expect(focus?.tag, `${route} keyboard step ${step + 1}`).not.toBe("body");
      expect(focus?.outlineStyle, `${route} keyboard step ${step + 1}`).not.toBe("none");
      expect(focus?.outlineWidth, `${route} keyboard step ${step + 1}`).toBeGreaterThanOrEqual(2);
      expect(focus?.visible, `${route} keyboard step ${step + 1}`).toBe(true);
      await page.keyboard.press("Tab");
    }
  }
});

test("primary routes have no critical or serious automated accessibility violations", async ({ page }) => {
  for (const route of primaryRoutes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => item.impact === "critical" || item.impact === "serious"),
      route,
    ).toEqual([]);
  }
});
