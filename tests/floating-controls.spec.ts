import { expect, test } from "@playwright/test";

const supportedRoutes = ["/", "/discover/", "/anatomy/", "/composer/", "/compare/", "/methodology/"];

const rectanglesOverlap = (first: { top: number; right: number; bottom: number; left: number }, second: { top: number; right: number; bottom: number; left: number }, gap = 4) => (
  first.bottom > second.top - gap
  && first.top < second.bottom + gap
  && first.right > second.left - gap
  && first.left < second.right + gap
);

test("floating controls expose search and shortcut help without collisions", async ({ page }) => {
  test.setTimeout(60_000);
  for (const width of [1920, 1280, 1024, 768, 390]) {
    for (const zoom of [1, 1.25, 1.5]) {
      const effectiveWidth = Math.floor(width / zoom);
      await page.setViewportSize({ width: effectiveWidth, height: Math.floor((width === 390 ? 844 : 900) / zoom) });
      for (const route of supportedRoutes) {
        await page.goto(route);

      const launcher = page.getByRole("button", { name: "Tìm trong Prompt Atlas" });
      const help = page.getByRole("button", { name: "Xem hướng dẫn phím tắt" });
      await expect(launcher).toBeVisible();
      await expect(help).toBeVisible();
      await expect(page.locator(".site-header [data-spotlight-trigger]")).toHaveCount(0);

      const geometry = await page.evaluate(() => {
        const launcher = document.querySelector<HTMLElement>("[data-spotlight-launcher]")!.getBoundingClientRect();
        const help = document.querySelector<HTMLElement>("[data-shortcut-trigger]")!.getBoundingClientRect();
        return {
          launcher,
          help,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      expect(geometry.launcher.height).toBeGreaterThanOrEqual(44);
      expect(geometry.help.width).toBeGreaterThanOrEqual(44);
      expect(geometry.help.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs((geometry.launcher.left + geometry.launcher.right) / 2 - geometry.viewportWidth / 2), `${route} at ${width}px/${zoom * 100}%`).toBeLessThanOrEqual(1);
        expect(geometry.launcher.right, `${route} launcher at ${width}px/${zoom * 100}%`).toBeLessThanOrEqual(geometry.help.left - 4);
        expect(geometry.launcher.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
        expect(geometry.help.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
        expect(geometry.documentWidth, `${route} width at ${width}px/${zoom * 100}%`).toBeLessThanOrEqual(geometry.clientWidth + 1);
      }
    }
  }
});

test("floating controls clear protected content and refinement actions", async ({ page }) => {
  const viewportMatrix = [1920, 1280, 1024, 768, 390].flatMap((width) => [1, 1.25, 1.5].map((zoom) => ({
    width: Math.floor(width / zoom),
    height: Math.floor((width === 390 ? 844 : 900) / zoom),
  })));
  const scenarios = [
    ...viewportMatrix.map((viewport) => ({
      route: "/anatomy/",
      ...viewport,
      targets: ".anatomy-hero > *, [data-catalog-toolbar] [data-catalog-search], [data-catalog-toolbar] [data-catalog-filters], [data-catalog-toolbar] [data-catalog-status]",
    })),
    ...viewportMatrix.map((viewport) => ({
      route: "/discover/",
      ...viewport,
      targets: ".discover-intro__copy > *, .discover-specimens figure, [data-catalog-toolbar] [data-catalog-search], [data-catalog-toolbar] .discover-toolbar__actions, .taxonomy-quick",
    })),
    { route: "/anatomy/subject-person-role/", width: 1024, height: 720, targets: ".anatomy-refinement-journey h2, .anatomy-refinement-journey p, .anatomy-refinement-journey .button" },
    { route: "/anatomy/subject-person-role/", width: 819, height: 720, targets: ".anatomy-refinement-journey h2, .anatomy-refinement-journey p, .anatomy-refinement-journey .button" },
    { route: "/anatomy/subject-person-role/", width: 1440, height: 1000, targets: ".anatomy-refinement-journey h2, .anatomy-refinement-journey p, .anatomy-refinement-journey .button" },
    { route: "/anatomy/camera-angle/", width: 390, height: 844, targets: ".anatomy-refinement-journey h2, .anatomy-refinement-journey p, .anatomy-refinement-journey .button" },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(scenario.route);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const geometry = await page.evaluate((targetSelector) => ({
      controls: [
        document.querySelector<HTMLElement>("[data-spotlight-launcher]")!.getBoundingClientRect(),
        document.querySelector<HTMLElement>("[data-shortcut-trigger]")!.getBoundingClientRect(),
      ],
      targets: [...document.querySelectorAll<HTMLElement>(targetSelector)]
        .filter((target) => target.getClientRects().length > 0)
        .map((target) => target.getBoundingClientRect()),
      headerBottom: document.querySelector<HTMLElement>(".site-header")!.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }), scenario.targets);

    for (const control of geometry.controls) {
      expect(control.top, `${scenario.route} control top at ${scenario.width}x${scenario.height}`).toBeGreaterThanOrEqual(geometry.headerBottom + 4);
      expect(control.bottom, `${scenario.route} control bottom at ${scenario.width}x${scenario.height}`).toBeLessThanOrEqual(geometry.viewportHeight);
      for (const target of geometry.targets) {
        expect(rectanglesOverlap(control, target), `${scenario.route} at ${scenario.width}x${scenario.height}`).toBe(false);
      }
    }
  }
});

test("floating controls preserve scroll position and stay collision-free on Discover", async ({ page }) => {
  const targetSelector = ".discover-intro__copy > *, .discover-specimens figure, .discovery-layer-guide a, [data-catalog-toolbar] [data-catalog-search], [data-catalog-toolbar] .discover-toolbar__actions, .taxonomy-quick, .primitive-card__anatomy-link";
  const scenarios = [
    { width: 1024, height: 720, scrollY: [80, 15, 500, 1510] },
    { width: 819, height: 720, scrollY: [80, 15, 200, 320, 2231] },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto("/discover/");
    for (const scrollY of scenario.scrollY) {
      await page.evaluate((nextScrollY) => window.scrollTo(0, nextScrollY), scrollY);
      await expect.poll(() => page.evaluate(() => window.scrollY), {
        message: `${scenario.width}x${scenario.height} preserves scrollY=${scrollY}`,
      }).toBe(scrollY);
      const readGeometry = () => page.evaluate((selector) => {
        const controls = [
          document.querySelector<HTMLElement>("[data-spotlight-launcher]")!,
          document.querySelector<HTMLElement>("[data-shortcut-trigger]")!,
        ];
        const targets = [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((target) => target.getClientRects().length > 0)
          .map((target) => target.getBoundingClientRect());
        return {
          inline: document.documentElement.hasAttribute("data-floating-controls-inline"),
          controls: controls.map((control) => ({
            rect: control.getBoundingClientRect(),
            position: getComputedStyle(control).position,
          })),
          targets,
          blockedAnatomyLinks: [...document.querySelectorAll<HTMLElement>(".primitive-card__anatomy-link")]
            .filter((target) => {
              const rect = target.getBoundingClientRect();
              return rect.bottom > 0
                && rect.top < window.innerHeight
                && rect.right > 0
                && rect.left < window.innerWidth;
            })
            .filter((target) => {
              const rect = target.getBoundingClientRect();
              const left = Math.max(0, rect.left);
              const right = Math.min(window.innerWidth, rect.right);
              const top = Math.max(0, rect.top);
              const bottom = Math.min(window.innerHeight, rect.bottom);
              const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
              return !hit || !(hit === target || target.contains(hit));
            }).length,
          headerBottom: document.querySelector<HTMLElement>(".site-header")!.getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
        };
      }, targetSelector);

      await expect.poll(async () => {
        const geometry = await readGeometry();
        return geometry.controls.flatMap(({ rect }) => geometry.targets
          .filter((target) => rectanglesOverlap(rect, target))).length;
      }, { message: `${scenario.width}x${scenario.height} at scrollY=${scrollY}` }).toBe(0);

      await expect.poll(async () => (await readGeometry()).blockedAnatomyLinks, {
        message: `${scenario.width}x${scenario.height} anatomy links remain pointer-reachable at scrollY=${scrollY}`,
      }).toBe(0);

      const geometry = await readGeometry();
      for (const control of geometry.controls) {
        if (geometry.inline) {
          expect(control.position).not.toBe("fixed");
        } else {
          expect(control.rect.top).toBeGreaterThanOrEqual(geometry.headerBottom + 4);
          expect(control.rect.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
        }
      }
    }
  }
});

test("Discover sticky controls release before refinement actions scroll underneath", async ({ page }) => {
  const scenarios = [
    { width: 1024, height: 720, exactScrollY: 2050 },
    { width: 819, height: 720, exactScrollY: 2809 },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto("/discover/");
    const maxScrollY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const positions = new Set<number>();
    for (let scrollY = 0; scrollY <= maxScrollY; scrollY += 1600) positions.add(scrollY);
    const exactPosition = Math.min(scenario.exactScrollY, maxScrollY);
    positions.add(exactPosition);
    positions.add(maxScrollY);
    const orderedPositions = [exactPosition, ...[...positions]
      .filter((scrollY) => scrollY !== exactPosition)
      .sort((left, right) => left - right)];
    const samples: Array<{ href: string; hit: string; scrollY: number }> = [];
    let blockedCount = 0;

    for (const scrollY of orderedPositions) {
      await page.evaluate((nextScrollY) => window.scrollTo(0, nextScrollY), scrollY);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const blockers = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".primitive-card__anatomy-link")]
        .flatMap((target) => {
          const rect = target.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) return [];
          const hit = document.elementFromPoint(
            Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2)),
            Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2)),
          );
          return hit?.closest(".discover-toolbar-wrap")
            ? [{
              href: target.getAttribute("href") ?? "",
              hit: hit instanceof HTMLElement ? hit.className || hit.tagName : "unknown",
              scrollY: window.scrollY,
            }]
            : [];
        }));
      blockedCount += blockers.length;
      samples.push(...blockers.slice(0, Math.max(0, 5 - samples.length)));
    }

    await expect(page.locator(".discover-controls-sticky")).toHaveCSS("position", "sticky");
    expect(blockedCount, `${scenario.width}x${scenario.height}: ${JSON.stringify(samples)}`).toBe(0);
  }
});

