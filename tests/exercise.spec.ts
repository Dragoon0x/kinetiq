import { expect, test } from "@playwright/test";

import { catalogBlocks, catalogComponents } from "../content/manifest";
import { gotoHydrated } from "./helpers";

/**
 * Drives every specimen the way a person would — hover, drag, click, keyboard —
 * and fails on any console error, page error, or hydration warning.
 *
 * smoke.spec.ts proves each page *renders* clean; this proves each component
 * survives being *used*. That gap is not theoretical: it is where a spring fed
 * three keyframes throws, and where an effect that misfires on first input
 * goes unnoticed.
 *
 * RM=1 re-runs the whole sweep through every reduced-motion branch.
 */

const reduced = Boolean(process.env.RM);

const targets = [
  ...catalogComponents.map((c) => ({ kind: "components", name: c.name })),
  ...catalogBlocks.map((b) => ({ kind: "blocks", name: b.name })),
];

test.describe.configure({ mode: "parallel" });

for (const { kind, name } of targets) {
  test(`exercise ${kind}/${name}`, async ({ page }) => {
    // gotoHydrated allows 15s, and the click loop below can spend its full
    // budget per control when a specimen animates layout on a soft spring —
    // Playwright holds a click until the box is stable across two frames. On
    // the 30s default those two alone add up to the whole budget and the
    // context is torn down mid-wait, which reports as "Target closed" and
    // reads exactly like a renderer crash.
    test.setTimeout(60_000);

    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
      if (m.type() === "warning" && /hydrat/i.test(m.text()))
        problems.push(`hydration-warning: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoHydrated(page, `/${kind}/${name}`);

    const stage = page.locator("[data-specimen-stage]").first();
    await expect(stage).toBeVisible();

    const box = await stage.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      // Hover — wakes pointer-driven specimens and flips the plate LIVE.
      await page.mouse.move(cx, cy, { steps: 6 });
      await page.waitForTimeout(120);

      // Drag through the stage — exercises pull/slide/swipe/tilt gestures.
      const from = cx - Math.min(60, box.width / 4);
      await page.mouse.move(from, cy);
      await page.mouse.down();
      for (let i = 1; i <= 6; i += 1) {
        await page.mouse.move(from + i * 18, cy + i * 9);
        await page.waitForTimeout(24);
      }
      await page.mouse.up();
      await page.waitForTimeout(160);
    }

    // Click the first handful of controls inside the specimen.
    const controls = stage.locator(
      'button, [role="button"], [role="tab"], [role="switch"], [role="radio"], [role="option"], input, [tabindex="0"]',
    );
    const count = Math.min(await controls.count(), 6);
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      try {
        if (!(await control.isVisible())) continue;
        if (await control.isDisabled().catch(() => false)) continue;
        await control.click({ timeout: 1200 });
        await page.waitForTimeout(140);
      } catch {
        // A control that moved or got covered mid-animation is not a defect on
        // its own — the console listeners above are what this test asserts on.
      }
    }

    // Keyboard drive — arrows/enter/space cover sliders, tabs, steppers.
    try {
      if ((await controls.count()) > 0) {
        const first = controls.first();
        if (await first.isVisible()) {
          await first.focus({ timeout: 1500 });
          for (const key of [
            "ArrowRight",
            "ArrowRight",
            "ArrowLeft",
            "ArrowDown",
            "ArrowUp",
            "Enter",
            " ",
          ]) {
            await page.keyboard.press(key);
            await page.waitForTimeout(70);
          }
        }
      }
    } catch {
      // Nothing focusable in this specimen.
    }

    await page.waitForTimeout(400);

    // A canvas with no backing store can never paint. Transparency is NOT
    // checked here — pointer-trail specimens correctly fade to nothing once the
    // pointer stops. Painting is proven in canvas-paint.spec.ts.
    problems.push(
      ...(await page.evaluate(() =>
        Array.from(document.querySelectorAll("canvas"))
          .filter((c) => !c.width || !c.height)
          .map((c) => `canvas has zero backing size (${c.width}x${c.height})`),
      )),
    );

    expect(problems, `${kind}/${name}\n${problems.join("\n")}`).toEqual([]);
  });
}
