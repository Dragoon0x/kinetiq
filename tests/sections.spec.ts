import { expect, test } from "@playwright/test";

import { isSection } from "../content/block-categories";
import { catalogBlocks } from "../content/manifest";

/**
 * Every full-width section must hold at the three widths it will actually be
 * used at. The roster is derived from the manifest, so a new section is
 * covered the day it lands.
 *
 * The bare preview route is the surface under test — it is what the iframe
 * frames, and it renders the section with no docs chrome to mask overflow.
 */

const sections = catalogBlocks.filter(isSection).map((b) => b.name);

const WIDTHS = [360, 768, 1440] as const;

test.describe.configure({ mode: "parallel" });

test("the sections roster exists once the wing has sections", () => {
  // Guards the roster derivation itself — if isSection() breaks, this
  // collapses to zero and the sweep silently tests nothing.
  expect(Array.isArray(sections)).toBe(true);
});

for (const slug of sections) {
  test(`section ${slug} holds at every width`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
      if (m.type() === "warning" && /hydrat/i.test(m.text()))
        problems.push(`hydration: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/preview/blocks/${slug}`);
      await page.waitForSelector("body[data-hydrated]", { timeout: 15_000 });
      await page.waitForTimeout(400);

      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        overflow,
        `${slug} overflows horizontally by ${overflow}px at ${width}px`,
      ).toBeLessThanOrEqual(0);

      // The section must actually put content on the page at every width.
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      expect(height, `${slug} rendered empty at ${width}px`).toBeGreaterThan(160);
    }

    expect(problems, `${slug}\n${problems.join("\n")}`).toEqual([]);
  });
}
