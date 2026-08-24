import { test, expect } from "@playwright/test";

test("no width clips the nav", async ({ page }) => {
  for (const w of [1440, 1280, 1152, 1024, 900, 768, 640, 375, 360, 320]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/");
    await page.waitForSelector("body[data-hydrated]", { timeout: 20000 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const navs = [
        ...document.querySelectorAll('nav[aria-label="Primary"]'),
      ].filter(
        (n) =>
          !!((n as HTMLElement).offsetWidth || (n as HTMLElement).offsetHeight),
      );
      const menuBtn = document.querySelector("header button[aria-controls]");
      return {
        visibleNavs: navs.length,
        clipped: navs.some((n) => n.scrollWidth > n.clientWidth + 1),
        menuVisible: menuBtn ? !!(menuBtn as HTMLElement).offsetWidth : false,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    const reachable = r.visibleNavs > 0 || r.menuVisible;
    expect(r.clipped, `nav clipped at ${w}`).toBe(false);
    expect(reachable, `no way to navigate at ${w}`).toBe(true);
    if (w >= 360) {
      expect(r.overflow, `page overflows at ${w}`).toBeLessThanOrEqual(0);
    }
  }
});

test("mobile menu opens, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.waitForSelector("body[data-hydrated]", { timeout: 20000 });
  const btn = page.getByRole("button", { name: "Open menu" });
  await expect(btn).toBeVisible();

  await btn.click();
  await page.waitForTimeout(400);
  const count = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll('header nav[aria-label="Primary"] a'),
      ].filter(
        (a) =>
          !!((a as HTMLElement).offsetWidth || (a as HTMLElement).offsetHeight),
      ).length,
  );
  expect(count).toBe(8);

  // Every destination reachable.
  for (const label of [
    "Components",
    "Explore",
    "Spatial",
    "Blocks",
    "Pages",
    "Templates",
    "Playground",
    "Guides",
  ]) {
    expect(
      await page
        .getByRole("banner")
        .getByRole("link", { name: label, exact: true })
        .isVisible(),
    ).toBe(true);
  }

  await page
    .getByRole("banner")
    .getByRole("link", { name: "Templates", exact: true })
    .click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(900);
  expect(new URL(page.url()).pathname).toBe("/templates");
  // And the panel is not still hanging over the new page.
  expect(
    await page.getByRole("button", { name: "Open menu" }).isVisible(),
  ).toBe(true);
});

test("escape closes and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.waitForSelector("body[data-hydrated]", { timeout: 20000 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const closed = await page
    .getByRole("button", { name: "Open menu" })
    .isVisible();
  const focused = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label"),
  );
  expect(closed).toBe(true);
  expect(focused).toBe("Open menu");
});
