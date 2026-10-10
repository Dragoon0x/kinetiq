// Canvas: the gallery at /canvas, its stage, and the way into its pieces.
// The wall shares Tactile's gallery, so these tests prove the room is wired
// to its own sets, demos, URL and stage — the way a visitor drives it.
import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";
import { audioContexts, countAudio, dialogOf } from "./tactile-helpers";

const cards = (page: import("@playwright/test").Page) =>
  page.locator("article[id^='canvas-card-']");

test.describe("canvas gallery", () => {
  test("the set chips filter the wall, keep the URL in step, and move by arrow keys", async ({
    page,
  }) => {
    await gotoHydrated(page, "/canvas");
    const all = page.getByRole("radio", { name: /^All, / });
    await expect(all).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("radiogroup", { name: "Filter by set" }),
    ).toBeVisible();
    const total = await cards(page).count();
    expect(total).toBeGreaterThan(0);

    await all.focus();
    await page.keyboard.press("ArrowRight");
    const chosen = page.locator("[role='radio'][aria-checked='true']").first();
    await expect(chosen).toBeFocused();
    await expect(page).toHaveURL(/\?set=[a-z]+/);
    const set = new URL(page.url()).searchParams.get("set") ?? "";
    const shown = await cards(page).count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
    // Every card left on the wall wears the chosen set's label.
    for (const card of await cards(page).all()) {
      await expect(card).toContainText(set.slice(0, 4), { ignoreCase: true });
    }

    await page.keyboard.press("ArrowLeft");
    await expect(all).toBeFocused();
    await expect(page).toHaveURL(/\/canvas$/);
    await expect(cards(page)).toHaveCount(total);
  });

  test("search narrows the wall, an empty result says so, and the way back is one press", async ({
    page,
  }) => {
    await gotoHydrated(page, "/canvas");
    const total = await cards(page).count();
    await page.getByRole("searchbox").fill("tune in");
    await expect(page.locator("#canvas-card-tune-in")).toBeVisible();
    await page.getByRole("searchbox").fill("nothing matches this");
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByText("Nothing answers to that.")).toBeVisible();
    await page.getByRole("button", { name: "Show everything" }).click();
    await expect(cards(page)).toHaveCount(total);
  });

  test("the stage opens from a card, holds focus, and gives it back on Escape", async ({
    page,
  }) => {
    await gotoHydrated(page, "/canvas");
    await page.getByRole("searchbox").fill("tune in");
    const opener = page.getByRole("button", {
      name: "Open Tune In on the stage",
    });
    await opener.click();
    const dialog = dialogOf(page, "Tune In");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(page).toHaveURL(/\?b=tune-in$/);
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  });

  test("a deep link's tweaks reach the stage and the copied code", async ({
    page,
  }) => {
    await gotoHydrated(page, "/canvas?b=tune-in&t=readout:off");
    const dialog = dialogOf(page, "Tune In");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Code" }).click();
    await expect(dialog.locator("pre code")).toContainText(
      'import { TuneIn } from "@/components/ui/tune-in";',
    );
    await expect(dialog.locator("pre code")).toContainText(
      "<TuneIn readout={false} />",
    );

    // Reset takes the tweak home, and the code with it.
    await dialog.getByRole("button", { name: "Reset" }).click();
    await expect(dialog.locator("pre code")).not.toContainText(
      "<TuneIn readout={false} />",
    );
    await expect(page).toHaveURL(/\?b=tune-in$/);
  });

  test("a piece's docs page carries its tweaks and a way onto the Canvas stage", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/tune-in");
    const link = page.getByRole("link", {
      name: "Open it on the Canvas stage",
    });
    await expect(link).toHaveAttribute("href", "/canvas?b=tune-in");
    await expect(page.getByRole("switch", { name: "Sound" })).toBeVisible();
  });

  test("the wall never scrolls sideways on a phone and makes no sound before a gesture", async ({
    page,
  }) => {
    await countAudio(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await gotoHydrated(page, "/canvas");
    await expect(page.getByRole("switch", { name: "Sound" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // Scroll the whole wall so every card mounts its demo once.
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await audioContexts(page)).toBe(0);
    expect(errors).toEqual([]);
  });
});
