import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * Pins motion that a green build does not prove.
 *
 * Motion springs accept exactly two keyframes. Handing one a third is an
 * assertion that fires only in development — in a production build the spring
 * silently keeps the first and last keyframe and drops everything between, so
 * `[rest, squash, rest]` becomes `rest → rest` and the animation disappears
 * without an error anywhere. Both specimens below shipped in that state.
 */

test("breaker-switch squashes its thumb on arrival", async ({ page }) => {
  await gotoHydrated(page, "/components/breaker-switch");
  const stage = page.locator("[data-specimen-stage]").first();
  const thumb = stage.locator('[role="switch"] .bg-background').first();
  await expect(thumb).toBeVisible();

  await stage.locator('[role="switch"]').first().click();

  // The squash is delayed ~120ms behind the throw, so watch across the travel.
  let minScaleX = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 40; i += 1) {
    const scaleX = await thumb.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === "none") return 1;
      const m = t.match(/matrix\(([^)]+)\)/);
      return m ? parseFloat(m[1]!.split(",")[0]!) : 1;
    });
    minScaleX = Math.min(minScaleX, scaleX);
    await page.waitForTimeout(16);
  }

  expect(
    minScaleX,
    `thumb never compressed (min scaleX ${minScaleX}) — the arrival squash is not running`,
  ).toBeLessThan(0.95);
});

test("pull-to-refresh arms at the detent and refreshes on release", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });

  await gotoHydrated(page, "/components/pull-to-refresh");
  const stage = page.locator("[data-specimen-stage]").first();
  // Grab the scroller itself — starting in the plate's padding would put the
  // pointerdown outside the component and never begin a pull.
  const scroller = stage.locator('[role="region"] .overflow-y-auto').first();
  await expect(scroller).toBeVisible();
  const box = (await scroller.boundingBox())!;

  const x = box.x + box.width / 2;
  const top = box.y + 12;

  await page.mouse.move(x, top);
  await page.mouse.down();
  // Pull well past the detent, crossing it mid-drag so the tick fires.
  for (let i = 1; i <= 16; i += 1) {
    await page.mouse.move(x, top + i * 14);
    await page.waitForTimeout(20);
  }

  const region = stage.locator('[role="region"]');
  await expect(region).toContainText("RELEASE");
  await page.mouse.up();
  await expect(region).toContainText("REFRESHING");
  // And the refresh completes, prepending a fresh row.
  await expect(region).toContainText("Vibration node retuned");

  expect(problems, problems.join("\n")).toEqual([]);
});
