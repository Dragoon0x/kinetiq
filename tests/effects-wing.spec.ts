import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The effects wing, end to end. Every effect composes the same primitive
 * and promises the same three things, so the roster comes from the
 * manifest and each promise is one test:
 *
 * 1. Reduced motion shows the real thing — in replace mode the DOM at
 *    full opacity, in overlay mode a still frame — and a pointer sweep
 *    over it throws nothing.
 * 2. The interface under the effect stays real: Tab reaches a control
 *    inside the painted root, and the accessibility tree still names it.
 * 3. The loop has an off switch: effects that react to the pointer go
 *    quiet once it leaves; the few that live (rain, cipher, dust) keep
 *    ticking while on screen.
 */

const manifest = readFileSync(
  join(process.cwd(), "content", "manifest", "components.ts"),
  "utf8",
);
const roster = manifest
  .split(/\n  \{\n    name: "/)
  .slice(1)
  .filter((entry) => /categories: \[[^\]]*"effects"/.test(entry))
  .map((entry) => entry.slice(0, entry.indexOf('"')))
  // The primitive itself is exercised by the fidelity spec; the figures
  // are 3D scenes without a painted surface and have their own spec.
  .filter((slug) => slug !== "surface-paint" && !slug.endsWith("-figure"));

/** Effects whose loop runs on its own while visible, by contract. */
const CONTINUOUS = new Set([
  "cipher-surface",
  "dust-reveal",
  "rain-glass",
  "type-rain",
  "bonfire-edge",
  "flame-border",
  "tape-wear",
  "signal-glitch",
  // Animate while the line is inside the surface, which at rest it is.
  "laser-print",
  "sand-scroll",
  // Wind and a breathing floor never rest.
  "cloth-drape",
  "hex-floor",
  // <wing2-continuous>
  "soap-film",
  // </wing2-continuous>
]);

/** How long an effect may keep settling after the pointer leaves. */
const SETTLE_MS: Record<string, number> = {
  "ice-pane": 5000,
  "shield-field": 4000,
  "fluid-wash": 7000,
  "pond-glass": 7500,
  "wet-canvas": 11000,
  "scanner-lens": 4000,
  // <wing2-settle>
  // </wing2-settle>
};

test.describe.configure({ mode: "parallel" });
// Software WebGL under parallel workers is slow; give each effect room.
test.setTimeout(60_000);

test("the effects roster derives from the manifest", () => {
  expect(roster.length).toBeGreaterThan(0);
});

for (const slug of roster) {
  test(`${slug} · reduced motion shows the real thing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-surface-mode]").first();
    await expect(host).toBeVisible();
    const mode = await host.getAttribute("data-surface-mode");
    const root = host.locator("[data-surface-root]").first();
    await expect(root).toBeVisible();
    if (mode === "replace") {
      // Replace mode under reduced motion: the DOM is the page again.
      await expect
        .poll(() => root.evaluate((el) => getComputedStyle(el).opacity))
        .toBe("1");
      await expect(host).toHaveAttribute("data-surface-active", "false");
    } else {
      await expect(host).toHaveAttribute("data-surface-active", "true", {
        timeout: 10_000,
      });
    }
    const box = await host.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
        steps: 8,
      });
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test(`${slug} · the interface underneath stays real`, async ({ page }) => {
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-surface-mode]").first();
    await expect(host).toHaveAttribute("data-surface-active", "true", {
      timeout: 10_000,
    });
    const root = host.locator("[data-surface-root]").first();
    const button = root.getByRole("button").first();
    await expect(button).toBeAttached();
    // The accessibility tree still names the control, whatever the DOM's
    // opacity — replace mode hides it visually, never from AT.
    const name = await button.evaluate(
      (el) => (el as HTMLElement).innerText || el.getAttribute("aria-label"),
    );
    expect((name ?? "").trim().length).toBeGreaterThan(0);
    // Tab reaches it. A click on the root's padding sets the sequential
    // focus starting point there, so the next Tab lands inside — through
    // the effect canvas, which has pointer events off.
    await root.scrollIntoViewIfNeeded();
    const rootBox = await root.boundingBox();
    expect(rootBox).not.toBeNull();
    if (!rootBox) return;
    await page.mouse.click(rootBox.x + 6, rootBox.y + 6);
    let reached = false;
    for (let i = 0; i < 12 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await root.evaluate((el) =>
        el.contains(document.activeElement),
      );
    }
    expect(reached, `Tab never reached a control inside ${slug}`).toBe(true);
    // A click lands on the real button, through the effect.
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const clicked = await page.evaluate(() => {
      const w = window as Window & { __kxClicks?: number };
      w.__kxClicks = 0;
      document.addEventListener(
        "click",
        (e) => {
          if ((e.target as HTMLElement).closest("button")) w.__kxClicks! += 1;
        },
        { capture: true },
      );
      return true;
    });
    expect(clicked).toBe(true);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const count = await page.evaluate(
      () => (window as Window & { __kxClicks?: number }).__kxClicks ?? 0,
    );
    expect(count, `${slug} swallowed the click`).toBeGreaterThan(0);
  });

  test(`${slug} · replace mode paints the page into the canvas`, async ({
    page,
  }) => {
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-surface-mode]").first();
    await expect(host).toHaveAttribute("data-surface-active", "true", {
      timeout: 10_000,
    });
    if ((await host.getAttribute("data-surface-mode")) !== "replace") return;
    await page.waitForTimeout(600);
    // The drawing buffer is cleared after each composite, so it cannot be
    // read back from outside the frame loop; the compositor's screenshot
    // is the truth the reader sees. Decode it in the page and count the
    // dark samples a painted page must have.
    const png = (await host.screenshot()).toString("base64");
    const dark = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d");
      if (!ctx) return -1;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      let total = 0;
      for (let y = 0; y < c.height; y += 3) {
        for (let x = 0; x < c.width; x += 3) {
          const i = (y * c.width + x) * 4;
          const lum = ((px[i] ?? 0) + (px[i + 1] ?? 0) + (px[i + 2] ?? 0)) / 3;
          if (lum < 190) count += 1;
          total += 1;
        }
      }
      return count / total;
    }, png);
    expect(
      dark,
      `${slug} drew a blank page (${(dark * 100).toFixed(1)}% dark samples)`,
    ).toBeGreaterThan(0.01);
  });

  test(`${slug} · the loop has an off switch`, async ({ page }) => {
    await gotoHydrated(page, `/components/${slug}`);
    const host = page.locator("[data-surface-mode]").first();
    await expect(host).toHaveAttribute("data-surface-active", "true", {
      timeout: 10_000,
    });
    await host.scrollIntoViewIfNeeded();
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
      steps: 10,
    });
    await page.mouse.down();
    await page.mouse.up();
    // Leave, then let it settle.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(SETTLE_MS[slug] ?? 3000);
    // Count frames requested over a second of quiet. Headless WebGL is
    // software-rendered and the workers share a machine, so a spring that
    // settles in a second at 60fps may take several here: a pointer-driven
    // loop must go quiet within a few windows, and a live loop must show a
    // heartbeat in at least one.
    const countFrames = () =>
      page.evaluate(
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
    const windows: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const frames = await countFrames();
      windows.push(frames);
      if (CONTINUOUS.has(slug) ? frames >= 2 : frames <= 3) break;
    }
    const last = windows[windows.length - 1] ?? 0;
    if (CONTINUOUS.has(slug)) {
      expect(
        last,
        `${slug} should keep ticking while visible (frames per window: ${windows.join(", ")})`,
      ).toBeGreaterThanOrEqual(2);
    } else {
      expect(
        last,
        `${slug} kept requesting frames after the pointer left (frames per window: ${windows.join(", ")})`,
      ).toBeLessThanOrEqual(3);
    }
  });
}
