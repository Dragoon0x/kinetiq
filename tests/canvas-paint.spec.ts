import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { catalogComponents } from "../content/manifest";
import { gotoHydrated } from "./helpers";

/**
 * Every 2D-canvas specimen must actually put pixels on its canvas.
 *
 * A canvas component can fail silently in a way no other test sees: it mounts,
 * sizes its backing store, runs its loop, and still draws nothing. trail-ink
 * shipped in exactly that state — its idle-stop discarded the seed point of a
 * stroke every frame, so the buffer never reached the two points a segment
 * needs and no ink ever landed.
 *
 * The roster is derived from the registry itself rather than hardcoded, so a
 * new canvas component is covered the day it lands.
 */

const uiDir = path.join(__dirname, "..", "registry", "ui");

const canvasSlugs = fs
  .readdirSync(uiDir)
  .filter((file) => file.endsWith(".tsx"))
  .filter((file) => {
    const source = fs.readFileSync(path.join(uiDir, file), "utf8");
    // The effects wing and the figures use 2D canvases offscreen — glyph
    // atlases, melt and smear maps, sprites — and are proven by the WebGL
    // and figure sweeps instead.
    if (/data-effect-canvas|data-figure-host/.test(source)) return false;
    return /getContext\(\s*["']2d["']/.test(source);
  })
  .map((file) => file.replace(/\.tsx$/, ""))
  .filter((slug) => catalogComponents.some((c) => c.name === slug));

test.describe.configure({ mode: "parallel" });

test("the canvas roster is non-empty", () => {
  expect(canvasSlugs.length).toBeGreaterThan(20);
});

for (const slug of canvasSlugs) {
  test(`paints pixels: ${slug}`, async ({ page }) => {
    await gotoHydrated(page, `/components/${slug}`);
    const stage = page.locator("[data-specimen-stage]").first();
    await expect(stage).toBeVisible();
    const box = (await stage.boundingBox())!;

    // Peak over the whole run: ambient specimens paint immediately, pointer
    // specimens paint mid-stroke, and burst specimens paint after a control
    // fires — so sample continuously and keep the maximum.
    const sample = () =>
      page.evaluate(() => {
        let max = 0;
        for (const c of Array.from(document.querySelectorAll("canvas"))) {
          const ctx = c.getContext("2d");
          if (!ctx || !c.width || !c.height) continue;
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n += 1;
          max = Math.max(max, n);
        }
        return max;
      });

    let best = await sample();

    // Sweep the pointer across the stage, drawing as it goes.
    for (let i = 0; i <= 12 && best === 0; i += 1) {
      const x = box.x + box.width * (0.15 + 0.7 * (i / 12));
      const y = box.y + box.height * (0.3 + 0.4 * Math.sin(i / 2));
      await page.mouse.move(x, y);
      if (i === 3) await page.mouse.down();
      best = Math.max(best, await sample());
      await page.waitForTimeout(40);
    }
    await page.mouse.up();

    // Some specimens puff on a click anywhere on the stage and carry no button.
    if (best === 0) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      for (let f = 0; f < 8 && best === 0; f += 1) {
        await page.waitForTimeout(60);
        best = Math.max(best, await sample());
      }
    }

    // Burst specimens (confetti, plinko) only paint once a control fires them.
    const controls = stage.locator('button, [role="button"]');
    const count = Math.min(await controls.count(), 4);
    for (let i = 0; i < count && best === 0; i += 1) {
      try {
        await controls.nth(i).click({ timeout: 2000 });
      } catch {
        continue;
      }
      for (let f = 0; f < 6 && best === 0; f += 1) {
        await page.waitForTimeout(60);
        best = Math.max(best, await sample());
      }
    }

    expect(best, `${slug} never painted a pixel`).toBeGreaterThan(0);
  });
}
