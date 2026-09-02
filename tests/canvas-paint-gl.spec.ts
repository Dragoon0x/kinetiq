import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The 2D canvas sweep derives its roster from `getContext("2d")` and so
 * cannot see a WebGL effect at all. This is its WebGL sibling: every
 * component that opens a webgl2 context is driven with the same pointer
 * choreography and must visibly change what the compositor shows.
 *
 * Why screenshots and not readPixels: a WebGL drawing buffer is cleared
 * after each composite unless `preserveDrawingBuffer` is on, which the
 * effects deliberately leave off for performance — so reading pixels from
 * outside the frame loop returns blanks even when the effect painted. A
 * screenshot captures what the compositor holds, which is the truth the
 * reader sees. Headless Chromium renders WebGL through SwiftShader
 * (software): slow but deterministic; an effect that needs an extension
 * SwiftShader lacks (half-float colour buffers) must still paint through
 * its byte fallback.
 */

const UI_DIR = join(process.cwd(), "registry", "ui");
const roster = readdirSync(UI_DIR)
  .filter((file) => file.endsWith(".tsx"))
  .filter((file) =>
    /getContext\(\s*["']webgl2?["']|createGL\(/.test(
      readFileSync(join(UI_DIR, file), "utf8"),
    ),
  )
  .map((file) => file.replace(/\.tsx$/, ""))
  // flux-canvas predates the effects wing and keeps its own draft contract.
  .filter((slug) => slug !== "flux-canvas");

test.describe.configure({ mode: "parallel" });

test("the WebGL roster derives from the registry", () => {
  expect(roster.length).toBeGreaterThan(0);
});

for (const slug of roster) {
  test(`webgl ${slug} changes what the compositor shows`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await gotoHydrated(page, `/components/${slug}`);
    const host = page
      .locator("[data-surface-mode], [data-effect-host]")
      .first();
    await expect(host).toBeVisible();
    await expect(host).toHaveAttribute("data-surface-active", "true", {
      timeout: 10_000,
    });
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Baseline with the pointer well away from the host.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(400);
    const before = await host.screenshot();

    // Enter and sweep — no click yet. A hover alone must show the effect;
    // a click can change the DOM (focus, active states) and would let a
    // dead effect pass on the strength of the page underneath it.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, {
      steps: 12,
    });
    await page.waitForTimeout(700);
    const hovered = await host.screenshot();
    expect(
      before.equals(hovered),
      `${slug} painted nothing the compositor could show on hover`,
    ).toBe(false);

    // The effect canvas must have been sized by its frame loop: a canvas
    // still at the 300×150 default has never drawn a frame.
    const canvas = host.locator("[data-effect-canvas]").first();
    await expect(canvas).toBeAttached();
    const sized = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return {
        width: c.width,
        height: c.height,
        clientWidth: c.clientWidth,
        clientHeight: c.clientHeight,
      };
    });
    expect(
      sized.width,
      `${slug} canvas backing store ${sized.width}×${sized.height} for a ${sized.clientWidth}×${sized.clientHeight} box`,
    ).toBeGreaterThanOrEqual(Math.floor(sized.clientWidth * 0.5));
    expect(sized.height).toBeGreaterThanOrEqual(
      Math.floor(sized.clientHeight * 0.5),
    );

    // Then click and dwell: the effect must survive a real interaction.
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, {
      steps: 8,
    });
    await page.waitForTimeout(500);
    expect(errors, `${slug} logged errors: ${errors.join(" | ")}`).toEqual([]);
  });
}
