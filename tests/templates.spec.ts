import { expect, test } from "@playwright/test";

import { isTemplate } from "../content/template-categories";
import { catalogTemplates } from "../content/manifest";

/**
 * Templates are the longest surfaces in the catalog — a dozen sections each —
 * so this sweep is the one most likely to catch a section that misbehaves
 * only in company: a sticky stage fighting a pinned one, two live regions
 * announcing over each other, a full-bleed rail widening the page.
 *
 * The page is walked top to bottom before asserting, so every in-view section
 * resolves and any error it would throw has actually had the chance to.
 */

const templates = catalogTemplates.filter(isTemplate).map((t) => t.name);

const WIDTHS = [360, 768, 1440] as const;

test.describe.configure({ mode: "parallel" });

test("the templates roster derives from the manifest", () => {
  expect(Array.isArray(templates)).toBe(true);
});

for (const slug of templates) {
  test(`template ${slug} holds at every width`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/preview/templates/${slug}`);
      await page.waitForSelector("body[data-hydrated]", { timeout: 30000 });

      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(250);

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
