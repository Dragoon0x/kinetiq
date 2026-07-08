import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

test.describe("bottom sheet", () => {
  test("opens at the first snap and steps with the handle keys", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/bottom-sheet");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const handle = page.getByRole("button", { name: "Resize sheet" });
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText(/Sheet at 8\d%/)).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText(/Sheet at 40%/)).toBeAttached();
  });

  test("escape dismisses and the trigger reopens", async ({ page }) => {
    await gotoHydrated(page, "/components/bottom-sheet");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Nearby benches" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("dragging the handle down tracks 1:1 and dismisses", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/bottom-sheet");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Let the enter animation settle so the baseline isn't read mid-flight.
    await page.waitForTimeout(900);
    // Drive the drag from the handle — a real element, so the pointer lands on
    // the sheet (boundingBox on the clipped absolute panel mis-hit-tests).
    const handle = page.getByRole("button", { name: "Resize sheet" });
    const hb = await handle.boundingBox();
    if (!hb) throw new Error("no handle");
    const cx = hb.x + hb.width / 2;
    const cy = hb.y + hb.height / 2;
    const yOf = () =>
      dialog.evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
      );

    const before = await yOf();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 72, { steps: 4 });
    const mid = await yOf();
    // 1:1 tracking: the sheet moved down by roughly the pointer delta.
    expect(mid - before).toBeGreaterThan(50);
    await page.mouse.move(cx, cy + 200, { steps: 6 });
    await page.mouse.up();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("beacon", () => {
  test("cycles activities and announces them", async ({ page }) => {
    await gotoHydrated(page, "/blocks/beacon");
    // The demo auto-starts on a timer activity.
    await expect(page.getByRole("status").first()).toBeAttached();
    const next = page.getByRole("button", { name: /next activity/i });
    await next.click(); // upload
    await expect(page.getByText(/%|upload/i).first()).toBeAttached();
    await next.click(); // call
    await expect(
      page.getByRole("button", { name: /accept call/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /accept call/i }).click();
  });
});

test.describe("exchange panel", () => {
  test("typing converts and swapping keeps focus on the input", async ({
    page,
  }) => {
    await gotoHydrated(page, "/blocks/exchange-panel");
    const input = page.getByRole("textbox", { name: /from amount/i });
    await input.fill("4");
    // USD -> EUR at factor 1/1.09 ≈ 3.67 (debounced roll)
    await expect(page.getByText(/3\.6/).first()).toBeAttached({
      timeout: 3000,
    });

    await page.getByRole("button", { name: /swap direction/i }).click();
    await expect(input).toBeFocused();
  });
});

test.describe("ledger", () => {
  test("virtualizes 10k rows, sorts, and reports the visible range", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/ledger");
    // Scope to the ledger itself — the docs prop-table is also role="table".
    const table = page.getByRole("table", { name: "Transactions" });
    await expect(table).toHaveAttribute("aria-rowcount", "10000");

    // Bounded render: far fewer row nodes than rows in the data set.
    const rendered = await table.getByRole("row").count();
    expect(rendered).toBeLessThan(60);

    await expect(page.getByText(/VISIBLE 1–\d+ OF 10,000/)).toBeVisible();

    // Sort by STATUS cycles and announces.
    await page.getByRole("button", { name: /status/i }).click();
    await expect(page.getByText(/Sorted by STATUS/i).first()).toBeAttached();

    // Scroll deep — the range footer follows, node count still bounded.
    await table
      .locator("div")
      .filter({ has: page.locator("[role='row']") })
      .first()
      .evaluate((el) => {
        const scroller =
          el.closest<HTMLElement>("[style*='overflow']") ??
          (el.querySelector("[style*='overflow']") as HTMLElement | null) ??
          el;
        scroller.scrollTop = 200_000;
      });
    await expect(page.getByText(/OF 10,000/)).toBeVisible();
    expect(await table.getByRole("row").count()).toBeLessThan(60);
  });
});

test.describe("zoetrope", () => {
  test("arrow keys step detents and announce the fronted panel", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/zoetrope");
    await expect(page.getByText(/FRONT · KQ-/)).toBeVisible();
    const before = await page.getByText(/FRONT · KQ-/).textContent();

    const drum = page.getByRole("group", { name: /specimen drum/i });
    await drum.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => page.getByText(/FRONT · KQ-/).textContent(), {
        timeout: 3000,
      })
      .not.toBe(before);
  });

  test("reduced motion renders the flat scroll-snap row", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await gotoHydrated(page, "/components/zoetrope");
    // No 3D drum group under RM; the row still exposes carousel semantics.
    await expect(
      page.locator('[aria-roledescription="carousel"]').first(),
    ).toBeVisible();
    const drum3d = await page
      .locator('[style*="preserve-3d"]')
      .count();
    expect(drum3d).toBe(0);
    await context.close();
  });
});

test.describe("radio group travel", () => {
  test("arrow keys move the selection dot and update state", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/radio-group");
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(3);
    await radios.nth(1).click();
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await radios.nth(1).press("ArrowDown");
    await expect(radios.nth(2)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("TIER · DEDICATED")).toBeVisible();
  });
});