test("Discover sticky controls keep taxonomy quick actions reachable while releasing", async ({ page }) => {
  const scenarios = [
    { width: 1024, height: 720, scrollY: 1300 },
    { width: 819, height: 720, scrollY: 1905 },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto("/discover/");
    const stickyScrollY = await page.evaluate(() => {
      const scope = document.querySelector<HTMLElement>(".discover-controls-scope")!;
      const header = document.querySelector<HTMLElement>(".site-header")!;
      return Math.max(0, scope.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height + 10);
    });
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), stickyScrollY);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const stickyGeometry = await page.evaluate(() => ({
      groupTop: document.querySelector<HTMLElement>(".discover-controls-sticky")!.getBoundingClientRect().top,
      headerBottom: document.querySelector<HTMLElement>(".site-header")!.getBoundingClientRect().bottom,
      quickTop: document.querySelector<HTMLElement>(".taxonomy-quick")!.getBoundingClientRect().top,
      toolbarBottom: document.querySelector<HTMLElement>(".discover-toolbar-wrap")!.getBoundingClientRect().bottom,
    }));
    expect(Math.abs(stickyGeometry.groupTop - stickyGeometry.headerBottom)).toBeLessThanOrEqual(1);
    expect(stickyGeometry.quickTop).toBeGreaterThanOrEqual(stickyGeometry.toolbarBottom - 1);

    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), scenario.scrollY);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const subject = page.locator('.taxonomy-quick [data-group-filter="subject"]');
    const pointer = await subject.evaluate((target) => {
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        hitOwnsTarget: hit === target || target.contains(hit),
        x,
        y,
      };
    });
    expect(pointer.hitOwnsTarget, `${scenario.width}x${scenario.height} pointer hit`).toBe(true);
    await page.mouse.click(pointer.x, pointer.y);
    await expect(subject).toHaveAttribute("aria-pressed", "true");

    await page.goto("/discover/");
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), scenario.scrollY);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const all = page.locator('.taxonomy-quick [data-group-filter="all"]');
    await all.evaluate((target) => target.focus({ preventScroll: true }));
    await expect(all).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scenario.scrollY);
    const focusHitOwnsTarget = await all.evaluate((target) => {
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === target || target.contains(hit);
    });
    expect(focusHitOwnsTarget, `${scenario.width}x${scenario.height} focused control remains visible`).toBe(true);
  }
});

