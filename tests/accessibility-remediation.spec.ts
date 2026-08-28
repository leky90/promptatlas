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

test("primary keyboard journeys keep route controls visibly focused and unobscured", async ({ page }) => {
  const journeys = [
    {
      route: "/",
      targets: ["#style-search", "[data-facet-filter='all']", "[data-saved-filter]", ".style-card__link"],
    },
    {
      route: "/discover/",
      targets: ["#primitive-search", "[data-skip-to-results]", "[data-group-filter='all']", "[data-composer-add]"],
    },
    {
      route: "/anatomy/",
      targets: ["#anatomy-search", "[data-category-filter='all']", "[data-anatomy-dimension] a"],
    },
  ] as const;

  for (const { route, targets } of journeys) {
    await page.goto(route);

    for (const target of targets) {
      let reached = false;
      for (let step = 0; step < 260; step += 1) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate((selector) => document.activeElement?.matches(selector) ?? false, target);
        if (reached) break;
      }
      expect(reached, `${route} keyboard target ${target}`).toBe(true);
      await page.waitForFunction(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return false;
        const rect = active.getBoundingClientRect();
        return rect.bottom > 0
          && rect.right > 0
          && rect.top < window.innerHeight
          && rect.left < window.innerWidth;
      });

      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        const style = getComputedStyle(active);
        const rect = active.getBoundingClientRect();
        const insetX = Math.min(4, rect.width / 4);
        const insetY = Math.min(4, rect.height / 4);
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + insetX, rect.top + insetY],
          [rect.right - insetX, rect.top + insetY],
          [rect.left + insetX, rect.bottom - insetY],
          [rect.right - insetX, rect.bottom - insetY],
        ];
        const unobscuredPoints = points.filter(([x, y]) => {
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
          const hit = document.elementFromPoint(x, y);
          return hit !== null && (hit === active || active.contains(hit));
        }).length;
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
          unobscuredPoints,
        };
      });

      expect(focus, `${route} ${target}`).not.toBeNull();
      expect(focus?.tag, `${route} ${target}`).not.toBe("body");
      expect(focus?.outlineStyle, `${route} ${target}`).not.toBe("none");
      expect(focus?.outlineWidth, `${route} ${target}`).toBeGreaterThanOrEqual(2);
      expect(focus?.visible, `${route} ${target}`).toBe(true);
      expect(focus?.unobscuredPoints, `${route} ${target}`).toBeGreaterThan(0);
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
