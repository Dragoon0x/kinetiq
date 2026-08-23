import { expect, test } from "@playwright/test";

import { isPage } from "../content/page-categories";
import { catalogPages } from "../content/manifest";

/**
 * Every whole-page composition must hold at the widths it will be used at,
 * with no horizontal overflow and no console, page, or hydration errors. The
 * roster derives from the manifest, so a new page is covered the day it lands.
 *
 * Pages are longer than sections, so the sweep scrolls the full height before
 * asserting — a whileInView section below the fold would otherwise never
 * resolve and its errors would never fire.
 */

const pages = catalogPages.filter(isPage).map((p) => p.name);

const WIDTHS = [360, 768, 1440] as const;

test.describe.configure({ mode: "parallel" });

test("the pages roster derives from the manifest", () => {
  // Guards the derivation itself — if isPage() breaks, the sweep silently
  // collapses to zero and tests nothing.
  expect(Array.isArray(pages)).toBe(true);
});

for (const slug of pages) {
  test(`page ${slug} holds at every width`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/preview/pages/${slug}`);
      await page.waitForSelector("body[data-hydrated]", { timeout: 20000 });

      // Walk the whole page so every in-view section resolves and any error
      // it would throw has actually had the chance to.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `${slug} overflows horizontally at ${width}px`,
      ).toBeLessThanOrEqual(0);
    }

    expect(errors, `${slug} logged errors: ${errors.join(" | ")}`).toEqual([]);
  });
}