test("Discover pinned controls preserve vertical scroll during native Tab traversal", async ({ page }) => {
  const scenarios = [
    { width: 1024, height: 720 },
    { width: 819, height: 720 },
    { width: 682, height: 600 },
    { width: 621, height: 720 },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize(scenario);
    await page.goto("/discover/");
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      const scope = document.querySelector<HTMLElement>(".discover-controls-scope")!;
      const group = document.querySelector<HTMLElement>(".discover-controls-sticky")!;
      const header = document.querySelector<HTMLElement>(".site-header")!;
      const runway = scope.getBoundingClientRect().height - group.getBoundingClientRect().height;
      const stickyStart = scope.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height;
      const targetScrollY = stickyStart + Math.max(1, Math.floor(runway / 2));
      window.scrollTo(0, targetScrollY);
    });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const pinnedScrollY = await page.evaluate(() => window.scrollY);
    const pinned = await page.evaluate(() => ({
      groupTop: document.querySelector<HTMLElement>(".discover-controls-sticky")!.getBoundingClientRect().top,
      headerBottom: document.querySelector<HTMLElement>(".site-header")!.getBoundingClientRect().bottom,
    }));
    expect(Math.abs(pinned.groupTop - pinned.headerBottom), `${scenario.width}x${scenario.height} starts pinned`).toBeLessThanOrEqual(1);

    const search = page.locator("#primitive-search");
    const searchPoint = await search.evaluate((target) => {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(searchPoint.x, searchPoint.y);
    await expect(search).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pinnedScrollY);
    const focusableCount = await page.locator('.discover-controls-sticky input:not([disabled]), .discover-controls-sticky button:not([disabled]), .discover-controls-sticky a[href]')
      .evaluateAll((elements) => elements.filter((element) => (element as HTMLElement).getClientRects().length > 0).length);
    expect(focusableCount).toBeGreaterThanOrEqual(9);

    for (let index = 1; index < focusableCount; index += 1) {
      await page.keyboard.press("Tab");
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const state = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const group = document.querySelector<HTMLElement>(".discover-controls-sticky")!;
        const quick = active?.closest<HTMLElement>(".taxonomy-quick");
        const activeRect = active?.getBoundingClientRect();
        const quickRect = quick?.getBoundingClientRect();
        return {
          activeInsideGroup: Boolean(active && group.contains(active)),
          focusVisibleVertically: Boolean(activeRect && activeRect.bottom > 0 && activeRect.top < window.innerHeight),
          focusVisibleInQuick: !quickRect || Boolean(activeRect && activeRect.right > quickRect.left && activeRect.left < quickRect.right),
          scrollY: window.scrollY,
        };
      });
      expect(state.activeInsideGroup, `${scenario.width}x${scenario.height} Tab ${index}`).toBe(true);
      expect(state.focusVisibleVertically, `${scenario.width}x${scenario.height} Tab ${index}`).toBe(true);
      expect(state.focusVisibleInQuick, `${scenario.width}x${scenario.height} Tab ${index}`).toBe(true);
      expect(Math.abs(state.scrollY - pinnedScrollY), `${scenario.width}x${scenario.height} Tab ${index} scroll`).toBeLessThanOrEqual(1);
    }
  }
});

