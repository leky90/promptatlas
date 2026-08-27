import { expect, test } from "@playwright/test";

const supportedRoutes = ["/", "/discover/", "/anatomy/", "/composer/", "/compare/", "/methodology/"];

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

test("visible help control reuses the shortcut dialog and restores focus", async ({ page }) => {
  await page.goto("/discover/");
  const help = page.getByRole("button", { name: "Xem hướng dẫn phím tắt" });
  await help.focus();
  await help.click();

  const dialog = page.getByRole("dialog", { name: "Phím tắt Prompt Atlas" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("⌘/Ctrl");
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
    (window as typeof window & { __setKeyboardHeight: (height: number) => void }).__setKeyboardHeight = (height) => {
      viewport.height = window.innerHeight - height;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Tìm trong Prompt Atlas" });
  const before = await launcher.boundingBox();
  await page.evaluate(() => (window as typeof window & { __setKeyboardHeight: (height: number) => void }).__setKeyboardHeight(280));
  await expect.poll(async () => Number.parseFloat(await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--floating-keyboard-offset")))).toBeGreaterThanOrEqual(280);
  const after = await launcher.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.y).toBeLessThanOrEqual(before!.y - 260);
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
