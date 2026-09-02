// Device-level probes for the parity waves: each test drives a new instrument
// end to end rather than only rendering it — the generic sweeps cannot tell
// whether a rail expanded or a spotlight followed.
import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

test("focus-rail: hover previews, keyboard commits, leaving restores", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/focus-rail");
  const rail = page.getByRole("group", { name: /focus rail/i });
  const panels = rail.getByRole("button");
  await expect(panels).toHaveCount(5);
  const widthOf = async (i: number) =>
    (await panels.nth(i).boundingBox())?.width ?? 0;
  const w0 = await widthOf(0);
  const w2 = await widthOf(2);
  expect(w0).toBeGreaterThan(w2);
  await panels.nth(2).hover();
  await page.waitForTimeout(700);
  expect(await widthOf(2)).toBeGreaterThan(await widthOf(0));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(800);
  expect(await widthOf(0)).toBeGreaterThan(await widthOf(2));
  await panels.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  expect(await widthOf(1)).toBeGreaterThan(await widthOf(0));
});

test("turn-modal: opens into a trapped dialog and closes on Escape", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/turn-modal");
  await page.getByRole("button", { name: /berth 4/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(900);
  await expect(dialog.getByRole("button", { name: /confirm berth/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
});

test("type treatments: glyphs deform under the cursor and settle", async ({
  page,
}) => {
  for (const slug of ["elastic-type", "band-type"]) {
    await gotoHydrated(page, `/components/${slug}`);
    const stage = page.locator("[aria-label='404']").first();
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    const before = await stage.evaluate((el) =>
      [...el.querySelectorAll("span")].map((s) => getComputedStyle(s).transform).join("|"),
    );
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 6 });
    await page.waitForTimeout(250);
    const during = await stage.evaluate((el) =>
      [...el.querySelectorAll("span")].map((s) => getComputedStyle(s).transform).join("|"),
    );
    expect(during, `${slug} did not move under the cursor`).not.toBe(before);
  }
  await gotoHydrated(page, "/components/echo-type");
  const echo = page.locator("[aria-label='404']").first();
  await echo.scrollIntoViewIfNeeded();
  await echo.hover();
  await page.waitForTimeout(900);
  const spread = await echo.evaluate((el) => {
    const xs = [...el.querySelectorAll("span[aria-hidden]")].map(
      (s) => new DOMMatrix(getComputedStyle(s).transform).m41,
    );
    return Math.max(...xs) - Math.min(...xs);
  });
  expect(spread).toBeGreaterThan(20);
});

test("vignettes: render, loop, and seat in the empty states", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  for (const slug of [
    "vignette-empty-drawer",
    "vignette-search-sweep",
    "vignette-inbox-zero",
    "vignette-blank-board",
  ]) {
    await gotoHydrated(page, `/components/${slug}`);
    await page.waitForTimeout(1500);
  }
  for (const slug of ["empty-no-matches", "empty-needs-access"]) {
    await gotoHydrated(page, `/preview/blocks/${slug}`);
    await expect(page.locator("div[aria-hidden] [aria-label]").first()).toBeAttached();
  }
  expect(errors).toEqual([]);
});

test("footer-spotlight-mark: the spotlight follows and collapses", async ({
  page,
}) => {
  await gotoHydrated(page, "/preview/blocks/footer-spotlight-mark");
  const solid = page.locator("span[style*='clip-path']").first();
  await solid.scrollIntoViewIfNeeded();
  const box = await solid.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const during = await solid.evaluate((el) => getComputedStyle(el).clipPath);
  expect(during).toMatch(/circle\((?!0px)/);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(900);
  const after = await solid.evaluate((el) => getComputedStyle(el).clipPath);
  expect(after).toMatch(/circle\(0px/);
});