test("Discover rapid Tab exit cancels pending pinned scroll restoration", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const pressNativeTab = async (modifiers = 0) => {
    const event = {
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers,
    };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  };
  const scenarios = [
    { width: 682, height: 600 },
    { width: 621, height: 720 },
  ];

  for (const scenario of scenarios) {
    for (const direction of ["forward", "reverse"] as const) {
      await page.setViewportSize(scenario);
      await page.goto("/discover/");
      await page.evaluate(() => {
        const root = document.documentElement;
        root.style.scrollBehavior = "auto";
        const scope = document.querySelector<HTMLElement>(".discover-controls-scope")!;
        const group = document.querySelector<HTMLElement>(".discover-controls-sticky")!;
        const header = document.querySelector<HTMLElement>(".site-header")!;
        const runway = scope.getBoundingClientRect().height - group.getBoundingClientRect().height;
        const stickyStart = scope.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height;
        window.scrollTo(0, stickyStart + Math.max(1, Math.floor(runway / 2)));
        root.style.removeProperty("scroll-behavior");
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const pinnedScrollY = await page.evaluate(() => window.scrollY);

      const start = direction === "forward"
        ? page.locator('.taxonomy-quick [data-group-filter="lighting"]')
        : page.locator('.discover-search button[type="submit"]');
      await start.evaluate((target) => target.focus({ preventScroll: true }));
      await expect(start).toBeFocused();

      const modifiers = direction === "reverse" ? 8 : 0;
      await pressNativeTab(modifiers);
      await pressNativeTab(modifiers);

      await expect.poll(() => page.evaluate((originalScrollY) => ({
        activeOutsideGroup: !document.querySelector<HTMLElement>(".discover-controls-sticky")!.contains(document.activeElement),
        movedFromPinned: Math.abs(window.scrollY - originalScrollY) > 100,
      }), pinnedScrollY), { message: `${scenario.width}x${scenario.height} ${direction} native exit` })
        .toEqual({ activeOutsideGroup: true, movedFromPinned: true });
      const focus = await page.evaluate(() => {
        const rect = (document.activeElement as HTMLElement).getBoundingClientRect();
        return { centerY: rect.top + rect.height / 2, viewportHeight: window.innerHeight };
      });
      expect(focus.centerY, `${scenario.width}x${scenario.height} ${direction} focus center`).toBeGreaterThanOrEqual(0);
      expect(focus.centerY, `${scenario.width}x${scenario.height} ${direction} focus center`).toBeLessThanOrEqual(focus.viewportHeight);
    }
  }
});

test("floating controls use the inline fallback when no safe vertical lane exists", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      offsetLeft: number;
      width: number;
      pageLeft: number;
      pageTop: number;
      scale: number;
    };
    Object.assign(viewport, {
      height: 720,
      offsetTop: 0,
      offsetLeft: 65,
      width: 300,
      pageLeft: 65,
      pageTop: 0,
      scale: 1.3,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  });
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/discover/");
  await page.evaluate(() => {
    const blocker = document.createElement("div");
    blocker.dataset.floatingTarget = "";
    blocker.dataset.testFloatingBlocker = "";
    blocker.style.cssText = "position:fixed;inset:80px 0 0;pointer-events:none";
    document.body.append(blocker);
    window.dispatchEvent(new Event("scroll"));
  });

  await expect.poll(() => page.locator("html").evaluate((root) => ({
    compact: root.hasAttribute("data-compact-visual-viewport"),
    inline: root.hasAttribute("data-floating-controls-inline"),
    panned: root.hasAttribute("data-panned-visual-viewport"),
  }))).toEqual({ compact: true, inline: true, panned: true });
  const controls = await page.locator("[data-spotlight-launcher], [data-shortcut-trigger]").evaluateAll((elements) => elements.map((element) => ({
    height: element.getBoundingClientRect().height,
    left: element.getBoundingClientRect().left,
    position: getComputedStyle(element).position,
    right: element.getBoundingClientRect().right,
  })));
  for (const control of controls) {
    expect(control.position).not.toBe("fixed");
    expect(control.height).toBeLessThanOrEqual(64);
    expect(control.left).toBeGreaterThanOrEqual(65);
    expect(control.right).toBeLessThanOrEqual(365);
  }
});

