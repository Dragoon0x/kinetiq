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

/**
 * Motion rebuilds `transform-origin` for SVG children out of its own animated
 * values and replaces whatever the style prop asked for with "50% 50%" — only
 * keys beginning "origin" survive that pass. Three components pivoted about the
 * middle of their drawing because of it. These assert the rendered geometry,
 * so they fail if anyone reverts to `transformOrigin`.
 *
 * `getScreenCTM()` accounts for every transform in force, so mapping a local
 * point through the element and the same point through the root <svg> compares
 * where a thing actually IS against where it belongs.
 */

test("gauge-cluster needle pivots on its hub", async ({ page }) => {
  await gotoHydrated(page, "/components/gauge-cluster");
  const stage = page.locator("[data-specimen-stage]").first();
  await expect(stage.locator("svg").first()).toBeVisible();

  const drift = await page.evaluate(() => {
    const svg = document.querySelector(
      "[data-specimen-stage] svg",
    ) as SVGSVGElement;
    const needle = Array.from(svg.querySelectorAll("line")).find(
      (l) => getComputedStyle(l).transform !== "none",
    ) as SVGLineElement | undefined;
    if (!needle) return null;

    const toScreen = (m: DOMMatrix, x: number, y: number) => ({
      x: m.a * x + m.c * y + m.e,
      y: m.b * x + m.d * y + m.f,
    });
    const root = svg.getScreenCTM()!;
    // The needle's tail is its own rotation centre; it must land on the hub.
    const tail = toScreen(
      needle.getScreenCTM()!,
      Number(needle.getAttribute("x1")),
      Number(needle.getAttribute("y1")),
    );
    const hub = toScreen(root, 50, 50);
    // Report in viewBox units so the tolerance is resolution-independent.
    return Math.hypot(tail.x - hub.x, tail.y - hub.y) / root.a;
  });

  expect(drift, "needle not found").not.toBeNull();
  expect(drift!, "needle tail has left its hub").toBeLessThan(0.5);
});

test("rating-arc thumb rides the true arc", async ({ page }) => {
  const R = 88;
  await gotoHydrated(page, "/components/rating-arc");
  const stage = page.locator("[data-specimen-stage]").first();
  await expect(stage.locator("svg").first()).toBeVisible();

  const radius = await page.evaluate(() => {
    const svg = document.querySelector(
      "[data-specimen-stage] svg",
    ) as SVGSVGElement;
    const spun = Array.from(svg.querySelectorAll("g")).find(
      (g) => getComputedStyle(g).transform !== "none" && g.querySelector("circle"),
    );
    const thumb = spun?.querySelector("circle") as SVGCircleElement | undefined;
    if (!thumb) return null;

    const toScreen = (m: DOMMatrix, x: number, y: number) => ({
      x: m.a * x + m.c * y + m.e,
      y: m.b * x + m.d * y + m.f,
    });
    const root = svg.getScreenCTM()!;
    const at = toScreen(
      thumb.getScreenCTM()!,
      Number(thumb.getAttribute("cx")),
      Number(thumb.getAttribute("cy")),
    );
    const centre = toScreen(root, 110, 100);
    return Math.hypot(at.x - centre.x, at.y - centre.y) / root.a;
  });

  expect(radius, "thumb not found").not.toBeNull();
  // Pivoting on the viewBox centre collapsed this to 60.5.
  expect(
    Math.abs(radius! - R),
    `thumb sits ${radius!.toFixed(1)} from the dial centre, not ${R}`,
  ).toBeLessThan(0.5);
});

test("retry-pulse spinner turns about its ring centre", async ({ page }) => {
  await gotoHydrated(page, "/components/retry-pulse");
  const stage = page.locator("[data-specimen-stage]").first();

  // The spinner only exists while a run is in flight.
  await stage.getByRole("button").first().click();
  const spinner = stage.locator("svg path").first();
  await expect(spinner).toBeVisible();

  const origin = await spinner.evaluate((el) => {
    const cs = getComputedStyle(el);
    return `${cs.transformBox} ${cs.transformOrigin}`;
  });

  // fill-box would resolve to the arc's own bbox centre (11, 5).
  expect(origin, "spinner is not turning about (8, 8)").toBe(
    "view-box 8px 8px",
  );
});

test("newton-cradle swings from its pivots and stays in frame", async ({
  page,
}) => {
  // motion owns transform-origin on SVG elements and replaces whatever the
  // style prop asks for with "50% 50%", so a rotate-based swing pivots every
  // ball around the middle of the drawing. The cradle shipped that way: the
  // strings tore off the bar and a ball fell out of the frame. The swing is
  // derived from the angle now, so these hold for every frame of the cycle.
  const R = 14;
  const STRING = 92;

  await gotoHydrated(page, "/components/newton-cradle");
  const stage = page.locator("[data-specimen-stage]").first();
  await expect(stage.locator("svg")).toBeVisible();

  let worstRadius = 0;
  let worstPivot = 0;
  let escaped = 0;
  let leftReach = 0;
  let rightReach = 0;

  for (let i = 0; i < 30; i += 1) {
    const snap = await page.evaluate(() => {
      const svg = document.querySelector("[data-specimen-stage] svg")!;
      const [, , vw, vh] = svg
        .getAttribute("viewBox")!
        .split(" ")
        .map(Number) as [number, number, number, number];
      const lines = Array.from(svg.querySelectorAll("line"));
      return {
        vw,
        vh,
        balls: Array.from(svg.querySelectorAll("circle")).map((c, k) => ({
          cx: Number(c.getAttribute("cx")),
          cy: Number(c.getAttribute("cy")),
          px: Number(lines[k]!.getAttribute("x1")),
          py: Number(lines[k]!.getAttribute("y1")),
        })),
      };
    });

    snap.balls.forEach((ball, k) => {
      // The string is rigid: the ball rides an arc of exactly STRING.
      worstRadius = Math.max(
        worstRadius,
        Math.abs(Math.hypot(ball.cx - ball.px, ball.cy - ball.py) - STRING),
      );
      // And it hangs from a fixed hook, never a drifting one.
      worstPivot = Math.max(worstPivot, Math.abs(ball.py - 12));
      if (
        ball.cx - R < -0.01 ||
        ball.cx + R > snap.vw + 0.01 ||
        ball.cy - R < -0.01 ||
        ball.cy + R > snap.vh + 0.01
      ) {
        escaped += 1;
      }
      if (k === 0) leftReach = Math.min(leftReach, ball.cx - ball.px);
      if (k === snap.balls.length - 1) {
        rightReach = Math.max(rightReach, ball.cx - ball.px);
      }
    });

    await page.waitForTimeout(55);
  }

  expect(worstRadius, "ball left its string's arc").toBeLessThan(0.01);
  expect(worstPivot, "a string tore off the bar").toBeLessThan(0.01);
  expect(escaped, "a ball rendered outside the viewBox").toBe(0);
  // End balls swing outward, away from the stack — never into it.
  expect(leftReach, "left ball did not swing left").toBeLessThan(-40);
  expect(rightReach, "right ball did not swing right").toBeGreaterThan(40);
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
