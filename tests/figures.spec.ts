import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The figures: 3D scenes on a runtime that loads after mount. Each one
 * must come up (the runtime chunk arrives and the first frame lands),
 * draw something the compositor can show, answer a drag, and under
 * reduced motion draw once and stop. Headless Chromium renders through
 * SwiftShader, so the budget for the first frame is generous.
 */

const manifest = readFileSync(
  join(process.cwd(), "content", "manifest", "components.ts"),
  "utf8",
);
const roster = manifest
  .split(/\n  \{\n    name: "/)
  .slice(1)
  .map((entry) => entry.slice(0, entry.indexOf('"')))
  .filter((slug) => slug.endsWith("-figure"));

test.describe.configure({ mode: "parallel" });
test.setTimeout(90_000);

test("the figures roster derives from the manifest", () => {
  expect(roster.length).toBeGreaterThan(0);
});

/**
 * The share of sampled pixels that differ from the ground. The ground is
 * the most common colour in the shot, so a white glass figure on a pale
 * backdrop counts as drawn just as a black ASCII figure does.
 */
async function drawnShare(
  page: import("@playwright/test").Page,
  png: Buffer,
): Promise<number> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d");
    if (!ctx) return -1;
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const samples: number[] = [];
    const tally = new Map<number, number>();
    for (let y = 0; y < c.height; y += 3) {
      for (let x = 0; x < c.width; x += 3) {
        const i = (y * c.width + x) * 4;
        const r = px[i] ?? 0;
        const g = px[i + 1] ?? 0;
        const b = px[i + 2] ?? 0;
        samples.push(r, g, b);
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    let ground = 0;
    let best = -1;
    for (const [key, n] of tally) {
      if (n > best) {
        best = n;
        ground = key;
      }
    }
    const gr = ((ground >> 8) & 15) * 16 + 8;
    const gg = ((ground >> 4) & 15) * 16 + 8;
    const gb = (ground & 15) * 16 + 8;
    let count = 0;
    const total = samples.length / 3;
    for (let i = 0; i < samples.length; i += 3) {
      const d = Math.max(
        Math.abs((samples[i] ?? 0) - gr),
        Math.abs((samples[i + 1] ?? 0) - gg),
        Math.abs((samples[i + 2] ?? 0) - gb),
      );
      if (d > 28) count += 1;
    }
    return count / total;
  }, png.toString("base64"));
}

for (const slug of roster) {
  test(`${slug} · comes up, draws, and answers a drag`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-figure-host]").first();
    await expect(host).toBeVisible();
    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-figure-ready", "true", {
      timeout: 45_000,
    });
    await page.waitForTimeout(600);
    const before = await host.screenshot();
    expect(
      await drawnShare(page, before),
      `${slug} drew nothing the ground does not already show`,
    ).toBeGreaterThan(0.01);

    // Drag to orbit: the figure must turn.
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 80, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 20, { steps: 10 });
    await page.mouse.up();
    let changed = false;
    const deadline = Date.now() + 8000;
    while (!changed && Date.now() < deadline) {
      await page.waitForTimeout(200);
      changed = !before.equals(await host.screenshot());
    }
    expect(changed, `${slug} did not answer the drag`).toBe(true);
    expect(errors, `${slug} logged errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test(`${slug} · reduced motion draws once and stops`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-figure-host]").first();
    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-figure-ready", "true", {
      timeout: 45_000,
    });
    await page.waitForTimeout(800);
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let n = 0;
          const raf = window.requestAnimationFrame.bind(window);
          const original = window.requestAnimationFrame;
          window.requestAnimationFrame = (cb) => {
            n += 1;
            return raf(cb);
          };
          setTimeout(() => {
            window.requestAnimationFrame = original;
            resolve(n);
          }, 1000);
        }),
    );
    expect(
      frames,
      `${slug} kept animating under reduced motion`,
    ).toBeLessThanOrEqual(3);
    const shot = await host.screenshot();
    expect(await drawnShare(page, shot)).toBeGreaterThan(0.01);
  });
}
