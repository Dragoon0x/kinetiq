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
  await page
    .getByRole("button", { name: /berth 4/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(900);
  await expect(
    dialog.getByRole("button", { name: /confirm berth/i }),
  ).toBeVisible();
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
      [...el.querySelectorAll("span")]
        .map((s) => getComputedStyle(s).transform)
        .join("|"),
    );
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, {
      steps: 6,
    });
    await page.waitForTimeout(250);
    const during = await stage.evaluate((el) =>
      [...el.querySelectorAll("span")]
        .map((s) => getComputedStyle(s).transform)
        .join("|"),
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
    await expect(
      page.locator("div[aria-hidden] [aria-label]").first(),
    ).toBeAttached();
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

test("gallery and team rails expand under hover and the mosaic morphs", async ({
  page,
}) => {
  for (const slug of ["gallery-focus-rail", "team-focus-panels"]) {
    await gotoHydrated(page, `/preview/blocks/${slug}`);
    const panels = page.getByRole("group").first().getByRole("button");
    const count = await panels.count();
    expect(count).toBeGreaterThanOrEqual(5);
    const last = count - 1;
    const wFirst = (await panels.nth(0).boundingBox())?.width ?? 0;
    const wLast = (await panels.nth(last).boundingBox())?.width ?? 0;
    expect(wFirst, `${slug} first panel should lead`).toBeGreaterThan(wLast);
    await panels.nth(last).hover();
    await page.waitForTimeout(800);
    const wLastAfter = (await panels.nth(last).boundingBox())?.width ?? 0;
    expect(wLastAfter, `${slug} hovered panel should grow`).toBeGreaterThan(
      wFirst * 0.9,
    );
  }
  await gotoHydrated(page, "/preview/blocks/gallery-mosaic-morph");
  const tiles = page.getByRole("button", { pressed: true });
  await expect(tiles).toHaveCount(1);
  const leadBefore = await tiles.first().boundingBox();
  const others = page.getByRole("button", { pressed: false });
  const target = others.nth(2);
  const targetBefore = await target.boundingBox();
  await target.click();
  await page.waitForTimeout(900);
  const targetAfter = await page
    .getByRole("button", { pressed: true })
    .first()
    .boundingBox();
  expect(
    (targetAfter?.width ?? 0) * (targetAfter?.height ?? 0),
  ).toBeGreaterThan(
    (targetBefore?.width ?? 1) * (targetBefore?.height ?? 1) * 2,
  );
  expect(leadBefore).not.toBeNull();
});

test("tape wall runs two rows, notice stack advances, launch sheet opens", async ({
  page,
}) => {
  await gotoHydrated(page, "/preview/blocks/testimonial-tape-wall");
  const rows = page.locator(
    "[aria-hidden] [style*='mask'], [style*='mask-image']",
  );
  expect(await rows.count()).toBeGreaterThanOrEqual(2);

  await gotoHydrated(page, "/preview/blocks/announce-notice-stack");
  await page.waitForTimeout(1500);
  const stackedNow =
    (await page.getByRole("status").count()) +
    (await page.locator("[role='alert'], [data-toast]").count());
  expect(stackedNow).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /replay/i })).toBeAttached();

  await gotoHydrated(page, "/preview/blocks/announce-launch-sheet");
  await page.getByRole("button", { name: /open the note/i }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, { timeout: 5000 });
  await expect(
    page.getByRole("button", { name: /read it again/i }),
  ).toBeVisible();
});

test("orbit hub selects and connects; card deck advances; heroes settle", async ({
  page,
}) => {
  await gotoHydrated(page, "/preview/blocks/integrations-orbit-hub");
  const nodes = page.getByRole("button", { pressed: false });
  await nodes.nth(1).click();
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: /^connect/i })
    .first()
    .click();
  await expect(page.getByText(/connected/i).first()).toBeVisible();

  await gotoHydrated(page, "/preview/blocks/how-card-deck");
  await expect(page.getByText(/1 \/ 5/)).toBeVisible();
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByText(/2 \/ 5/)).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await gotoHydrated(page, "/preview/blocks/hero-balance-desk");
  await expect(page.getByText(/pending/i).first()).toBeVisible();
  await expect(page.getByText(/pending/i)).toHaveCount(0, { timeout: 8000 });

  await gotoHydrated(page, "/preview/blocks/hero-handset-stage");
  await expect(page.getByRole("link", { name: /ios/i })).toBeVisible();
});

test("auth-atlas validates and submits; onboarding preview mirrors typing", async ({
  page,
}) => {
  await gotoHydrated(page, "/preview/pages/auth-atlas");
  const email = page.getByLabel(/email/i).first();
  await email.fill("not-an-email");
  await email.blur();
  await expect(
    page
      .getByText(/email/i)
      .filter({ hasText: /look|valid|shape|address/i })
      .first(),
  ).toBeVisible();

  await gotoHydrated(page, "/preview/pages/onboarding-first-run");
  const field = page.getByRole("textbox").first();
  await field.fill("North Basin");
  await expect(page.getByText("North Basin").nth(1)).toBeVisible();
});

test("workbench-rail filters and switches workspaces; the mobile template routes", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/workbench-rail");
  const field = page.getByRole("textbox", { name: /filter/i }).first();
  await field.scrollIntoViewIfNeeded();
  const rail = field.locator("xpath=ancestor::*[self::nav or self::aside or @role='navigation'][1]");
  const before = await rail.getByRole("button").count();
  await field.fill("zzzz-no-such-item");
  await expect(page.getByText(/nothing matches/i)).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await rail.getByRole("button").count()).toBeGreaterThanOrEqual(before - 1);
  const switcher = page.getByRole("button", { expanded: false }).filter({ has: page.locator("[aria-haspopup='menu']") }).first();
  const trigger = page.locator("button[aria-haspopup='menu']").first();
  await trigger.click();
  const items = page.getByRole("menuitemradio");
  await expect(items.first()).toBeVisible();
  const label = (await items.nth(1).textContent())?.trim() ?? "";
  await items.nth(1).click();
  await expect(trigger).toContainText(label.split("\n")[0]?.slice(0, 6) ?? "");
  void switcher;

  await gotoHydrated(page, "/preview/templates/template-coldbrook-mobile");
  await page.getByRole("tab", { name: "/security" }).click();
  await expect(page.getByText(/custody/i).first()).toBeVisible({ timeout: 5000 });
  await page.getByRole("tab", { name: "/networks" }).click();
  await expect(page.locator("button[aria-pressed]").first()).toBeVisible({ timeout: 5000 });
});
