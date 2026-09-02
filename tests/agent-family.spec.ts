import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The agent primitives carry behaviour a render test cannot see: a trigger that
 * must only fire at the start of a word, a listing that must hold its whole
 * source even while it is still being turned out, and a thread that must keep
 * speakers apart for assistive tech.
 */

test.describe("prompt-well", () => {
  test("@ opens sources, arrow + Enter takes one, a space closes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/prompt-well");
    const stage = page.locator("[data-specimen-stage]").first();
    // The demo now seats two composers (a plain one and a loaded one); the
    // behaviour under test lives in the first.
    const field = stage.getByRole("combobox").first();
    await field.click();

    // Idle: no list.
    await expect(field).toHaveAttribute("aria-expanded", "false");

    await field.press("@");
    const list = stage.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await expect(list.getByRole("option")).toHaveCount(4);

    // Filtering narrows it.
    await page.keyboard.type("sup");
    await expect(list.getByRole("option")).toHaveCount(1);

    // Taking one inserts the token and closes the list.
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(field).toHaveValue("@supplier-ledger ");

    // A trigger mid-word must not fire — this is an address, not a mention.
    await page.keyboard.type("mail@host");
    await expect(stage.getByRole("listbox")).toBeHidden();
  });

  test("/ only leads the prompt, and Enter sends", async ({ page }) => {
    await gotoHydrated(page, "/components/prompt-well");
    const stage = page.locator("[data-specimen-stage]").first();
    // The demo now seats two composers (a plain one and a loaded one); the
    // behaviour under test lives in the first.
    const field = stage.getByRole("combobox").first();
    await field.click();

    await page.keyboard.type("compare ");
    await field.press("/");
    // Not at the start, so no command list.
    await expect(stage.getByRole("listbox")).toBeHidden();

    await field.fill("");
    await field.press("/");
    await expect(stage.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(stage.getByRole("listbox")).toBeHidden();

    await field.fill("churn the pistachio first");
    await page.keyboard.press("Enter");
    // Sending clears the field and reports through the caption.
    await expect(field).toHaveValue("");
    await expect(stage.locator("..")).toContainText("churn the pistachio first");
  });
});

test("volley-thread keeps speakers apart and announces additions", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/volley-thread");
  const stage = page.locator("[data-specimen-stage]").first();

  const log = stage.getByRole("log");
  await expect(log).toHaveAttribute("aria-live", "polite");

  const before = await log.getByRole("listitem").count();
  await stage.getByRole("button", { name: "Next turn" }).click();
  await expect(log.getByRole("listitem")).toHaveCount(before + 1);

  // Every bubble names its speaker for screen readers, never colour alone.
  await expect(log).toContainText("You:");
  await expect(log).toContainText("Assistant:");
});

test("code-lathe holds its whole source while streaming, and marks a diff", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/code-lathe");
  const stage = page.locator("[data-specimen-stage]").first();

  // Even mid-stream the full listing is in the DOM — copy and AT must see it.
  const code = stage.locator("pre code");
  await expect(code).toContainText("churnSchedule");
  await expect(code).toContainText('hero: "pistachio"');

  // Streaming resolves every line to full opacity.
  await page.waitForTimeout(1200);
  const faded = await code.evaluate(
    (el) =>
      Array.from(el.children).filter(
        (row) => Number(getComputedStyle(row as HTMLElement).opacity) < 0.9,
      ).length,
  );
  expect(faded, "a line never finished turning out").toBe(0);

  // Diff mode marks the gutter and strips the marker from the source text.
  await stage.getByRole("button", { name: "Show edit" }).click();
  await expect(code).toContainText("readFreezerSlots");
  const gutters = await code.evaluate((el) =>
    Array.from(el.children).map(
      (row) => (row.firstElementChild as HTMLElement).textContent,
    ),
  );
  expect(gutters).toContain("+");
  expect(gutters).toContain("-");
});