test("footer content and transient notices clear the floating controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".site-footer").evaluate((footer) => footer.scrollIntoView({ block: "end" }));
  await expect.poll(() => page.evaluate(() => Math.abs(document.documentElement.scrollHeight - window.innerHeight - window.scrollY))).toBeLessThanOrEqual(1);
  const footerClearance = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>(".site-footer__bottom")!.getBoundingClientRect();
    const launcher = document.querySelector<HTMLElement>("[data-spotlight-launcher]")!.getBoundingClientRect();
    return launcher.top - footer.bottom;
  });
  expect(footerClearance).toBeGreaterThanOrEqual(4);

  await page.locator("[data-toast]").evaluate((toast) => {
    toast.removeAttribute("hidden");
    toast.textContent = "Thông báo kiểm tra";
  });
  const collision = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>("[data-toast]")!.getBoundingClientRect();
    const help = document.querySelector<HTMLElement>("[data-shortcut-trigger]")!.getBoundingClientRect();
    return toast.bottom > help.top - 4 && toast.top < help.bottom + 4;
  });
  expect(collision).toBe(false);
});

test("launcher morphs into a single-scroll Spotlight and restores focus", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Tìm trong Prompt Atlas" });
  await launcher.focus();
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-spotlight-state", "open");
  await expect(dialog.getByRole("combobox")).toBeFocused();

  const scrollOwners = await dialog.evaluate((element) => [...element.querySelectorAll<HTMLElement>("*")]
    .filter((candidate) => {
      const overflowY = getComputedStyle(candidate).overflowY;
      return overflowY === "auto" || overflowY === "scroll";
    })
    .map((candidate) => candidate.getAttribute("data-spotlight-results") !== null ? "results" : candidate.className));
  expect(scrollOwners).toEqual(["results"]);
  await expect(dialog.locator(".spotlight-shell")).toHaveCSS("overflow-y", "hidden");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("Spotlight traps forward and reverse tab navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tìm trong Prompt Atlas" }).click();
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();

  const focusableCount = await dialog.evaluate((element) => [...element.querySelectorAll<HTMLElement>('a[href]:not([tabindex="-1"]), button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((candidate) => candidate.getClientRects().length > 0).length);
  expect(focusableCount).toBeGreaterThan(1);

  for (let step = 0; step < focusableCount + 2; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement)), `forward Tab step ${step + 1}`).toBe(true);
  }

  await input.focus();
  for (let step = 0; step < focusableCount + 2; step += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement)), `reverse Tab step ${step + 1}`).toBe(true);
  }
});

