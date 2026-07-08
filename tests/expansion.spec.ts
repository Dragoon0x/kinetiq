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

  test("drag down past the low snap dismisses", async ({ page }) => {
    await gotoHydrated(page, "/components/bottom-sheet");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (!box) throw new Error("no sheet box");
    // Grab near the top of the sheet and fling it well below the stage.
    await page.mouse.move(box.x + box.width / 2, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 320, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 3000 });
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
