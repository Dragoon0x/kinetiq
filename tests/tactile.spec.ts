// Tactile: the gallery at /tactile, its stage, and the components on it.
// The gallery tests drive the page the way a visitor does — chips, search,
// the stage, the URL, the back button — and the component blocks below drive
// each component's own mechanic, one test per component.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/** Counts AudioContexts, so a test can prove none exist before a gesture. */
const countAudio = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & {
      __audioContexts: number;
    };
    w.__audioContexts = 0;
    for (const key of ["AudioContext", "webkitAudioContext"]) {
      const Real = w[key] as (new (...args: unknown[]) => object) | undefined;
      if (!Real) continue;
      w[key] = class extends Real {
        constructor(...args: unknown[]) {
          super(...args);
          w.__audioContexts += 1;
        }
      };
    }
  });
};

const audioContexts = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __audioContexts: number }).__audioContexts,
  );

const dialogOf = (page: Page, name: string): Locator =>
  page.getByRole("dialog", { name });

test.describe("tactile gallery", () => {
  test("the chips filter by verb, keep the URL in step, and move by arrow keys", async ({
    page,
  }) => {
    await gotoHydrated(page, "/tactile");
    const all = page.getByRole("radio", { name: /^All, / });
    await expect(all).toHaveAttribute("aria-checked", "true");
    const cards = page.locator("article[id^='tactile-card-']");
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);

    await all.focus();
    await page.keyboard.press("ArrowRight");
    const second = page.locator("[role='radio'][aria-checked='true']").first();
    await expect(second).toBeFocused();
    await expect(page).toHaveURL(/\?verb=[a-z]+/);
    const verb = new URL(page.url()).searchParams.get("verb") ?? "";
    // Every card left on the wall answers to the chosen verb.
    for (const card of await cards.all()) {
      await expect(card).toContainText(verb.toUpperCase().slice(0, 3), {
        ignoreCase: true,
      });
    }

    await page.keyboard.press("ArrowLeft");
    await expect(all).toBeFocused();
    await expect(all).toHaveAttribute("aria-checked", "true");
    await expect(page).toHaveURL(/\/tactile$/);
    await expect(cards).toHaveCount(total);
  });

  test("search narrows the wall, an empty result says so, and the way back is one press", async ({
    page,
  }) => {
    await gotoHydrated(page, "/tactile");
    const cards = page.locator("article[id^='tactile-card-']");
    const total = await cards.count();
    await page.getByRole("searchbox").fill("gel");
    await expect(page.locator("#tactile-card-gel-switch")).toBeVisible();
    await page.getByRole("searchbox").fill("nothing matches this");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText("Nothing answers to that.")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "shown" }),
    ).toHaveText("0 components shown.");
    await page.getByRole("button", { name: "Show everything" }).click();
    await expect(cards).toHaveCount(total);
  });

  test("the stage opens from a card, holds focus, and gives it back on Escape", async ({
    page,
  }) => {
    await gotoHydrated(page, "/tactile");
    const opener = page.getByRole("button", {
      name: "Open Gel Switch on the stage",
    });
    await opener.click();
    const dialog = dialogOf(page, "Gel Switch");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(page).toHaveURL(/\?b=gel-switch$/);
    // Everything behind the stage is inert and the page does not scroll.
    const inert = await page.evaluate(
      () =>
        Array.from(document.body.children).filter(
          (c) =>
            c.hasAttribute("inert") &&
            !c.hasAttribute("data-tactile-stage-root"),
        ).length,
    );
    expect(inert).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page).toHaveURL(/\/tactile$/);
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  });

  test("Back closes the stage the way it opened", async ({ page }) => {
    await gotoHydrated(page, "/tactile");
    await page
      .getByRole("button", { name: "Open Gel Switch on the stage" })
      .click();
    await expect(dialogOf(page, "Gel Switch")).toBeVisible();
    await page.goBack();
    await expect(dialogOf(page, "Gel Switch")).toHaveCount(0);
    await expect(page).toHaveURL(/\/tactile$/);
  });

  test("a tweak changes the copied code and the share link, and a deep link restores it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/tactile?b=gel-switch");
    const dialog = dialogOf(page, "Gel Switch");
    await expect(dialog).toBeVisible();

    const viscosity = dialog.getByRole("slider", { name: "Viscosity" });
    await expect(viscosity).toHaveAttribute("aria-valuetext", "0.50");
    await viscosity.focus();
    await page.keyboard.press("End");
    await expect(viscosity).toHaveAttribute("aria-valuetext", "1.00");
    await dialog.getByRole("radio", { name: "Large" }).click();
    await expect(page).toHaveURL(/t=viscosity%3A1%2Csize%3Alg/);

    await dialog.getByRole("radio", { name: "Code" }).click();
    await expect(dialog.locator("pre code")).toHaveText(
      'import { GelSwitch } from "@/components/ui/gel-switch";\n\n<GelSwitch viscosity={1} size="lg" />',
    );

    // Reset takes every tweak home, and the code with it.
    await dialog.getByRole("button", { name: "Reset" }).click();
    await expect(dialog.locator("pre code")).toContainText("<GelSwitch />");
    await expect(page).toHaveURL(/\?b=gel-switch$/);

    await gotoHydrated(page, "/tactile?b=gel-switch&t=wobble:1,fill:off");
    const again = dialogOf(page, "Gel Switch");
    await expect(again.getByRole("slider", { name: "Wobble" })).toHaveAttribute(
      "aria-valuetext",
      "1.00",
    );
    await expect(again.getByRole("radio", { name: "Off" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // A hand-edited link can only ever produce a state the panel could have.
    await gotoHydrated(page, "/tactile?b=gel-switch&t=wobble:9,size:huge");
    const clamped = dialogOf(page, "Gel Switch");
    await expect(
      clamped.getByRole("slider", { name: "Wobble" }),
    ).toHaveAttribute("aria-valuetext", "1.00");
    await expect(
      clamped.getByRole("radio", { name: "Medium" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("sound is off by default, no audio exists before a gesture, and the choice is remembered", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/tactile");
    const sound = page.getByRole("switch", { name: "Sound" });
    await expect(sound).toHaveAttribute("aria-checked", "false");
    // Pressing a component with sound off never creates an audio context.
    await page.locator("#tactile-card-gel-switch").getByRole("switch").click();
    expect(await audioContexts(page)).toBe(0);

    await sound.click();
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await page.locator("#tactile-card-gel-switch").getByRole("switch").click();
    await expect.poll(() => audioContexts(page)).toBe(1);

    await page.reload();
    await page.waitForSelector("body[data-hydrated]");
    await expect(page.getByRole("switch", { name: "Sound" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("the wall never scrolls sideways on a phone, and the stage fills it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/tactile");
    const overflow = await page.evaluate(
      () =>
        document.scrollingElement!.scrollWidth -
        document.scrollingElement!.clientWidth,
    );
    expect(overflow).toBe(0);
    await page
      .getByRole("button", { name: "Open Gel Switch on the stage" })
      .click();
    const box = await dialogOf(page, "Gel Switch").boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(389);
  });
});

test.describe("tactile press", () => {
  test("gel-switch: a tap, Space, Enter and a drag each toggle once, and a drag that comes back does not", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gel-switch");
    const stage = page.locator("[data-specimen-stage]").first();
    const status = stage.locator("[role='status']").last();
    const sw = stage.getByRole("switch", { name: "Round-ups" });

    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("round-ups on");

    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("round-ups off");

    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(sw).toHaveAttribute("aria-checked", "false");

    // A drag across the track, released past the middle, turns it on; the
    // droplet follows the pointer, so the drag starts on the knob.
    const box = await sw.boundingBox();
    if (!box) throw new Error("the switch has no box");
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 8; k += 1) {
      await page.mouse.move(box.x + 12 + k * 4, box.y + box.height / 2);
    }
    await page.mouse.up();
    await expect(sw).toHaveAttribute("aria-checked", "true");

    // A short drag that comes back is not a toggle.
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 18, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
    await page.mouse.up();
    await expect(sw).toHaveAttribute("aria-checked", "true");
  });
});
