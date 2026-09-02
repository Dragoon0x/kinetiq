import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The painter is a contract, and this proves the part of it that matters
 * most: that what it paints lands where the browser laid it out. The
 * surface-paint demo pins a contact print of the texture to its corner at
 * a known scale; sampling that print at the positions of a known swatch
 * and a known heading proves colour and glyph placement, not just that
 * something was drawn.
 */

type Sample = { r: number; g: number; b: number; a: number };

async function samplePrint(
  page: import("@playwright/test").Page,
  selector: string,
  where: "center" | "text",
): Promise<{ sample: Sample; dark: number; total: number }> {
  return page.evaluate(
    ({ selector, where }) => {
      const root = document.querySelector<HTMLElement>("[data-surface-root]");
      const print =
        document.querySelector<HTMLCanvasElement>("[data-paint-print]");
      const el = document.querySelector<HTMLElement>(selector);
      if (!root || !print || !el) throw new Error("fixture missing");
      const rootRect = root.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const sx = print.width / rootRect.width;
      const sy = print.height / rootRect.height;
      const ctx = print.getContext("2d");
      if (!ctx) throw new Error("no print context");
      const x0 = Math.round((rect.left - rootRect.left) * sx);
      const y0 = Math.round((rect.top - rootRect.top) * sy);
      const w = Math.max(1, Math.round(rect.width * sx));
      const h = Math.max(1, Math.round(rect.height * sy));
      if (where === "center") {
        const d = ctx.getImageData(
          x0 + Math.floor(w / 2),
          y0 + Math.floor(h / 2),
          1,
          1,
        ).data;
        return {
          sample: { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: d[3] ?? 0 },
          dark: 0,
          total: 1,
        };
      }
      const data = ctx.getImageData(x0, y0, w, h).data;
      let dark = 0;
      const total = w * h;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] ?? 0;
        const lum =
          ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
        if (a > 40 && lum < 110) dark += 1;
      }
      return { sample: { r: 0, g: 0, b: 0, a: 0 }, dark, total };
    },
    { selector, where },
  );
}

test("the painter puts colour and type where the browser laid them out", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/surface-paint");
  const host = page.locator("[data-surface-mode]").first();
  await expect(host).toHaveAttribute("data-surface-active", "true", {
    timeout: 10_000,
  });
  // Let any async sub-resource pass (inline SVG, fonts) land.
  await page.waitForTimeout(600);

  // The swatch is the primary colour: its centre in the print must be a
  // saturated blue, not the card background.
  const swatch = await samplePrint(page, "[data-paint-swatch]", "center");
  expect(swatch.sample.a).toBeGreaterThan(200);
  expect(swatch.sample.b).toBeGreaterThan(swatch.sample.r + 40);

  // The heading is dark type on a light card: a meaningful share of its
  // box must be dark pixels — glyphs painted, at that position.
  const heading = await samplePrint(page, "[data-paint-heading]", "text");
  const share = heading.dark / heading.total;
  expect(share, `heading dark share ${share.toFixed(3)}`).toBeGreaterThan(0.06);
  expect(share).toBeLessThan(0.6);

  // Typing repaints: the version climbs and the print follows.
  const before = Number(await host.getAttribute("data-surface-version"));
  await page.getByRole("textbox").first().fill("north face doubled");
  await expect
    .poll(async () => Number(await host.getAttribute("data-surface-version")), {
      timeout: 5000,
    })
    .toBeGreaterThan(before);
});

test("reduced motion keeps the real DOM visible in replace mode", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoHydrated(page, "/components/crystal-lens");
  const root = page.locator("[data-surface-root]").first();
  await expect(root).toBeVisible();
  const opacity = await root.evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
});
