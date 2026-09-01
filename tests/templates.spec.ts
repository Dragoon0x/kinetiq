import { expect, test } from "@playwright/test";

import { isTemplate, templateKindOf } from "../content/template-categories";
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

/**
 * The floor that separates a real page from an empty stage, per kind.
 *
 * A dozen-section marketing site is several thousand pixels tall, so 1200 is
 * a generous floor there. A personal site is a different archetype on
 * purpose — one column, over in two scrolls — and lands near 1100 with every
 * row present. Holding it to the marketing floor would not be strictness, it
 * would be measuring the wrong thing, so the floor is stated per kind rather
 * than lowered for everyone.
 */
const MIN_HEIGHT: Record<string, number> = { personal: 900 };
const DEFAULT_MIN_HEIGHT = 1200;

const minHeightFor = (slug: string): number => {
  const item = catalogTemplates.find((t) => t.name === slug);
  const kind = item ? templateKindOf(item)?.slug : undefined;
  return (kind ? MIN_HEIGHT[kind] : undefined) ?? DEFAULT_MIN_HEIGHT;
};

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

      // Substance, not just silence: a template that renders blank passes an
      // error-and-overflow check perfectly, which is how an empty stage
      // shipped once before.
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      expect(
        height,
        `${slug} rendered little or nothing at ${width}px`,
      ).toBeGreaterThan(minHeightFor(slug));
    }

    expect(errors, `${slug} logged errors: ${errors.join(" | ")}`).toEqual([]);
  });
}