test("visible help control reuses the shortcut dialog and restores focus", async ({ page }) => {
  await page.goto("/discover/");
  const help = page.getByRole("button", { name: "Xem hướng dẫn phím tắt" });
  await help.focus();
  await help.click();

  const dialog = page.getByRole("dialog", { name: "Phím tắt Prompt Atlas" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("⌘/Ctrl");
  const close = dialog.getByRole("button", { name: "Đóng hướng dẫn phím tắt" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
});

test("floating controls move above an onscreen keyboard viewport", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      offsetLeft: number;
      width: number;
      pageLeft: number;
      pageTop: number;
      scale: number;
    };
    Object.assign(viewport, {
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      width: 390,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    (window as typeof window & { __setKeyboardViewport: (height: number, offsetTop?: number) => void }).__setKeyboardViewport = (height, offsetTop = 0) => {
      viewport.height = window.innerHeight - height - offsetTop;
      viewport.offsetTop = offsetTop;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Tìm trong Prompt Atlas" });
  const before = await launcher.boundingBox();
  await page.evaluate(() => (window as typeof window & { __setKeyboardViewport: (height: number, offsetTop?: number) => void }).__setKeyboardViewport(280, 24));
  await expect.poll(async () => Number.parseFloat(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--floating-keyboard-offset")))).toBeGreaterThanOrEqual(280);
  const after = await launcher.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.y).toBeLessThanOrEqual(before!.y - 260);

  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await expect(dialog).toBeVisible();
  const viewportFit = await dialog.evaluate((element) => {
    const viewport = window.visualViewport!;
    const visibleTop = viewport.offsetTop;
    const visibleBottom = viewport.offsetTop + viewport.height;
    const dialogRect = element.getBoundingClientRect();
    const queryRect = element.querySelector<HTMLInputElement>("[data-spotlight-search]")!.getBoundingClientRect();
    const closeRect = element.querySelector<HTMLButtonElement>('button[aria-label="Đóng tìm kiếm"]')!.getBoundingClientRect();
    const resultsRect = element.querySelector<HTMLElement>("[data-spotlight-results]")!.getBoundingClientRect();
    return { visibleTop, visibleBottom, dialogRect, queryRect, closeRect, resultsRect };
  });
  expect(viewportFit.dialogRect.top).toBeGreaterThanOrEqual(viewportFit.visibleTop);
  expect(viewportFit.dialogRect.bottom).toBeLessThanOrEqual(viewportFit.visibleBottom);
  expect(viewportFit.queryRect.bottom).toBeLessThanOrEqual(viewportFit.visibleBottom);
  expect(viewportFit.closeRect.bottom).toBeLessThanOrEqual(viewportFit.visibleBottom);
  expect(viewportFit.resultsRect.bottom).toBeLessThanOrEqual(viewportFit.visibleBottom);
  expect(viewportFit.resultsRect.height).toBeGreaterThanOrEqual(72);

  await page.setViewportSize({ width: 390, height: 667 });
  await page.evaluate(() => (window as typeof window & { __setKeyboardViewport: (height: number, offsetTop?: number) => void }).__setKeyboardViewport(300));
  await expect.poll(async () => Number.parseFloat(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--visual-viewport-height")))).toBe(367);
  const compactFit = await dialog.evaluate((element) => {
    const viewport = window.visualViewport!;
    const visibleBottom = viewport.offsetTop + viewport.height;
    const dialogRect = element.getBoundingClientRect();
    const queryRect = element.querySelector<HTMLInputElement>("[data-spotlight-search]")!.getBoundingClientRect();
    const closeRect = element.querySelector<HTMLButtonElement>('button[aria-label="Đóng tìm kiếm"]')!.getBoundingClientRect();
    const resultsRect = element.querySelector<HTMLElement>("[data-spotlight-results]")!.getBoundingClientRect();
    return { visibleTop: viewport.offsetTop, visibleBottom, dialogRect, queryRect, closeRect, resultsRect };
  });
  expect(compactFit.dialogRect.top).toBeGreaterThanOrEqual(compactFit.visibleTop);
  expect(compactFit.dialogRect.bottom).toBeLessThanOrEqual(compactFit.visibleBottom);
  expect(compactFit.queryRect.bottom).toBeLessThanOrEqual(compactFit.visibleBottom);
  expect(compactFit.closeRect.bottom).toBeLessThanOrEqual(compactFit.visibleBottom);
  expect(compactFit.resultsRect.bottom).toBeLessThanOrEqual(compactFit.visibleBottom);
  expect(compactFit.resultsRect.height).toBeGreaterThanOrEqual(72);
});

test("floating controls follow a horizontally panned visual viewport", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      offsetLeft: number;
      width: number;
      pageLeft: number;
      pageTop: number;
      scale: number;
    };
    Object.assign(viewport, {
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      width: 390,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    (window as typeof window & { __setHorizontalViewport: (width: number, offsetLeft: number) => void }).__setHorizontalViewport = (width, offsetLeft) => {
      viewport.width = width;
      viewport.offsetLeft = offsetLeft;
      viewport.scale = window.innerWidth / width;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const assertInsideVisualViewport = async () => page.evaluate(() => {
    const viewport = window.visualViewport!;
    const visibleTop = viewport.offsetTop;
    const visibleBottom = viewport.offsetTop + viewport.height;
    const visibleLeft = viewport.offsetLeft;
    const visibleRight = viewport.offsetLeft + viewport.width;
    const launcher = document.querySelector<HTMLElement>("[data-spotlight-launcher]")!.getBoundingClientRect();
    const help = document.querySelector<HTMLElement>("[data-shortcut-trigger]")!.getBoundingClientRect();
    const headerBottom = document.querySelector<HTMLElement>(".site-header")!.getBoundingClientRect().bottom;
    return { visibleTop, visibleBottom, visibleLeft, visibleRight, headerBottom, launcher, help };
  });

  for (const offsetLeft of [65, 130]) {
    await page.evaluate((left) => (window as typeof window & { __setHorizontalViewport: (width: number, offsetLeft: number) => void }).__setHorizontalViewport(260, left), offsetLeft);
    const geometry = await assertInsideVisualViewport();
    expect(geometry.launcher.left).toBeGreaterThanOrEqual(geometry.visibleLeft);
    expect(geometry.launcher.right).toBeLessThanOrEqual(geometry.visibleRight);
    expect(geometry.help.left).toBeGreaterThanOrEqual(geometry.visibleLeft);
    expect(geometry.help.right).toBeLessThanOrEqual(geometry.visibleRight);
    expect(geometry.launcher.right).toBeLessThanOrEqual(geometry.help.left - 4);
    expect(geometry.launcher.height).toBeLessThanOrEqual(64);
    expect(geometry.help.height).toBeLessThanOrEqual(64);
    expect(geometry.launcher.top).toBeGreaterThanOrEqual(geometry.headerBottom + 4);
    expect(geometry.help.top).toBeGreaterThanOrEqual(geometry.headerBottom + 4);
    expect(geometry.launcher.bottom).toBeLessThanOrEqual(geometry.visibleBottom);
    expect(geometry.help.bottom).toBeLessThanOrEqual(geometry.visibleBottom);
  }

  await page.getByRole("button", { name: "Tìm trong Prompt Atlas" }).click();
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await expect(dialog).toHaveAttribute("data-spotlight-state", "open");
  const dialogFit = await dialog.evaluate((element) => {
    const viewport = window.visualViewport!;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, visibleLeft: viewport.offsetLeft, visibleRight: viewport.offsetLeft + viewport.width };
  });
  expect(dialogFit.left).toBeGreaterThanOrEqual(dialogFit.visibleLeft);
  expect(dialogFit.right).toBeLessThanOrEqual(dialogFit.visibleRight);

  await dialog.getByRole("button", { name: "Đóng tìm kiếm" }).click();
  await page.getByRole("button", { name: "Xem hướng dẫn phím tắt" }).click();
  const shortcutDialog = page.getByRole("dialog", { name: "Phím tắt Prompt Atlas" });
  await expect(shortcutDialog).toBeVisible();
  const shortcutFit = await shortcutDialog.evaluate((element) => {
    const viewport = window.visualViewport!;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, visibleLeft: viewport.offsetLeft, visibleRight: viewport.offsetLeft + viewport.width };
  });
  expect(shortcutFit.left).toBeGreaterThanOrEqual(shortcutFit.visibleLeft);
  expect(shortcutFit.right).toBeLessThanOrEqual(shortcutFit.visibleRight);
});

test("reduced motion keeps Spotlight opening immediate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Tìm trong Prompt Atlas" }).click();
  const dialog = page.getByRole("dialog", { name: "Tìm trong Prompt Atlas" });
  await expect(dialog).toHaveAttribute("data-spotlight-state", "open");
  const duration = await dialog.evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.01);
});
