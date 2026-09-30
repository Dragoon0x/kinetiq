// Tactile: the gallery at /tactile, its stage, and the components on it.
// The gallery tests drive the page the way a visitor does — chips, search,
// the stage, the URL, the back button — and the component blocks below drive
// each component's own mechanic, one test per component.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoHydrated } from "./helpers";
import {
  countAudio,
  audioContexts,
  dialogOf,
  pressStage,
  pressOnStage,
  pressDown,
  pressTap,
  pressTop,
  type PressLog,
  pressLog,
  pressNow,
  pressTook,
  pressAfter,
  holdGoto,
} from "./tactile-helpers";

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
    // Cards mount their demos only near the viewport, so the card is brought
    // into view before its switch is pressed.
    const gel = page.locator("#tactile-card-gel-switch");
    // Pressing a component with sound off never creates an audio context.
    await gel.scrollIntoViewIfNeeded();
    await gel.getByRole("switch").click();
    expect(await audioContexts(page)).toBe(0);

    await sound.click();
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await gel.scrollIntoViewIfNeeded();
    await gel.getByRole("switch").click();
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
    // The stage grows out of the card, so its width is read once it lands.
    const dialog = dialogOf(page, "Gel Switch");
    await expect
      .poll(async () => (await dialog.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(389);
  });
});

/**
 * The number a clicker's wheels show: for each wheel, the digit whose cell
 * sits in its window. The wheels are geometry, so they are read from their
 * boxes — all in one frame, so no wheel is read mid-turn against another.
 */
const pressWheels = (body: Locator) =>
  body.evaluate((button) => {
    const cells = Array.from(button.querySelectorAll("span")).filter(
      (s) => s.children.length === 0 && /^\d$/.test(s.textContent ?? ""),
    );
    const wheelOf = (cell: Element) => cell.parentElement?.parentElement;
    const wheels = [...new Set(cells.map(wheelOf))];
    return wheels
      .map((wheel) => {
        if (!wheel) return "?";
        const box = wheel.getBoundingClientRect();
        const mid = box.top + box.height / 2;
        let digit = "?";
        let gap = Number.POSITIVE_INFINITY;
        for (const cell of cells) {
          if (wheelOf(cell) !== wheel) continue;
          const r = cell.getBoundingClientRect();
          const off = Math.abs(r.top + r.height / 2 - mid);
          if (off < gap) {
            gap = off;
            digit = cell.textContent ?? "?";
          }
        }
        return digit;
      })
      .join("");
  });

/** Conjure's glyph particles: the spans beside the spark in the swarm layer. */
const pressSwarm = (button: Locator) =>
  button
    .locator(":scope > span > svg")
    .locator("xpath=..")
    .locator(":scope > span");

/** The faintest particle: every one is lit once the swarm is in orbit. */
const pressFaintest = (swarm: Locator) =>
  swarm.evaluateAll((els) =>
    Math.min(...els.map((el) => Number(getComputedStyle(el).opacity))),
  );

const pressOpacity = (target: Locator) =>
  target.evaluate((el) => Number(getComputedStyle(el).opacity));

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

  test("conjure-button: a click, Enter and Space each start one run, its name and status follow the host, and a press mid-run is ignored", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/conjure-button");
    const stage = pressStage(page);
    const button = stage.getByRole("button");
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();

    // One name, the label; the letter stack is not read out. Nothing is said on mount.
    await expect(button).toHaveAccessibleName("Draft release notes");
    await expect(said).toHaveText("");
    await expect(line).toHaveText("ready · 14 changes · press to draft");

    // Pointer: one press starts run 1, and only the host's answer ends it.
    await pressTap(page, button);
    await expect(button).toHaveAccessibleName("Drafting release notes");
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(said).toHaveText("Drafting release notes");
    await expect(line).toHaveText("drafting · run 1 · 2.2 s");
    // Mid-run, a pointer press and an Enter are both swallowed; focus stays.
    await pressTap(page, button);
    await page.keyboard.press("Enter");
    await expect(button).toBeFocused();
    await expect(line).toHaveText("drafting · run 1 · 2.2 s");
    await expect(button).toHaveAccessibleName("Notes drafted · 6 items");
    await expect(button).not.toHaveAttribute("aria-busy");
    await expect(said).toHaveText("Notes drafted · 6 items");
    await expect(line).toHaveText("notes drafted · 6 items · press to redraft");
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh host: Enter lands exactly where the pointer did.
    await gotoHydrated(page, "/components/conjure-button");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAccessibleName("Drafting release notes");
    await expect(said).toHaveText("Drafting release notes");
    await expect(line).toHaveText("drafting · run 1 · 2.2 s");
    await expect(button).toHaveAccessibleName("Notes drafted · 6 items");
    await expect(said).toHaveText("Notes drafted · 6 items");
    await expect(line).toHaveText("notes drafted · 6 items · press to redraft");
    // Space starts the next run, which the host fails; the name and the status say so.
    await page.keyboard.press("Space");
    await expect(line).toHaveText("drafting · run 2 · 1.7 s");
    await expect(said).toHaveText("Drafting release notes");
    await expect(button).toHaveAccessibleName("Draft failed · Retry");
    await expect(said).toHaveText("Draft failed · Retry");
    await expect(line).toHaveText("draft failed · press to retry");
    await expect(button).toBeFocused();
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a press is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await pressTap(page, button);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: 12 glyphs of the label and no shimmer band while they orbit…
    let tuned = await pressOnStage(
      page,
      "conjure-button",
      "Conjure Button",
      "particles:12,shimmer:off",
    );
    let conjure = tuned.getByRole("button");
    let swarm = pressSwarm(conjure);
    await expect(swarm).toHaveCount(12);
    for (const glyph of await swarm.allTextContents()) {
      expect("Draftreleasenotes").toContain(glyph);
    }
    await pressTap(page, conjure);
    await expect(conjure).toHaveAttribute("aria-busy", "true");
    await expect
      .poll(() => pressFaintest(swarm), { intervals: [100] })
      .toBeGreaterThan(0.35);
    expect(await pressOpacity(conjure.locator(":scope > span").first())).toBe(
      0,
    );

    // …and 48 glyphs with the band scanning across them.
    tuned = await pressOnStage(
      page,
      "conjure-button",
      "Conjure Button",
      "particles:48",
    );
    conjure = tuned.getByRole("button");
    swarm = pressSwarm(conjure);
    await expect(swarm).toHaveCount(48);
    await pressTap(page, conjure);
    await expect
      .poll(() => pressFaintest(swarm), { intervals: [100] })
      .toBeGreaterThan(0.35);
    await expect
      .poll(() => pressOpacity(conjure.locator(":scope > span").first()))
      .toBeGreaterThan(0.5);
  });

  test("split-confirm: a click and Enter each split it, Cancel and Escape close it, Confirm arms before it latches, and the countdown heals it", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/split-confirm");
    const stage = pressStage(page);
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const whole = stage.getByRole("button", { name: "Delete branch" });
    const cancel = stage.getByRole("button", { name: "Cancel" });
    const confirm = stage.getByRole("button", { name: "Delete", exact: true });
    const latched = stage.getByRole("button", { name: "Branch deleted" });
    const question = "Delete branch: Delete or Cancel, closes in 4 seconds";
    const log = await pressLog(said);

    await expect(said).toHaveText("");
    await expect(line).toHaveText("ready · the question stays open 4 s");
    // Whole, the halves are inert and out of the accessibility tree.
    await expect(cancel).toHaveCount(0);
    await expect(confirm).toHaveCount(0);

    // Pointer: the press splits it, the whole leaves the tree, Confirm takes focus.
    await pressTap(page, whole);
    await expect(confirm).toBeFocused();
    await expect(cancel).toBeVisible();
    await expect(whole).toHaveCount(0);
    await expect(said).toHaveText(question);
    await pressTap(page, cancel);
    await expect(whole).toBeFocused();
    await expect(said).toHaveText("Cancelled");
    await expect(line).toHaveText("cancelled · nothing deleted");
    await expect(confirm).toHaveCount(0);

    // A double click on Confirm's side is one split, never an answer.
    const box = await whole.boundingBox();
    if (!box) throw new Error("the button has no box");
    await page.mouse.dblclick(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect(confirm).toBeFocused();
    await expect(said).toHaveText(question);
    // Confirm arms ~320 ms after the split, by the page's own clock.
    await pressAfter(page, log, 400);
    await pressTap(page, confirm);
    await expect(latched).toBeFocused();
    await expect(latched).toHaveAttribute("aria-disabled", "true");
    await expect(said).toHaveText("Branch deleted");
    await expect(line).toHaveText("branch deleted · undo restores it");

    // The host's undo brings the live button back.
    await stage.getByRole("button", { name: "Undo" }).click();
    await expect(whole).toBeVisible();
    await expect(whole).not.toHaveAttribute("aria-disabled");
    await expect(said).toHaveText("");
    await expect(line).toHaveText("ready · the question stays open 4 s");

    // Keyboard: Enter splits, the arrows cross the halves, Escape closes.
    await whole.focus();
    await page.keyboard.press("Enter");
    await expect(confirm).toBeFocused();
    await expect(said).toHaveText(question);
    await page.keyboard.press("ArrowLeft");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(whole).toBeFocused();
    await expect(said).toHaveText("Cancelled");
    await expect(line).toHaveText("cancelled · nothing deleted");

    // A held Enter splits it once; its auto-repeat, even once Confirm is
    // armed, is not an answer.
    await page.keyboard.down("Enter");
    await expect(confirm).toBeFocused();
    await expect(said).toHaveText(question);
    await pressAfter(page, log, 400);
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect(confirm).toBeFocused();
    await expect(said).toHaveText(question);
    // A fresh Enter answers, and lands where the pointer did.
    await page.keyboard.press("Enter");
    await expect(latched).toBeFocused();
    await expect(latched).toHaveAttribute("aria-disabled", "true");
    await expect(said).toHaveText("Branch deleted");
    await expect(line).toHaveText("branch deleted · undo restores it");
    expect(await audioContexts(page)).toBe(0);

    // With sound on, the split is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await pressTap(page, whole);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: a neutral tone asks to merge, and the question lasts 2 s.
    const tuned = await pressOnStage(
      page,
      "split-confirm",
      "Split Confirm",
      "timeout:2,tone:neutral",
    );
    const merge = tuned.getByRole("button", { name: "Merge branch" });
    const mergeConfirm = tuned.getByRole("button", {
      name: "Merge",
      exact: true,
    });
    const tunedSaid = tuned.getByRole("status").first();
    const tunedLine = tuned.getByRole("status").last();
    const ask = "Merge branch: Merge or Cancel, closes in 2 seconds";
    await expect(tunedLine).toHaveText("ready · the question stays open 2 s");
    const tunedLog = await pressLog(tunedSaid);
    const asked = await pressNow(page);
    await pressTap(page, merge);
    await expect(mergeConfirm).toBeFocused();
    await expect(tunedSaid).toHaveText(ask);
    // Left alone it heals, and focus that was inside comes back to the button.
    await expect(tunedSaid).toHaveText("Timed out");
    await expect(merge).toBeFocused();
    await expect(tunedLine).toHaveText("timed out · nothing merged");
    // Two seconds (after the ~90 ms crack), well short of the default four.
    const open = pressTook(await tunedLog(), "Timed out", asked);
    expect(open).toBeGreaterThan(2000);
    expect(open).toBeLessThan(3200);

    // Focus taken elsewhere stays there when the question times out.
    await page.keyboard.press("Enter");
    await expect(mergeConfirm).toBeFocused();
    await expect(tunedSaid).toHaveText(ask);
    await page.keyboard.press("Tab");
    const away = dialogOf(page, "Split Confirm").getByRole("button", {
      name: "Reset",
    });
    await expect(away).toBeFocused();
    await expect(tunedSaid).toHaveText("Timed out");
    await expect(away).toBeFocused();
    await expect(merge).not.toBeFocused();
  });

  test("clicker-count: presses, Space and a held Enter count up through the carry, a held knob or held Space clears it, and an early release keeps the count", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/clicker-count");
    const stage = pressStage(page);
    const counter = stage.getByRole("group", { name: "Gate B arrivals" });
    const body = counter.getByRole("button", {
      name: "Add one to Gate B arrivals",
    });
    const knob = counter.getByRole("button", {
      name: "Hold to reset Gate B arrivals",
    });
    const said = counter.getByRole("status");
    const line = stage.getByRole("status").last();

    await expect(said).toHaveText("Gate B arrivals: 97");
    await expect(line).toHaveText("0097 arrivals · hold the knob to clear");
    await expect.poll(() => pressWheels(body)).toBe("0097");

    // Pointer: three strokes carry 97 into the hundreds, every wheel with it.
    for (const n of [98, 99, 100]) {
      await pressTap(page, body);
      await expect(said).toHaveText(`Gate B arrivals: ${n}`);
    }
    await expect(line).toHaveText("0100 arrivals · hold the knob to clear");
    await expect.poll(() => pressWheels(body)).toBe("0100");

    // A hold let go early: the wheels start winding back, then spring home,
    // and the count stays.
    await pressDown(page, knob);
    await expect
      .poll(() => pressWheels(body), { intervals: [50] })
      .not.toBe("0100");
    await page.mouse.up();
    await expect.poll(() => pressWheels(body)).toBe("0100");
    await expect(said).toHaveText("Gate B arrivals: 100");

    // Held to the end, every wheel lands on zero.
    await pressDown(page, knob);
    await expect(said).toHaveText("Gate B arrivals: 0");
    await page.mouse.up();
    await expect(line).toHaveText("0000 arrivals · cleared");
    await expect.poll(() => pressWheels(body)).toBe("0000");
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh count: the same three strokes, the same wheels.
    await gotoHydrated(page, "/components/clicker-count");
    await body.focus();
    await page.keyboard.press("Space");
    await expect(said).toHaveText("Gate B arrivals: 98");
    await page.keyboard.press("Enter");
    await expect(said).toHaveText("Gate B arrivals: 99");
    await page.keyboard.press("Space");
    await expect(said).toHaveText("Gate B arrivals: 100");
    await expect(line).toHaveText("0100 arrivals · hold the knob to clear");
    await expect.poll(() => pressWheels(body)).toBe("0100");
    // A held Enter keeps counting, one per repeat, like a held plunger.
    await page.keyboard.down("Enter");
    await expect(said).toHaveText("Gate B arrivals: 101");
    await page.keyboard.down("Enter");
    await expect(said).toHaveText("Gate B arrivals: 102");
    await page.keyboard.up("Enter");
    await expect.poll(() => pressWheels(body)).toBe("0102");

    // The knob: held Space winds it, Escape lets it go early.
    await knob.focus();
    await page.keyboard.down("Space");
    await expect
      .poll(() => pressWheels(body), { intervals: [50] })
      .not.toBe("0102");
    await page.keyboard.press("Escape");
    await expect.poll(() => pressWheels(body)).toBe("0102");
    await expect(said).toHaveText("Gate B arrivals: 102");
    await page.keyboard.up("Space");
    // Held Space to the end lands where the pointer's hold did.
    await page.keyboard.down("Space");
    await expect(said).toHaveText("Gate B arrivals: 0");
    await page.keyboard.up("Space");
    await expect(line).toHaveText("0000 arrivals · cleared");
    await expect.poll(() => pressWheels(body)).toBe("0000");
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a stroke is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await pressTap(page, body);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: three wheels and a 12px stroke…
    let tuned = await pressOnStage(
      page,
      "clicker-count",
      "Clicker Count",
      "digits:3,travel:12",
    );
    let tunedBody = tuned.getByRole("button", {
      name: "Add one to Gate B arrivals",
    });
    let plunger = tunedBody.locator(":scope > span").first();
    await expect.poll(() => pressWheels(tunedBody)).toBe("097");
    await expect(tuned.getByRole("status").last()).toHaveText(
      "097 arrivals · hold the knob to clear",
    );
    let rest = await pressTop(plunger);
    await pressDown(page, tunedBody);
    await expect
      .poll(async () => (await pressTop(plunger)) - rest)
      .toBeCloseTo(12, 0);
    await page.mouse.up();
    await expect
      .poll(async () => (await pressTop(plunger)) - rest)
      .toBeCloseTo(0, 0);
    await expect(tuned.getByRole("status").first()).toHaveText(
      "Gate B arrivals: 98",
    );
    await expect.poll(() => pressWheels(tunedBody)).toBe("098");

    // …then five wheels and a 4px stroke.
    tuned = await pressOnStage(
      page,
      "clicker-count",
      "Clicker Count",
      "digits:5,travel:4",
    );
    tunedBody = tuned.getByRole("button", {
      name: "Add one to Gate B arrivals",
    });
    plunger = tunedBody.locator(":scope > span").first();
    await expect.poll(() => pressWheels(tunedBody)).toBe("00097");
    rest = await pressTop(plunger);
    await pressDown(page, tunedBody);
    await expect
      .poll(async () => (await pressTop(plunger)) - rest)
      .toBeCloseTo(4, 0);
    await page.mouse.up();
    await expect.poll(() => pressWheels(tunedBody)).toBe("00098");
  });

  test("keycap-press: a click, Space, Enter and the real E key each press it once and hold it down while held, and a text field keeps its E", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/keycap-press");
    const stage = pressStage(page);
    const key = stage.getByRole("button", { name: "Archive" });
    const line = stage.getByRole("status").last();
    const legend = key.getByText("E", { exact: true });
    // The default cap is 8px tall and travels 0.7 of it.
    const travel = 5.6;

    await expect(key).toHaveAttribute("aria-keyshortcuts", "E");
    await expect(line).toHaveText("inbox · press e or click archive");
    await expect(stage.getByText("Invoice 2291 is ready")).toBeVisible();
    await key.scrollIntoViewIfNeeded();
    const rest = await pressTop(legend);

    // Pointer: down while held, one archive when it lets go.
    await pressDown(page, key);
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest + travel, 0);
    await expect(line).toHaveText("inbox · press e or click archive");
    await page.mouse.up();
    await expect(line).toHaveText("1 archived · last by click");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest, 0);
    await expect(stage.getByText("Uptime report: May")).toBeVisible();

    // Space: down while held, the press on release.
    await key.focus();
    await page.keyboard.down("Space");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest + travel, 0);
    await page.keyboard.up("Space");
    await expect(line).toHaveText("2 archived · last from the keyboard");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest, 0);

    // Enter presses on the way down; held through its auto-repeat it is
    // still one press.
    await page.keyboard.down("Enter");
    await expect(line).toHaveText("3 archived · last from the keyboard");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest + travel, 0);
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest, 0);
    await expect(line).toHaveText("3 archived · last from the keyboard");

    // The real E key, from anywhere on the page: the same, held and let go.
    await key.blur();
    await page.keyboard.down("e");
    await expect(line).toHaveText("4 archived · last with the e key");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest + travel, 0);
    await page.keyboard.down("e");
    await page.keyboard.up("e");
    await expect.poll(() => pressTop(legend)).toBeCloseTo(rest, 0);
    await expect(line).toHaveText("4 archived · last with the e key");

    // Typed into a text field, an E is the field's, not the key's.
    await page.evaluate(() => {
      const field = document.createElement("input");
      field.setAttribute("aria-label", "Scratch note");
      document.body.append(field);
    });
    const field = page.getByRole("textbox", { name: "Scratch note" });
    await field.focus();
    await page.keyboard.press("e");
    await expect(field).toHaveValue("e");
    await expect(line).toHaveText("4 archived · last with the e key");
    expect(await audioContexts(page)).toBe(0);

    // With sound on, the switch is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await pressTap(page, key);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: a 14px cap printed with the key alone travels 9.8px.
    let tuned = await pressOnStage(
      page,
      "keycap-press",
      "Keycap Press",
      "height:14,legend:key",
    );
    let cap = tuned.getByRole("button", { name: "Archive" });
    await expect(cap).toHaveText("E");
    await expect(cap).toHaveAccessibleName("Archive");
    const glyph = cap.getByText("E", { exact: true });
    const high = await pressTop(glyph);
    // Focus is on the stage, which holds the key: the shortcut reaches it.
    await page.keyboard.down("e");
    await expect(tuned.getByRole("status").last()).toHaveText(
      "1 archived · last with the e key",
    );
    await expect.poll(() => pressTop(glyph)).toBeCloseTo(high + 9.8, 0);
    await page.keyboard.up("e");
    await expect.poll(() => pressTop(glyph)).toBeCloseTo(high, 0);

    // The label legend prints the action instead.
    tuned = await pressOnStage(
      page,
      "keycap-press",
      "Keycap Press",
      "legend:label",
    );
    cap = tuned.getByRole("button", { name: "Archive" });
    await expect(cap).toHaveText("Archive");
    await expect(cap).toHaveAttribute("aria-keyshortcuts", "E");
  });

  test("copy-slip: a click and Enter each put the link on the clipboard, a refused write says why and selects the text, and the next press clears it", async ({
    page,
  }) => {
    const link = "pay.waylight.test/r/4F9A-C21E";
    await countAudio(page);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoHydrated(page, "/components/copy-slip");
    const stage = pressStage(page);
    const button = stage.getByRole("button", { name: /Payment link$/ });
    const block = stage.getByRole("button", { name: "Block the clipboard" });
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    const put = (text: string) =>
      page.evaluate((t) => navigator.clipboard.writeText(t), text);

    await expect(button).toHaveAccessibleName("Copy Payment link");
    await expect(said).toHaveText("");
    await expect(line).toHaveText("ready · nothing copied yet");

    // Pointer: the link lands on the clipboard, then the clip opens again.
    await put("");
    await pressTap(page, button);
    await expect(button).toHaveAccessibleName("Copied Payment link");
    await expect(said).toHaveText("Payment link copied.");
    await expect(line).toHaveText("copied · payment link on the clipboard");
    expect(await clipboard()).toBe(link);
    await expect(button).toHaveAccessibleName("Copy Payment link");

    // Keyboard: Enter lands in the same place.
    await put("");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAccessibleName("Copied Payment link");
    await expect(said).toHaveText("Payment link copied.");
    await expect(line).toHaveText("copied · payment link on the clipboard");
    expect(await clipboard()).toBe(link);

    // A clipboard that refuses: Failed, the reason in words, the text selected.
    await block.click();
    await expect(block).toHaveAttribute("aria-pressed", "true");
    await put("before");
    const apple = await page.evaluate(() =>
      /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    );
    const why = `The browser blocked the clipboard. The text is selected; press ${apple ? "⌘C" : "Ctrl+C"} to copy it.`;
    await pressTap(page, button);
    await expect(button).toHaveAccessibleName("Failed Payment link");
    await expect(said).toHaveText(`Not copied. ${why}`);
    await expect(stage.getByText(why, { exact: true })).toBeVisible();
    await expect(line).toHaveText("not copied · clipboard blocked");
    expect(await page.evaluate(() => String(window.getSelection()))).toBe(link);
    expect(await clipboard()).toBe("before");

    // The reason stays until the next press, which clears it.
    await block.click();
    await expect(block).toHaveAttribute("aria-pressed", "false");
    await expect(stage.getByText(why, { exact: true })).toBeVisible();
    await button.focus();
    await page.keyboard.press("Space");
    await expect(stage.getByText(why, { exact: true })).toHaveCount(0);
    await expect(button).toHaveAccessibleName("Copied Payment link");
    expect(await clipboard()).toBe(link);
    expect(await audioContexts(page)).toBe(0);

    // With sound on, the slip is heard leaving.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await pressTap(page, button);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: ruled lines instead of the text, and a 1 s hold…
    let tuned = await pressOnStage(
      page,
      "copy-slip",
      "Copy Slip",
      "hold:1,showText:off",
    );
    let copy = tuned.getByRole("button", { name: /Payment link$/ });
    await expect(tuned.getByText(link, { exact: true })).toHaveCount(1);
    // The word is read from the button's own label part, so the whole cycle
    // (a ~0.5 s flight, then the hold) is timed from just before the press.
    let log = await pressLog(copy, "span[id]");
    let pressed = await pressNow(page);
    await pressTap(page, copy);
    await expect(copy).toHaveAccessibleName("Copied Payment link");
    await expect(copy).toHaveAccessibleName("Copy Payment link");
    const short = pressTook(await log(), "Copy", pressed);
    expect(short).toBeGreaterThan(1300);
    expect(short).toBeLessThan(2400);

    // …then the text on the slip, and a 3 s hold.
    tuned = await pressOnStage(page, "copy-slip", "Copy Slip", "hold:3");
    copy = tuned.getByRole("button", { name: /Payment link$/ });
    await expect(tuned.getByText(link, { exact: true })).toHaveCount(2);
    log = await pressLog(copy, "span[id]");
    pressed = await pressNow(page);
    await pressTap(page, copy);
    await expect(copy).toHaveAccessibleName("Copied Payment link");
    await expect(copy).toHaveAccessibleName("Copy Payment link");
    const long = pressTook(await log(), "Copy", pressed);
    expect(long).toBeGreaterThan(3300);
    expect(long).toBeLessThan(4600);
  });
});

type HoverPoint = { x: number; y: number };

/**
 * Puts an element in the middle of the viewport, so the pointer can reach it
 * and whatever opens around it. The pointer is parked in the corner first, so
 * the scroll's own hover update lands on nothing, and two frames pass so a
 * touch is hit-tested against the scrolled page.
 */
const hoverCentre = async (page: Page, target: Locator) => {
  await page.mouse.move(1, 1);
  await target.evaluate(
    (el) =>
      new Promise<void>((done) => {
        el.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "instant",
        });
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
};

const hoverBox = async (target: Locator) => {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing there to point at");
  return box;
};

const hoverMidX = async (target: Locator) => {
  const box = await hoverBox(target);
  return box.x + box.width / 2;
};

const hoverMidY = async (target: Locator) => {
  const box = await hoverBox(target);
  return box.y + box.height / 2;
};

/**
 * Polls a geometric reading until the motion behind it settles within `tol`
 * px of `want`. A miss reports the reading itself.
 */
const hoverAbout = (read: () => Promise<number>, want: number, tol = 1) =>
  expect
    .poll(async () => {
      const got = await read();
      return Math.abs(got - want) <= tol ? want : Math.round(got * 100) / 100;
    })
    .toBe(want);

/**
 * A pointer press on wherever the target is now — in, down, a waver under any
 * drag threshold, up — without scrolling, for targets inside clipped, moving
 * surfaces.
 */
const hoverPress = async (page: Page, target: Locator) => {
  const box = await hoverBox(target);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(x + 1, y + 1, { steps: 2 });
  await page.mouse.up();
};

/** Polls a reading until two in a row agree, and returns it. */
const hoverStill = async (read: () => Promise<number>) => {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = await read();
        const still = Math.abs(now - last) < 0.05;
        last = now;
        return still;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return last;
};

/** Lets `ms` pass on the page's own clock: for what must not happen within a window. */
const hoverFor = async (page: Page, ms: number) => {
  const from = await pressNow(page);
  await expect
    .poll(() => pressNow(page), { intervals: [50] })
    .toBeGreaterThan(from + ms);
};

/** When a text first showed in a log, on the page's clock. */
const hoverAt = (log: PressLog, text: string) => pressTook(log, text, 0);

/**
 * A finger on the glass: down at `from`, several moves, then — after `held`,
 * if given, runs with the finger still down — up at `to`.
 */
const hoverSwipe = async (
  page: Page,
  from: HoverPoint,
  to: HoverPoint,
  steps = 10,
  held?: () => Promise<void>,
) => {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    at?: HoverPoint,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: at ? [{ x: at.x, y: at.y }] : [],
    });
  await touch("touchStart", from);
  for (let k = 1; k <= steps; k += 1) {
    await touch("touchMove", {
      x: from.x + ((to.x - from.x) * k) / steps,
      y: from.y + ((to.y - from.y) * k) / steps,
    });
  }
  await held?.();
  await touch("touchEnd");
  await cdp.detach();
};

/** Edge Peek's lean: 6px of sliver, plus `lean` × smoothstep(1 − distance / reach). */
const hoverLean = (distance: number, reach = 160, lean = 24) => {
  const t = Math.min(1, Math.max(0, 1 - distance / reach));
  return 6 + lean * t * t * (3 - 2 * t);
};

/**
 * How far an edge handle's visible face stands out past a surface's inner
 * edge, in px. The face is what slides out; the button around it (the hit
 * box) stays inside the surface until the lean passes its width.
 */
const hoverOut = async (
  handle: Locator,
  edge: number,
  side: "left" | "right" = "right",
) => {
  const box = await hoverBox(handle.locator(":scope > span").first());
  return side === "right" ? edge - box.x : box.x + box.width - edge;
};

/** The eyedropper's reading: the last part of the picture's description. */
const hoverReading = (picture: Locator) =>
  picture.evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/);
    return (
      document.getElementById(ids[ids.length - 1] ?? "")?.textContent ?? ""
    );
  });

const hoverEscape = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("tactile hover", () => {
  test("underline-peek: a resting pointer and keyboard focus each drop the link's own preview after the delay, it follows the pointer and folds on leave or Escape, and Enter follows the link", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/underline-peek");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const article = stage.getByRole("article", {
      name: "Waylight Pay help: payouts",
    });
    const cut = stage.getByRole("link", { name: "cut-off time" });
    const recon = stage.getByRole("link", { name: "reconciliation" });
    const shown = stage.getByRole("tooltip");
    const cutCard = stage.getByRole("tooltip", { name: /^Cut-off times/ });
    const reconCard = stage.getByRole("tooltip", { name: /^Reconciliation/ });

    // At rest nothing is shown, yet each link is described by its preview.
    await expect(line).toHaveText("hover or focus a link");
    await expect(shown).toHaveCount(0);
    await expect(cut).toHaveAccessibleDescription(
      /The last minute a sale can join tonight’s payout\./,
    );
    await expect(recon).toHaveAccessibleDescription(
      /How each payout is matched to the card sales behind it\./,
    );

    // Pointer: it comes in from above and stops just short of the word…
    await hoverCentre(page, article);
    const a = await hoverBox(cut);
    const log = await pressLog(line);
    await page.mouse.move(a.x - 40, a.y - 60);
    await page.mouse.move(a.x + a.width / 2, a.y - 8, { steps: 6 });
    const arrived = await pressNow(page);
    // …then rests on it, and the sheet drops only after the 300 ms delay.
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, {
      steps: 3,
    });
    await expect(line).toHaveText("preview · cut-off time · open");
    await expect(shown).toHaveCount(1);
    await expect(cutCard).toBeVisible();
    const waited = pressTook(
      await log(),
      "preview · cut-off time · open",
      arrived,
    );
    expect(waited).toBeGreaterThan(300);
    expect(waited).toBeLessThan(900);

    // The pointer crosses the tab into the card; past the 140 ms grace it is
    // still open, and leaving both folds it back into the line.
    const k = await hoverBox(cutCard);
    await page.mouse.move(a.x + a.width / 2, k.y + k.height / 2, {
      steps: 6,
    });
    await hoverFor(page, 400);
    await expect(line).toHaveText("preview · cut-off time · open");
    await expect(cutCard).toBeVisible();
    await page.mouse.move(k.x + k.width + 120, k.y + k.height + 60, {
      steps: 6,
    });
    await expect(line).toHaveText("hover or focus a link");
    await expect(shown).toHaveCount(0);

    // Open, the card slides along under the pointer: centred on it at the
    // far end of the word, and as far as the article lets it at the near end.
    const art = await hoverBox(article);
    const r = await hoverBox(recon);
    const far = r.x + r.width - 4;
    await page.mouse.move(far, r.y + r.height / 2, { steps: 8 });
    await expect(line).toHaveText("preview · reconciliation · open");
    await expect(reconCard).toBeVisible();
    await hoverAbout(() => hoverMidX(reconCard), far);
    await page.mouse.move(r.x + 4, r.y + r.height / 2, { steps: 8 });
    await hoverAbout(async () => (await hoverBox(reconCard)).x, art.x + 1);
    // Its tab stays with the word, so the card still covers it.
    const card = await hoverBox(reconCard);
    expect(card.x).toBeLessThanOrEqual(r.x);
    expect(card.x + card.width).toBeGreaterThanOrEqual(r.x + r.width);
    await page.mouse.move(r.x + r.width / 2, r.y - 60, { steps: 6 });
    await expect(line).toHaveText("hover or focus a link");

    // Keyboard: focus opens the same card after the same delay…
    await cut.focus();
    await expect(line).toHaveText("preview · cut-off time · open");
    await expect(cutCard).toBeVisible();
    // …Escape folds it, and it stays folded while focus stays…
    await page.keyboard.press("Escape");
    await expect(line).toHaveText("hover or focus a link");
    await expect(shown).toHaveCount(0);
    await expect(cut).toBeFocused();
    await hoverFor(page, 600);
    await expect(shown).toHaveCount(0);
    // …Tab takes it to the next link, and coming back opens this one again.
    await page.keyboard.press("Tab");
    await expect(recon).toBeFocused();
    await expect(line).toHaveText("preview · reconciliation · open");
    await expect(reconCard).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(cut).toBeFocused();
    await expect(line).toHaveText("preview · cut-off time · open");
    await expect(cutCard).toBeVisible();
    await expect(shown).toHaveCount(1);
    // Enter follows the link (the demo keeps it on the page).
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(line).toHaveText(
      "followed · cut-off time · kept on this page",
    );
    expect(await audioContexts(page)).toBe(0);

    // With sound on, the unfurl is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await hoverCentre(page, article);
    const again = await hoverBox(recon);
    await page.mouse.move(again.x + again.width / 2, again.y - 40);
    await page.mouse.move(
      again.x + again.width / 2,
      again.y + again.height / 2,
      { steps: 6 },
    );
    await expect(line).toHaveText("preview · reconciliation · open");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: no delay and a 360px card…
    let tuned = await pressOnStage(
      page,
      "underline-peek",
      "Underline Peek",
      "delay:0,width:360",
    );
    let link = tuned.getByRole("link", { name: "reconciliation" });
    let tip = tuned.getByRole("tooltip", { name: /^Reconciliation/ });
    let tunedLine = tuned.getByRole("status").last();
    let box = await hoverBox(link);
    let tunedLog = await pressLog(tunedLine);
    await page.mouse.move(box.x + box.width / 2, box.y - 40);
    await page.mouse.move(box.x + box.width / 2, box.y - 8, { steps: 6 });
    let at = await pressNow(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 3,
    });
    await expect(tunedLine).toHaveText("preview · reconciliation · open");
    expect(
      pressTook(await tunedLog(), "preview · reconciliation · open", at),
    ).toBeLessThan(200);
    await hoverAbout(async () => (await hoverBox(tip)).width, 360);
    // Escape folds it and nothing else: the stage stays for the next Escape.
    await page.keyboard.press("Escape");
    await expect(tunedLine).toHaveText("hover or focus a link");
    const dialog = dialogOf(page, "Underline Peek");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // …then a deliberate 800 ms, and a card that stays centred under the word.
    tuned = await pressOnStage(
      page,
      "underline-peek",
      "Underline Peek",
      "follow:off,delay:800",
    );
    link = tuned.getByRole("link", { name: "reconciliation" });
    tip = tuned.getByRole("tooltip", { name: /^Reconciliation/ });
    tunedLine = tuned.getByRole("status").last();
    box = await hoverBox(link);
    const end = box.x + box.width - 4;
    const middle = box.x + box.width / 2;
    tunedLog = await pressLog(tunedLine);
    await page.mouse.move(end, box.y - 40);
    await page.mouse.move(end, box.y - 8, { steps: 6 });
    at = await pressNow(page);
    await page.mouse.move(end, box.y + box.height / 2, { steps: 3 });
    await expect(tunedLine).toHaveText("preview · reconciliation · open");
    const slow = pressTook(
      await tunedLog(),
      "preview · reconciliation · open",
      at,
    );
    expect(slow).toBeGreaterThan(800);
    expect(slow).toBeLessThan(1400);
    await hoverAbout(() => hoverMidX(tip), middle);
    await page.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 8 });
    await hoverFor(page, 600);
    await hoverAbout(() => hoverMidX(tip), middle);
  });

  test("edge-peek: the handle leans out as the pointer nears the edge, a press or a drag opens the panel and the tint closes it, and focus, Enter, Space and Escape do the same from the keyboard", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/edge-peek");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const handle = stage.getByRole("button", { name: "Layers" });
    const surface = handle.locator("xpath=..");
    const panel = stage.getByRole("region", { name: "Layers" });

    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(handle).toHaveAttribute(
      "aria-controls",
      (await panel.getAttribute("id")) ?? "",
    );
    await expect(line).toHaveText("layers tucked · 3 of 3 shown");

    await hoverCentre(page, surface);
    const s = await hoverBox(surface);
    // The pointer's distance is from the surface's outer edge; the handle
    // and panel sit inside its 1px frame.
    const edge = s.x + s.width;
    const inner = edge - 1;
    const mid = s.y + s.height / 2;
    const out = () => hoverOut(handle, inner);
    // Tucked, a 6px sliver shows.
    await hoverAbout(out, 6, 0.5);

    // Pointer: it comes in from the far side. Half the reach away, the
    // lean is half; at the edge, it is all the way out and the panel peeks.
    await page.mouse.move(s.x - 40, mid);
    await page.mouse.move(edge - 200, mid, { steps: 6 });
    await hoverAbout(out, 6);
    await page.mouse.move(edge - 80, mid, { steps: 6 });
    await hoverAbout(out, hoverLean(80));
    await page.mouse.move(edge - 4, mid, { steps: 6 });
    await hoverAbout(out, hoverLean(4));
    await hoverAbout(
      async () => inner - (await hoverBox(panel)).x,
      hoverLean(4) - 20,
    );
    // Leaving the surface lets it settle back.
    await page.mouse.move(s.x - 40, mid, { steps: 8 });
    await hoverAbout(out, 6);
    await expect(handle).toHaveAttribute("aria-expanded", "false");

    // A press on the leaning handle slides the panel fully open; the handle
    // rides its outer edge, 220 + 20 px from the surface's edge.
    await page.mouse.move(edge - 20, mid, { steps: 8 });
    await hoverAbout(out, hoverLean(20));
    let grip = await hoverBox(handle);
    await page.mouse.move(grip.x + grip.width / 2, mid, { steps: 2 });
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 1, mid + 1, { steps: 2 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(line).toHaveText("layers open · 3 of 3 shown");
    await hoverAbout(out, 240);
    await hoverAbout(async () => (await hoverBox(panel)).x, inner - 220);
    await hoverPress(page, panel.getByRole("checkbox", { name: "Water" }));
    await expect(line).toHaveText("layers open · 2 of 3 shown");
    // A press on the tint over the map closes it.
    await page.mouse.move(s.x + 60, mid, { steps: 6 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(line).toHaveText("layers tucked · 2 of 3 shown");
    await hoverAbout(out, 6);

    // A drag: the panel follows the hand 1:1, and let go past halfway it opens.
    await page.mouse.move(edge - 20, mid, { steps: 8 });
    await hoverAbout(out, hoverLean(20));
    grip = await hoverBox(handle);
    const gx = grip.x + grip.width / 2;
    await page.mouse.move(gx, mid, { steps: 2 });
    const before = await hoverStill(out);
    await page.mouse.down();
    await page.mouse.move(gx - 120, mid, { steps: 30 });
    await hoverAbout(out, before + 120, 1.5);
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(line).toHaveText("layers open · 2 of 3 shown");
    await hoverAbout(out, 240);
    // Dragged back past halfway, it tucks away again.
    grip = await hoverBox(handle);
    const ox = grip.x + grip.width / 2;
    await page.mouse.move(ox, mid, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(ox + 160, mid, { steps: 40 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(line).toHaveText("layers tucked · 2 of 3 shown");
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh map: focus leans it out as a near pointer does…
    await gotoHydrated(page, "/components/edge-peek");
    await hoverCentre(page, surface);
    const f = await hoverBox(surface);
    const keyOut = () => hoverOut(handle, f.x + f.width - 1);
    await handle.focus();
    await hoverAbout(keyOut, 30);
    // …Enter opens it where the press did…
    await page.keyboard.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(line).toHaveText("layers open · 3 of 3 shown");
    await hoverAbout(keyOut, 240);
    // …Tab goes on into the panel, and its checkboxes work…
    await page.keyboard.press("Tab");
    const trails = panel.getByRole("checkbox", { name: "Trails" });
    await expect(trails).toBeFocused();
    await page.keyboard.press("Space");
    await expect(trails).not.toBeChecked();
    await expect(line).toHaveText("layers open · 2 of 3 shown");
    // …and Escape from inside closes it and hands focus back to the handle,
    // which, still keyboard-focused, leans back out.
    await page.keyboard.press("Escape");
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(line).toHaveText("layers tucked · 2 of 3 shown");
    await hoverAbout(keyOut, 30);
    // Space opens it too, and Escape on the handle closes it: leaned out.
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(line).toHaveText("layers open · 2 of 3 shown");
    await hoverAbout(keyOut, 240);
    await page.keyboard.press("Escape");
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(handle).toBeFocused();
    await hoverAbout(keyOut, 30);
    // Enter opens it and Enter closes it: leaned out again.
    await page.keyboard.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await hoverAbout(keyOut, 240);
    await page.keyboard.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(line).toHaveText("layers tucked · 2 of 3 shown");
    await hoverAbout(keyOut, 30);
    // Tucked, the panel is out of the tab order: Tab passes it by, and the
    // handle, no longer focused, settles back.
    await page.keyboard.press("Tab");
    await expect(handle).not.toBeFocused();
    await expect(trails).not.toBeFocused();
    await hoverAbout(keyOut, 6);
    expect(await audioContexts(page)).toBe(0);

    // With sound on, the opening is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await handle.focus();
    await page.keyboard.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: the left edge and a 48px lean…
    let tuned = await pressOnStage(
      page,
      "edge-peek",
      "Edge Peek",
      "side:left,lean:48",
    );
    let pill = tuned.getByRole("button", { name: "Layers" });
    let frame = await hoverBox(pill.locator("xpath=.."));
    const left = frame.x + 1;
    const leftOut = () => hoverOut(pill, left, "left");
    const fy = frame.y + frame.height / 2;
    await hoverAbout(leftOut, 6, 0.5);
    await page.mouse.move(frame.x + frame.width + 40, fy);
    await page.mouse.move(frame.x + 4, fy, { steps: 10 });
    await hoverAbout(leftOut, hoverLean(4, 160, 48));
    grip = await hoverBox(pill);
    await page.mouse.move(grip.x + grip.width / 2, fy, { steps: 4 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    const leftPanel = tuned.getByRole("region", { name: "Layers" });
    await hoverAbout(async () => (await hoverBox(leftPanel)).x, left);
    await hoverAbout(leftOut, 240);

    // …and a reach of 80: 40px away is half the lean, where the default
    // reach would already lean three quarters of the way.
    tuned = await pressOnStage(page, "edge-peek", "Edge Peek", "reach:80");
    pill = tuned.getByRole("button", { name: "Layers" });
    frame = await hoverBox(pill.locator("xpath=.."));
    const right = frame.x + frame.width;
    await page.mouse.move(frame.x - 40, frame.y + frame.height / 2);
    await page.mouse.move(right - 40, frame.y + frame.height / 2, {
      steps: 10,
    });
    await hoverAbout(() => hoverOut(pill, right - 1), hoverLean(40, 80));
  });

  test("cross-grid: pointing at a cell and moving focus to it both light its row and column and bring its labels beside it, and the arrows, Home/End and the page keys walk the grid", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/cross-grid");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const grid = stage.getByRole("grid", {
      name: "Fernworks parcels shipped by depot and weekday",
    });
    const cell = (depot: string, day: number) =>
      grid
        .getByRole("row")
        .filter({
          has: page.getByRole("rowheader", { name: depot, exact: true }),
        })
        .getByRole("gridcell")
        .nth(day);
    const labels = grid.locator("xpath=..").locator(":scope > [aria-hidden]");
    const chip = (text: string) =>
      labels
        .locator(":scope > div")
        .filter({ hasText: new RegExp(`^${text}$`) });
    const idle = "point at a cell or use the arrow keys";

    await expect(line).toHaveText(idle);
    await expect(grid.getByRole("columnheader", { name: "Wed" })).toHaveCount(
      1,
    );
    await expect(grid.getByRole("gridcell")).toHaveCount(25);
    // One tab stop in the body.
    await expect(grid.locator("[role='gridcell'][tabindex='0']")).toHaveCount(
      1,
    );

    // Pointer: onto the table at Coldbrook, Mon, then across to Gauge Row, Wed.
    await hoverCentre(page, grid);
    const home = await hoverBox(cell("Coldbrook", 0));
    const target = await hoverBox(cell("Gauge Row", 2));
    // Cosy rows are 36px.
    expect(target.height).toBeCloseTo(36, 0);
    await page.mouse.move(home.x - 60, home.y - 60);
    await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2, {
      steps: 4,
    });
    await expect(line).toHaveText("Coldbrook · Mon · 412 parcels");
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 10 },
    );
    await expect(line).toHaveText("Gauge Row · Wed · 412 parcels");
    // The labels travel to sit beside it: the day just above, the depot
    // just left.
    const wed = chip("Wed");
    const gauge = chip("Gauge Row");
    const band = labels.first().locator(":scope > div").first();
    // Both paths move on within the 150 ms fade-in, and the crosshair and the
    // labels still come fully up.
    const labelsLand = async () => {
      await expect.poll(() => pressOpacity(band)).toBe(1);
      await expect.poll(() => pressOpacity(wed.locator("xpath=.."))).toBe(1);
      await expect.poll(() => pressOpacity(gauge.locator("xpath=.."))).toBe(1);
      await hoverAbout(() => hoverMidX(wed), target.x + target.width / 2);
      await hoverAbout(
        async () => {
          const b = await hoverBox(wed);
          return b.y + b.height;
        },
        target.y - 3,
        1.5,
      );
      await hoverAbout(
        async () => {
          const b = await hoverBox(gauge);
          return b.x + b.width;
        },
        target.x - 3,
        1.5,
      );
      await hoverAbout(
        () => hoverMidY(gauge),
        target.y + target.height / 2,
        1.5,
      );
    };
    await labelsLand();
    // Leaving the table puts the crosshair away.
    const table = await hoverBox(grid);
    await page.mouse.move(table.x - 60, target.y + target.height / 2, {
      steps: 6,
    });
    await expect(line).toHaveText(idle);

    // Keyboard: from the tab stop, the arrows land on the same cell, and the
    // labels land in the same places.
    await cell("Coldbrook", 0).focus();
    await expect(line).toHaveText("Coldbrook · Mon · 412 parcels");
    for (const key of [
      "ArrowDown",
      "ArrowDown",
      "ArrowDown",
      "ArrowRight",
      "ArrowRight",
    ]) {
      await page.keyboard.press(key);
    }
    await expect(cell("Gauge Row", 2)).toBeFocused();
    await expect(line).toHaveText("Gauge Row · Wed · 412 parcels");
    await labelsLand();
    // The tab stop roves with focus.
    await expect(cell("Gauge Row", 2)).toHaveAttribute("tabindex", "0");
    await expect(grid.locator("[role='gridcell'][tabindex='0']")).toHaveCount(
      1,
    );
    for (const [key, [depot, day], said] of [
      ["End", ["Gauge Row", 4], "Gauge Row · Fri · 451 parcels"],
      ["Home", ["Gauge Row", 0], "Gauge Row · Mon · 367 parcels"],
      ["PageUp", ["Coldbrook", 0], "Coldbrook · Mon · 412 parcels"],
      ["PageDown", ["Waylight", 0], "Waylight · Mon · 523 parcels"],
      ["Control+End", ["Waylight", 4], "Waylight · Fri · 604 parcels"],
      ["ArrowUp", ["Gauge Row", 4], "Gauge Row · Fri · 451 parcels"],
      ["Control+Home", ["Coldbrook", 0], "Coldbrook · Mon · 412 parcels"],
    ] as const) {
      await page.keyboard.press(key);
      await expect(cell(depot, day)).toBeFocused();
      await expect(line).toHaveText(said);
    }
    // A pointer over another cell borrows the crosshair; leaving gives it
    // back to the focused cell.
    const fri = await hoverBox(cell("Waylight", 4));
    await page.mouse.move(fri.x + fri.width / 2, fri.y + fri.height / 2, {
      steps: 8,
    });
    await expect(line).toHaveText("Waylight · Fri · 604 parcels");
    await page.mouse.move(fri.x + fri.width + 80, fri.y + fri.height / 2, {
      steps: 4,
    });
    await expect(line).toHaveText("Coldbrook · Mon · 412 parcels");
    // Focus leaving the grid clears it.
    await page.keyboard.press("Tab");
    await expect(cell("Coldbrook", 0)).not.toBeFocused();
    await expect(line).toHaveText(idle);
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a move is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await cell("Coldbrook", 0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(line).toHaveText("Coldbrook · Tue · 388 parcels");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: compact 28px rows, and labels that stay home.
    const tuned = await pressOnStage(
      page,
      "cross-grid",
      "Cross Grid",
      "density:compact,followLabels:off",
    );
    const tunedGrid = tuned.getByRole("grid", {
      name: "Fernworks parcels shipped by depot and weekday",
    });
    const tunedCell = tunedGrid
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: "Gauge Row", exact: true }),
      })
      .getByRole("gridcell")
      .nth(2);
    const tb = await hoverBox(tunedCell);
    expect(tb.height).toBeCloseTo(28, 0);
    await page.mouse.move(tb.x - 80, tb.y - 80);
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
      steps: 8,
    });
    await expect(tuned.getByRole("status").last()).toHaveText(
      "Gauge Row · Wed · 412 parcels",
    );
    const tunedWed = tunedGrid
      .locator("xpath=..")
      .locator(":scope > [aria-hidden] > div")
      .filter({ hasText: /^Wed$/ });
    await hoverFor(page, 300);
    expect(await pressOpacity(tunedWed.locator("xpath=.."))).toBe(0);
  });

  test("overflow-glide: pointing at a cut name or tabbing to its row glides it to its end at reading pace, holds, and eases home, and leaving mid-read turns it home at once", async ({
    page,
  }) => {
    const NAME =
      "Coldbrook weir survey — spring flow at the upper and lower gauges, final.pdf";
    const idle = "7 files · point at a name to read the rest";
    await countAudio(page);
    await gotoHydrated(page, "/components/overflow-glide");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const row = stage.getByRole("button", { name: /^Coldbrook weir survey/ });
    const third = stage.getByRole("button", { name: /^Basin sediment cores/ });
    const fits = stage.getByRole("button", { name: /^Site map\.png/ });
    const text = row.getByText(NAME, { exact: true });
    const view = text.locator("xpath=..");

    // The row's name is the whole file name; the ellipsis is not read.
    await expect(row).toHaveAccessibleName(
      new RegExp(`^${hoverEscape(NAME)}\\s?PDF · 2\\.4 MB · Sep 12$`),
    );
    await expect(line).toHaveText(idle);

    await hoverCentre(page, stage.getByRole("list"));
    const w = await hoverBox(view);
    const t = await hoverBox(text);
    // Cut: the name runs well past its window.
    expect(t.width).toBeGreaterThan(w.width + 40);
    await hoverAbout(async () => (await hoverBox(text)).x, w.x, 0.5);
    // A word is five characters: at `speed` words a second, the overflow
    // takes this long to pass.
    const chars = Array.from(NAME).length;
    const readFor = (speed: number) =>
      ((t.width - w.width) / (speed * 5 * (t.width / chars))) * 1000;

    // Pointer: onto the row.
    const log = await pressLog(line);
    const rb = await hoverBox(row);
    await page.mouse.move(rb.x - 40, rb.y + rb.height / 2);
    await page.mouse.move(rb.x + 40, rb.y + rb.height / 2, { steps: 6 });
    await expect(line).toHaveText("reading file 1 of 7 · 3 words a second");
    await expect(line).toHaveText("end of the name · file 1 of 7");
    // Held at the end, the last character sits on the window's right edge.
    await hoverAbout(async () => {
      const b = await hoverBox(text);
      return b.x + b.width;
    }, w.x + w.width);
    await expect(line).toHaveText("easing home · file 1 of 7");
    await expect(line).toHaveText(idle);
    await hoverAbout(async () => (await hoverBox(text)).x, w.x, 0.5);
    // Three words a second, then the 0.8 s hold.
    let entries = await log();
    const read =
      hoverAt(entries, "end of the name · file 1 of 7") -
      hoverAt(entries, "reading file 1 of 7 · 3 words a second");
    expect(read).toBeGreaterThan(readFor(3) * 0.9);
    expect(read).toBeLessThan(readFor(3) * 1.2 + 150);
    const held =
      hoverAt(entries, "easing home · file 1 of 7") -
      hoverAt(entries, "end of the name · file 1 of 7");
    expect(held).toBeGreaterThan(780);
    expect(held).toBeLessThan(1200);
    // Still pointed at, it reads once per visit.
    await hoverFor(page, 1200);
    await expect(line).toHaveText(idle);

    // Leaving mid-read turns it home at once, before it reaches the end.
    const b3 = await hoverBox(third);
    await page.mouse.move(b3.x + 40, b3.y + b3.height / 2, { steps: 8 });
    await expect(line).toHaveText("reading file 3 of 7 · 3 words a second");
    await page.mouse.move(b3.x - 60, b3.y + b3.height / 2, { steps: 4 });
    await expect(line).toHaveText("easing home · file 3 of 7");
    await expect(line).toHaveText(idle);
    entries = await log();
    expect(
      entries.some(([said]) => said === "end of the name · file 3 of 7"),
    ).toBe(false);
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh folder: Tab's focus reads the same name to the
    // same end.
    await gotoHydrated(page, "/components/overflow-glide");
    await hoverCentre(page, stage.getByRole("list"));
    const kw = await hoverBox(view);
    const keyLog = await pressLog(line);
    await row.focus();
    await expect(line).toHaveText("reading file 1 of 7 · 3 words a second");
    await expect(line).toHaveText("end of the name · file 1 of 7");
    await hoverAbout(async () => {
      const b = await hoverBox(text);
      return b.x + b.width;
    }, kw.x + kw.width);
    await expect(line).toHaveText("easing home · file 1 of 7");
    await expect(line).toHaveText(idle);
    // Enter acts on the row at once.
    await page.keyboard.press("Enter");
    await expect(line).toHaveText("opened file 1 of 7");
    // A name that fits does not move; the next cut one reads, and Shift+Tab
    // away mid-read sends it home before the end.
    await page.keyboard.press("Tab");
    await expect(fits).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(third).toBeFocused();
    await expect(line).toHaveText("reading file 3 of 7 · 3 words a second");
    await page.keyboard.press("Shift+Tab");
    await expect(fits).toBeFocused();
    await expect(line).toHaveText("easing home · file 3 of 7");
    await expect(line).toHaveText(idle);
    const keyed = await keyLog();
    expect(
      keyed.some(([said]) => said === "end of the name · file 3 of 7"),
    ).toBe(false);
    // Nothing read while the fitting name had focus.
    expect(keyed.some(([said]) => said.startsWith("reading file 2"))).toBe(
      false,
    );
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a glide is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await hoverCentre(page, stage.getByRole("list"));
    const sb = await hoverBox(row);
    await page.mouse.move(sb.x - 40, sb.y + sb.height / 2);
    await page.mouse.move(sb.x + 40, sb.y + sb.height / 2, { steps: 6 });
    await expect(line).toHaveText("reading file 1 of 7 · 3 words a second");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: six words a second, no pause, and a loop.
    const tuned = await pressOnStage(
      page,
      "overflow-glide",
      "Overflow Glide",
      "speed:6,pause:0,loop:on",
    );
    const tunedLine = tuned.getByRole("status").last();
    const tunedRow = tuned.getByRole("button", {
      name: /^Coldbrook weir survey/,
    });
    const tunedLog = await pressLog(tunedLine);
    const tr = await hoverBox(tunedRow);
    await page.mouse.move(tr.x - 40, tr.y + tr.height / 2);
    await page.mouse.move(tr.x + 40, tr.y + tr.height / 2, { steps: 6 });
    await expect(tunedLine).toHaveText(
      "reading file 1 of 7 · 6 words a second",
    );
    // Still pointed at, it reads again.
    await expect
      .poll(
        async () =>
          (await tunedLog()).filter(
            ([said]) => said === "reading file 1 of 7 · 6 words a second",
          ).length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(2);
    // Half the time to read, and no hold: it turns home the moment it
    // arrives (so fast that the demo's line may skip "end of the name").
    const tunedEntries = await tunedLog();
    const fast =
      hoverAt(tunedEntries, "easing home · file 1 of 7") -
      hoverAt(tunedEntries, "reading file 1 of 7 · 6 words a second");
    expect(fast).toBeGreaterThan(readFor(6) * 0.9);
    expect(fast).toBeLessThan(readFor(6) * 1.2 + 150);
  });

  test("try-on: pointing at a swatch tries it on and moving off takes it back, a click, Enter or Space keeps it, and the arrows try each in turn while Escape puts the kept look back", async ({
    page,
  }) => {
    await countAudio(page);
    await gotoHydrated(page, "/components/try-on");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const list = stage.getByRole("listbox", { name: "Accent" });
    const swatch = (name: string) =>
      list.getByRole("option", { name, exact: true });

    await expect(list).toHaveAttribute("aria-orientation", "horizontal");
    await expect(list.getByRole("option")).toHaveCount(5);
    await expect(swatch("Cobalt")).toHaveAttribute("aria-selected", "true");
    await expect(swatch("Moss")).toHaveAttribute("aria-selected", "false");
    await expect(line).toHaveText(
      "accent cobalt · point at a swatch to try it",
    );

    // Pointer: onto Moss from below the row.
    await hoverCentre(page, list.locator("xpath=../.."));
    const moss = await hoverBox(swatch("Moss"));
    const amber = await hoverBox(swatch("Amber"));
    await page.mouse.move(moss.x + moss.width / 2, moss.y + 60);
    await page.mouse.move(moss.x + moss.width / 2, moss.y + moss.height / 2, {
      steps: 6,
    });
    await expect(line).toHaveText("trying moss · click to keep");
    await expect(stage.getByText("Trying Moss", { exact: true })).toBeVisible();
    await expect(swatch("Moss")).toHaveAttribute("aria-selected", "false");
    // Hopping to the next swatch tries that one instead.
    await page.mouse.move(
      amber.x + amber.width / 2,
      amber.y + amber.height / 2,
      { steps: 6 },
    );
    await expect(line).toHaveText("trying amber · click to keep");
    await expect(
      stage.getByText("Trying Amber", { exact: true }),
    ).toBeVisible();
    // Off the row, the kept look comes back.
    await page.mouse.move(amber.x + amber.width / 2, amber.y + 60, {
      steps: 6,
    });
    await expect(line).toHaveText(
      "accent cobalt · point at a swatch to try it",
    );
    await expect(stage.getByText(/^Trying /)).toHaveCount(0);
    await expect(swatch("Cobalt")).toHaveAttribute("aria-selected", "true");
    // A click keeps it.
    await pressTap(page, swatch("Moss"));
    await expect(swatch("Moss")).toHaveAttribute("aria-selected", "true");
    await expect(swatch("Cobalt")).toHaveAttribute("aria-selected", "false");
    await expect(line).toHaveText("kept moss · the preview is the accent now");
    await expect(list.getByRole("option", { selected: true })).toHaveCount(1);
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh picker: the arrows try, Enter keeps the same one.
    await gotoHydrated(page, "/components/try-on");
    await swatch("Cobalt").focus();
    await expect(line).toHaveText(
      "accent cobalt · point at a swatch to try it",
    );
    await page.keyboard.press("ArrowRight");
    await expect(swatch("Moss")).toBeFocused();
    await expect(line).toHaveText("trying moss · enter to keep");
    for (const [key, name] of [
      ["ArrowRight", "Amber"],
      ["ArrowDown", "Ember"],
      ["ArrowRight", "Ink"],
      ["End", "Ember"],
      ["Home", "Ink"],
      ["ArrowLeft", "Ember"],
      ["ArrowUp", "Amber"],
    ] as const) {
      await page.keyboard.press(key);
      await expect(swatch(name)).toBeFocused();
      await expect(line).toHaveText(
        `trying ${name.toLowerCase()} · enter to keep`,
      );
      await expect(swatch(name)).toHaveAttribute("aria-selected", "false");
    }
    // Escape puts the kept look back and returns to the kept swatch.
    await page.keyboard.press("Escape");
    await expect(swatch("Cobalt")).toBeFocused();
    await expect(line).toHaveText(
      "accent cobalt · point at a swatch to try it",
    );
    await page.keyboard.press("ArrowRight");
    await expect(line).toHaveText("trying moss · enter to keep");
    await page.keyboard.press("Enter");
    await expect(swatch("Moss")).toHaveAttribute("aria-selected", "true");
    await expect(swatch("Cobalt")).toHaveAttribute("aria-selected", "false");
    await expect(line).toHaveText("kept moss · the preview is the accent now");
    // Space keeps too.
    await page.keyboard.press("ArrowRight");
    await expect(line).toHaveText("trying amber · enter to keep");
    await page.keyboard.press("Space");
    await expect(swatch("Amber")).toHaveAttribute("aria-selected", "true");
    await expect(line).toHaveText("kept amber · the preview is the accent now");
    // Focus leaving the list takes a tried look back, and the tab stop
    // returns to the kept swatch.
    await page.keyboard.press("ArrowLeft");
    await expect(line).toHaveText("trying moss · enter to keep");
    await page.keyboard.press("Tab");
    await expect(line).toHaveText("accent amber · point at a swatch to try it");
    await expect(list.locator("[tabindex='0']")).toHaveAccessibleName("Amber");
    await expect(list.locator("[tabindex='0']")).toHaveCount(1);
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a try is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await hoverCentre(page, list.locator("xpath=../.."));
    const ember = await hoverBox(swatch("Ember"));
    await page.mouse.move(ember.x + ember.width / 2, ember.y + 60);
    await page.mouse.move(
      ember.x + ember.width / 2,
      ember.y + ember.height / 2,
      { steps: 6 },
    );
    await expect(line).toHaveText("trying ember · click to keep");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: tried on a button at half pace, a look wipes in over 0.8 s and
    // is drawn back in 0.6 × that…
    const drawBack = async (tuned: Locator, sample: string) => {
      const tunedList = tuned.getByRole("listbox", { name: "Accent" });
      const mirror = tunedList.locator("xpath=../../*[1]");
      await expect(tuned.getByText(sample)).toHaveCount(1);
      const m = await hoverBox(
        tunedList.getByRole("option", { name: "Moss", exact: true }),
      );
      await page.mouse.move(m.x + m.width / 2, m.y + 60);
      await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2, {
        steps: 6,
      });
      await expect(tuned.getByRole("status").last()).toHaveText(
        "trying moss · click to keep",
      );
      // A second copy of the sample wipes over the first.
      await expect(tuned.getByText(sample)).toHaveCount(2);
      await hoverFor(page, 1000);
      const mirrorLog = await pressLog(mirror);
      const rest = (await mirrorLog())[0]?.[0] ?? "";
      const left = await pressNow(page);
      await page.mouse.move(m.x + m.width / 2, m.y + 60, { steps: 3 });
      await expect(tuned.getByText(sample)).toHaveCount(1);
      const trail = await mirrorLog();
      const after = trail[trail.length - 1]?.[0] ?? "";
      expect(rest.length).toBeGreaterThan(after.length);
      return pressTook(await mirrorLog(), after, left);
    };
    /**
     * Arrow from Moss (landed) to Amber: Amber wipes in over Moss, and the
     * moment it has covered the sample, Moss's copy is dropped. Returns how
     * long that took from the key.
     */
    const wipeIn = async (tuned: Locator, sample: string) => {
      const tunedList = tuned.getByRole("listbox", { name: "Accent" });
      const tunedLine = tuned.getByRole("status").last();
      const mirror = tunedList.locator("xpath=../../*[1]");
      const copies = (text: string) => text.split(sample).length - 1;
      await tunedList
        .getByRole("option", { name: "Cobalt", exact: true })
        .focus();
      await page.keyboard.press("ArrowRight");
      await expect(tunedLine).toHaveText("trying moss · enter to keep");
      await expect(tuned.getByText(sample)).toHaveCount(2);
      await hoverFor(page, 1000);
      const mirrorLog = await pressLog(mirror);
      const hop = await pressNow(page);
      await page.keyboard.press("ArrowRight");
      await expect(tunedLine).toHaveText("trying amber · enter to keep");
      const landed = async () => {
        const log = await mirrorLog();
        const over = log.find(([text, at]) => at >= hop && copies(text) === 3);
        const drop =
          over && log.find(([text, at]) => at > over[1] && copies(text) === 2);
        return drop ? drop[1] - hop : null;
      };
      await expect.poll(landed).not.toBeNull();
      return (await landed()) ?? Number.NaN;
    };
    let tuned = await pressOnStage(
      page,
      "try-on",
      "Try On",
      "sample:button,speed:0.5",
    );
    await expect(tuned.getByText("Fieldline Studio")).toHaveCount(0);
    const slow = await drawBack(tuned, "Invite teammates");
    expect(slow).toBeGreaterThan(400);
    expect(slow).toBeLessThan(900);
    const slowIn = await wipeIn(tuned, "Invite teammates");
    expect(slowIn).toBeGreaterThan(750);
    expect(slowIn).toBeLessThan(1300);
    // …and on a badge at double pace, 0.2 s in and 0.6 × that back.
    tuned = await pressOnStage(
      page,
      "try-on",
      "Try On",
      "sample:badge,speed:2",
    );
    const quick = await drawBack(tuned, "Pro plan");
    expect(quick).toBeLessThan(350);
    const quickIn = await wipeIn(tuned, "Pro plan");
    expect(quickIn).toBeGreaterThan(150);
    expect(quickIn).toBeLessThan(450);

    // Escape while trying is the picker's; with nothing tried, the stage's.
    await page.keyboard.press("Escape");
    await expect(tuned.getByRole("status").last()).toHaveText(
      "accent cobalt · point at a swatch to try it",
    );
    const dialog = dialogOf(page, "Try On");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("eyedropper: the loupe reads the pixel under the pointer and the arrow keys read the same pixel, a click or Enter drops it on the shelf, and a colour already there moves to the front", async ({
    page,
  }) => {
    await countAudio(page);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoHydrated(page, "/components/eyedropper");
    const stage = pressStage(page);
    const picture = stage.getByRole("button", {
      name: "Coldbrook at dusk, reference photo",
    });
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const shelf = stage.getByRole("list", { name: "Picked colours" });
    const picks = shelf.getByRole("button");
    const lens = stage.locator("canvas:not([aria-hidden])");
    const reading = () => hoverReading(picture);

    await expect(picture).toHaveAccessibleDescription(
      /^Arrow keys move the loupe one pixel, Shift moves ten\. Enter picks the colour\. #[0-9A-F]{6}$/,
    );
    await expect(line).toHaveText("0 of 6 picked · point at the photo");
    await expect(said).toHaveText("");
    await expect(picks).toHaveCount(0);
    // The loupe is 112px by default.
    await hoverAbout(async () => (await hoverBox(lens)).width, 112, 0.5);

    // Pointer: one CSS pixel of the picture is one of its pixels, inside a
    // 1px frame. The pointer comes in from below and rests on (150, 100).
    await hoverCentre(page, picture.locator("xpath=.."));
    const pic = await hoverBox(picture);
    const px = (i: number, j: number) => ({
      x: pic.x + 1 + i + 0.5,
      y: pic.y + 1 + j + 0.5,
    });
    const p1 = px(150, 100);
    await page.mouse.move(pic.x + 40, pic.y + pic.height + 60);
    await page.mouse.move(p1.x, p1.y, { steps: 10 });
    // The loupe follows it 1:1.
    await hoverAbout(() => hoverMidX(lens), p1.x, 0.5);
    await hoverAbout(() => hoverMidY(lens), p1.y, 0.5);
    const first = await reading();
    expect(first).toMatch(/^#[0-9A-F]{6}$/);
    // A click drops it on the shelf; the slot is live once the drop lands.
    await page.mouse.down();
    await page.mouse.up();
    await expect(
      shelf.getByRole("button", { name: `Copy ${first}` }),
    ).toBeEnabled();
    await expect(line).toHaveText(`1 of 6 picked · last ${first}`);
    await expect(said).toHaveText(
      new RegExp(`^Picked [a-z ]+, ${first}\\. 1 on the shelf\\.$`),
    );

    // Keyboard: one pixel right and back reads the very pixel the pointer did.
    await expect(picture).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(said).toHaveText(
      new RegExp(`^[a-z ]+, ${first}, at 150, 100\\.$`),
    );
    await expect(picture).toHaveAccessibleDescription(new RegExp(`${first}$`));
    // Enter picks it again: already in front, it is not added twice.
    await page.keyboard.press("Enter");
    await expect(said).toHaveText(
      new RegExp(`^Picked [a-z ]+, ${first}, again\\.$`),
    );
    await expect(picks).toHaveCount(1);
    // Shift moves ten: a new pixel, and Enter drops it in front.
    await page.keyboard.press("Shift+ArrowDown");
    await expect(said).toHaveText(/^[a-z ]+, #[0-9A-F]{6}, at 150, 110\.$/);
    const second = await reading();
    expect(second).not.toBe(first);
    await page.keyboard.press("Enter");
    await expect(
      shelf.getByRole("button", { name: `Copy ${second}` }),
    ).toBeEnabled();
    await expect(picks).toHaveCount(2);
    await expect(picks.first()).toHaveAccessibleName(`Copy ${second}`);
    await expect(line).toHaveText(`2 of 6 picked · last ${second}`);
    await expect(said).toHaveText(
      new RegExp(`^Picked [a-z ]+, ${second}\\. 2 on the shelf\\.$`),
    );

    // The pointer on that pixel reads what the keys did.
    const p2 = px(150, 110);
    await page.mouse.move(p2.x, p2.y, { steps: 4 });
    await expect.poll(reading).toBe(second);
    // Back on the first pixel, a click moves that colour to the front.
    await page.mouse.move(p1.x, p1.y, { steps: 4 });
    await expect.poll(reading).toBe(first);
    await page.mouse.down();
    await page.mouse.up();
    await expect(picks.first()).toHaveAccessibleName(`Copy ${first}`);
    await expect(picks).toHaveCount(2);
    await expect(line).toHaveText(`2 of 6 picked · last ${first}`);
    await expect(said).toHaveText(
      new RegExp(`^Picked [a-z ]+, ${first}\\. 2 on the shelf\\.$`),
    );

    // A swatch copies its value.
    await shelf.getByRole("button", { name: `Copy ${second}` }).click();
    await expect(said).toHaveText(`Copied ${second}.`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      second,
    );

    // The keys stop at the picture's edge, and never scroll the page.
    await picture.focus();
    const scrolled = await page.evaluate(() => window.scrollY);
    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect(said).toHaveText(/, at 0, 100\.$/);
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Shift+ArrowUp");
    }
    await expect(said).toHaveText(/, at 0, 0\.$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(await audioContexts(page)).toBe(0);

    // With sound on, a key's pip is heard.
    await page.getByRole("switch", { name: "Sound" }).click();
    expect(await audioContexts(page)).toBe(0);
    await picture.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: written as RGB, in a 160px loupe…
    let tuned = await pressOnStage(
      page,
      "eyedropper",
      "Eyedropper",
      "format:rgb,loupe:160",
    );
    let tunedPicture = tuned.getByRole("button", {
      name: "Coldbrook at dusk, reference photo",
    });
    await expect(tunedPicture).toHaveAccessibleDescription(
      /\. rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/,
    );
    await hoverAbout(
      async () =>
        (await hoverBox(tuned.locator("canvas:not([aria-hidden])"))).width,
      160,
      0.5,
    );
    const rgb = await hoverReading(tunedPicture);
    await tunedPicture.focus();
    await page.keyboard.press("Enter");
    await expect(tuned.getByRole("status").last()).toHaveText(
      `1 of 6 picked · last ${rgb}`,
    );
    await expect(
      tuned
        .getByRole("list", { name: "Picked colours" })
        .getByRole("button", { name: `Copy ${rgb}` }),
    ).toBeEnabled();
    // …then as HSL, in an 80px loupe.
    tuned = await pressOnStage(
      page,
      "eyedropper",
      "Eyedropper",
      "format:hsl,loupe:80",
    );
    tunedPicture = tuned.getByRole("button", {
      name: "Coldbrook at dusk, reference photo",
    });
    await expect(tunedPicture).toHaveAccessibleDescription(
      /\. hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\)$/,
    );
    await hoverAbout(
      async () =>
        (await hoverBox(tuned.locator("canvas:not([aria-hidden])"))).width,
      80,
      0.5,
    );
  });

  test.describe("on touch", () => {
    test.use({ hasTouch: true });

    test("underline-peek: on touch, the first tap shows the preview, the second follows the link, and a tap outside folds it", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/underline-peek");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const article = stage.getByRole("article", {
        name: "Waylight Pay help: payouts",
      });
      const cut = stage.getByRole("link", { name: "cut-off time" });
      const card = stage.getByRole("tooltip", { name: /^Cut-off times/ });
      await hoverCentre(page, article);
      const art = await hoverBox(article);
      const outside = {
        x: art.x + art.width - 20,
        y: art.y + art.height - 6,
      };

      // The first tap shows the preview instead of following the link…
      await cut.tap();
      await expect(line).toHaveText("preview · cut-off time · open");
      await expect(card).toBeVisible();
      // …and a tap outside folds it, with nothing followed.
      await page.touchscreen.tap(outside.x, outside.y);
      await expect(line).toHaveText("hover or focus a link");
      await expect(card).toHaveCount(0);
      // Tap, then tap again: the second is the link.
      await cut.tap();
      await expect(line).toHaveText("preview · cut-off time · open");
      await cut.tap();
      await page.touchscreen.tap(outside.x, outside.y);
      await expect(line).toHaveText(
        "followed · cut-off time · kept on this page",
      );
      expect(await audioContexts(page)).toBe(0);
    });

    test("edge-peek: on touch, a first tap at the edge leans the handle out, the second opens the panel, and a tap on the tint closes it or on the map lets it settle", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/edge-peek");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const handle = stage.getByRole("button", { name: "Layers" });
      const surface = handle.locator("xpath=..");
      await hoverCentre(page, surface);
      const s = await hoverBox(surface);
      const edge = s.x + s.width;
      const inner = edge - 1;
      const mid = s.y + s.height / 2;
      const out = () => hoverOut(handle, inner);
      await hoverAbout(out, 6, 0.5);

      // A tap anywhere on the sliver, out to its last pixel, leans the handle
      // all the way out and no more; a tap far from the edge lets it settle.
      for (const dx of [1, 2, 3, 4]) {
        await page.touchscreen.tap(inner - dx, mid);
        await hoverAbout(out, 30);
        await expect(handle).toHaveAttribute("aria-expanded", "false");
        await page.touchscreen.tap(s.x + 60, mid);
        await hoverAbout(out, 6);
      }
      await page.touchscreen.tap(inner - 2, mid);
      await hoverAbout(out, 30);
      await expect(handle).toHaveAttribute("aria-expanded", "false");
      await expect(line).toHaveText("layers tucked · 3 of 3 shown");
      // The second tap, on the handle, opens the panel.
      const grip = await hoverBox(handle);
      await page.touchscreen.tap(grip.x + grip.width / 2, mid);
      await expect(handle).toHaveAttribute("aria-expanded", "true");
      await expect(line).toHaveText("layers open · 3 of 3 shown");
      await hoverAbout(out, 240);
      // A tap on the tint over the map closes it.
      await page.touchscreen.tap(s.x + 60, mid);
      await expect(handle).toHaveAttribute("aria-expanded", "false");
      await expect(line).toHaveText("layers tucked · 3 of 3 shown");
      await hoverAbout(out, 6);
      // Near the edge, off the handle, a tap leans it too; a tap far from
      // the edge lets it settle back.
      await page.touchscreen.tap(edge - 16, s.y + 24);
      await hoverAbout(out, 30);
      await page.touchscreen.tap(s.x + 60, mid);
      await hoverAbout(out, 6);
      await expect(handle).toHaveAttribute("aria-expanded", "false");
      expect(await audioContexts(page)).toBe(0);
    });

    test("edge-peek: on touch, a finger dragging leftwards from the sliver pulls the panel out 1:1 and opens it, and dragged back it tucks away", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/edge-peek");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const handle = stage.getByRole("button", { name: "Layers" });
      const surface = handle.locator("xpath=..");
      await hoverCentre(page, surface);
      const s = await hoverBox(surface);
      const inner = s.x + s.width - 1;
      const mid = s.y + s.height / 2;
      const out = () => hoverOut(handle, inner);
      await hoverAbout(out, 6, 0.5);

      // From the sliver, 160px left: the handle is under the finger all the
      // way (6 + 160), and let go it opens.
      await hoverSwipe(
        page,
        { x: inner - 3, y: mid },
        { x: inner - 163, y: mid },
        16,
        () => hoverAbout(out, 166, 1.5),
      );
      await expect(handle).toHaveAttribute("aria-expanded", "true");
      await expect(line).toHaveText("layers open · 3 of 3 shown");
      await hoverAbout(out, 240);
      // Dragged back 160px from the open handle: under the finger again
      // (240 − 160), and let go it tucks away.
      const grip = await hoverBox(handle);
      const gx = grip.x + grip.width / 2;
      await hoverSwipe(
        page,
        { x: gx, y: mid },
        { x: gx + 160, y: mid },
        16,
        () => hoverAbout(out, 80, 1.5),
      );
      await expect(handle).toHaveAttribute("aria-expanded", "false");
      await expect(line).toHaveText("layers tucked · 3 of 3 shown");
      await hoverAbout(out, 6);
      expect(await audioContexts(page)).toBe(0);
    });

    test("cross-grid: on touch, a tap puts the crosshair on a cell and a tap outside the table clears it", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/cross-grid");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const grid = stage.getByRole("grid", {
        name: "Fernworks parcels shipped by depot and weekday",
      });
      const cell = (depot: string, day: number) =>
        grid
          .getByRole("row")
          .filter({
            has: page.getByRole("rowheader", { name: depot, exact: true }),
          })
          .getByRole("gridcell")
          .nth(day);
      await hoverCentre(page, grid);

      await cell("Gauge Row", 2).tap();
      await expect(line).toHaveText("Gauge Row · Wed · 412 parcels");
      await cell("Waylight", 4).tap();
      await expect(line).toHaveText("Waylight · Fri · 604 parcels");
      const g = await hoverBox(grid);
      await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height + 60);
      await expect(line).toHaveText("point at a cell or use the arrow keys");
      expect(await audioContexts(page)).toBe(0);
    });

    test("overflow-glide: on touch, the first tap on a cut name reads it and the second opens its row, and a name that fits opens at once", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/overflow-glide");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const row = stage.getByRole("button", { name: /^Coldbrook weir survey/ });
      const fits = stage.getByRole("button", { name: /^Site map\.png/ });
      await hoverCentre(page, stage.getByRole("list"));

      // The first tap reads the name to its end and back, and opens nothing.
      await row.tap();
      await expect(line).toHaveText("reading file 1 of 7 · 3 words a second");
      await expect(line).toHaveText("end of the name · file 1 of 7");
      await expect(line).toHaveText(
        "7 files · point at a name to read the rest",
      );
      // The second opens the row.
      await row.tap();
      await expect(line).toHaveText("opened file 1 of 7");
      // A name that fits has nothing to reveal: its first tap opens it.
      await fits.tap();
      await expect(line).toHaveText("opened file 2 of 7");
      // Having pressed elsewhere, the cut name reveals first again.
      await row.tap();
      await expect(line).toHaveText("reading file 1 of 7 · 3 words a second");
      expect(await audioContexts(page)).toBe(0);
    });

    test("try-on: on touch, the first tap tries a swatch on, the second keeps it, and a tap elsewhere takes a tried look back", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/try-on");
      const stage = pressStage(page);
      const line = stage.getByRole("status").last();
      const list = stage.getByRole("listbox", { name: "Accent" });
      const swatch = (name: string) =>
        list.getByRole("option", { name, exact: true });
      await hoverCentre(page, list.locator("xpath=../.."));

      await swatch("Moss").tap();
      await expect(line).toHaveText("trying moss · tap again to keep");
      await expect(swatch("Moss")).toHaveAttribute("aria-selected", "false");
      await swatch("Moss").tap();
      await expect(swatch("Moss")).toHaveAttribute("aria-selected", "true");
      await expect(swatch("Cobalt")).toHaveAttribute("aria-selected", "false");
      await expect(line).toHaveText(
        "kept moss · the preview is the accent now",
      );
      // A tried look goes back on a tap anywhere else.
      await swatch("Amber").tap();
      await expect(line).toHaveText("trying amber · tap again to keep");
      const l = await hoverBox(list);
      await page.touchscreen.tap(l.x + l.width / 2, l.y + l.height + 80);
      await expect(line).toHaveText(
        "accent moss · point at a swatch to try it",
      );
      await expect(swatch("Amber")).toHaveAttribute("aria-selected", "false");
      await expect(swatch("Moss")).toHaveAttribute("aria-selected", "true");
      expect(await audioContexts(page)).toBe(0);
    });

    test("eyedropper: on touch, a tap sends the loupe there and reads, a drag moves it by the finger's travel, and a tap on the loupe picks", async ({
      page,
    }) => {
      await countAudio(page);
      await gotoHydrated(page, "/components/eyedropper");
      const stage = pressStage(page);
      const picture = stage.getByRole("button", {
        name: "Coldbrook at dusk, reference photo",
      });
      const said = stage.getByRole("status").first();
      const line = stage.getByRole("status").last();
      const shelf = stage.getByRole("list", { name: "Picked colours" });
      const lens = stage.locator("canvas:not([aria-hidden])");
      await hoverCentre(page, picture.locator("xpath=.."));
      const pic = await hoverBox(picture);
      // A finger lands on whole pixels: these fall in picture pixel (300, 60).
      const p = {
        x: Math.ceil(pic.x + 1 + 300),
        y: Math.ceil(pic.y + 1 + 60),
      };

      // A tap away from the loupe sends it there; nothing is picked.
      await page.touchscreen.tap(p.x, p.y);
      await hoverAbout(() => hoverMidX(lens), p.x, 0.5);
      await hoverAbout(() => hoverMidY(lens), p.y, 0.5);
      await expect(line).toHaveText("0 of 6 picked · point at the photo");
      await expect(shelf.getByRole("button")).toHaveCount(0);
      // The finger drags the loupe 20px right: it reads 20 pixels on.
      await hoverSwipe(page, p, { x: p.x + 20, y: p.y }, 8);
      await hoverAbout(() => hoverMidX(lens), p.x + 20, 0.5);
      await picture.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      await expect(said).toHaveText(/^[a-z ]+, #[0-9A-F]{6}, at 320, 60\.$/);
      const dragged = await hoverReading(picture);
      // A tap on the loupe picks what it reads.
      await expect(shelf.getByRole("button")).toHaveCount(0);
      const l = await hoverBox(lens);
      await page.touchscreen.tap(l.x + l.width / 2, l.y + l.height / 2);
      await expect(
        shelf.getByRole("button", { name: `Copy ${dragged}` }),
      ).toBeEnabled();
      await expect(line).toHaveText(`1 of 6 picked · last ${dragged}`);
      expect(await audioContexts(page)).toBe(0);
    });
  });
});

/**
 * A component on the gallery stage with tweaks from the deep link. The stage
 * grows out of its card, so nothing on it is pressed or measured until two
 * readings of its box, a poll apart, agree.
 */
const holdOnStage = async (
  page: Page,
  slug: string,
  title: string,
  tweaks: string,
): Promise<Locator> => {
  await holdGoto(page, `/tactile?b=${slug}&t=${tweaks}`);
  const dialog = dialogOf(page, title);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  let last = "";
  await expect
    .poll(
      async () => {
        const box = await dialog.boundingBox();
        const now = box ? [box.x, box.y, box.width, box.height].join() : "";
        const still = now !== "" && now === last;
        last = now;
        return still;
      },
      { intervals: [100], timeout: 30_000 },
    )
    .toBe(true);
  return dialog.locator("[data-specimen-stage]");
};

/**
 * Turns the docs page's sound on. That hands the plate over to the live demo,
 * which mounts afresh, so this waits until `part` is a new element.
 */
const holdSoundOn = async (page: Page, part: Locator) => {
  type Marked = { holdStale?: boolean };
  await part.evaluate((el) => {
    (el as unknown as Marked).holdStale = true;
  });
  await page.getByRole("switch", { name: "Sound" }).click();
  await expect
    .poll(() => part.evaluate((el) => !(el as unknown as Marked).holdStale))
    .toBe(true);
};

/** A slider's committed value. */
const holdValue = async (slider: Locator) =>
  Number(await slider.getAttribute("aria-valuenow"));

/** Polls a slider until its value has stopped moving, and returns it. */
const holdSteady = (slider: Locator) => hoverStill(() => holdValue(slider));

/** Pour Hold's demo line for a glass holding `ml`, on top of the 1 l already logged. */
const holdPoured = (ml: number) => {
  const today = `${Number(((1000 + ml) / 1000).toFixed(2))} of 2 l today`;
  if (ml === 0) return "glass empty · hold to pour";
  return ml === 500 ? `full glass · ${today}` : `poured ${ml} ml · ${today}`;
};

/** How wide a drawn thing is now: 0 while it is not drawn at all. */
const holdWidth = async (target: Locator) =>
  (await target.boundingBox())?.width ?? 0;

/** The whole-number percentage in a line of text. */
const holdShare = (text: string | null) =>
  Number(/(\d+)%/.exec(text ?? "")?.[1] ?? Number.NaN);

/** Waits until a log has shown a text, for states that pass too quickly to poll. */
const holdSaw = (log: () => Promise<PressLog>, text: string) =>
  expect
    .poll(async () => (await log()).map(([t]) => t), { intervals: [100] })
    .toContain(text);

/** A press held still at a point: in, down, and a waver of a pixel that comes back. */
const holdDownAt = async (page: Page, at: HoverPoint) => {
  await page.mouse.move(at.x - 30, at.y + 20);
  await page.mouse.move(at.x, at.y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(at.x + 1, at.y + 1, { steps: 2 });
  await page.mouse.move(at.x, at.y, { steps: 2 });
};

/**
 * A drag a person settles before letting go: down at `from`, several moves
 * to `to`, a still moment there on the page's clock, so the release carries
 * no throw, then up.
 */
const holdDrag = async (page: Page, from: HoverPoint, to: HoverPoint) => {
  await page.mouse.move(from.x, from.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await hoverFor(page, 150);
  await page.mouse.up();
};

/** A point on Drop Pin's town, in map units (0–1200 east, 0–200 down), on the screen. */
const holdOnMap = (
  map: { x: number; y: number; width: number },
  x: number,
  y: number,
): HoverPoint => ({ x: map.x + map.width / 2 + (x - 600), y: map.y + y });

test.describe("tactile hold", () => {
  test("pour-hold: a held pointer and a held Space pour until let go and stop on a whole step, the arrows and Page keys pour or lower exactly one step, a hold to the brim and End both stop at a full glass, and Home or Empty drain it", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/pour-hold");
    const stage = pressStage(page);
    const glass = stage.getByRole("slider", { name: "Water" });
    const line = stage.getByRole("status").last();
    const empty = stage.getByRole("button", { name: "Empty" });
    // A spill's puddle at the glass's foot: the second ellipse drawn.
    const puddle = glass.locator("svg > ellipse").nth(1);

    await expect(glass).toHaveAttribute("aria-orientation", "vertical");
    await expect(glass).toHaveAttribute("aria-valuemin", "0");
    await expect(glass).toHaveAttribute("aria-valuemax", "500");
    await expect(glass).toHaveAttribute("aria-valuenow", "0");
    await expect(glass).toHaveAttribute("aria-valuetext", "0 ml");
    await expect(line).toHaveText(holdPoured(0));
    await expect(empty).toBeDisabled();

    // Pointer: held, it pours; let go, it stops on a whole step and stays.
    await pressDown(page, glass);
    await expect
      .poll(() => holdValue(glass), { intervals: [50] })
      .toBeGreaterThanOrEqual(150);
    await page.mouse.up();
    const poured = await holdSteady(glass);
    expect(poured % 10).toBe(0);
    expect(poured).toBeGreaterThanOrEqual(150);
    expect(poured).toBeLessThanOrEqual(500);
    await expect(glass).toHaveAttribute("aria-valuetext", `${poured} ml`);
    await expect(line).toHaveText(holdPoured(poured));
    await expect(empty).toBeEnabled();

    // Held on to the brim, it stops there although still held, and nothing
    // spills over.
    await pressDown(page, glass);
    await expect(glass).toHaveAttribute("aria-valuenow", "500", {
      timeout: 10_000,
    });
    await expect(line).toHaveText(holdPoured(500));
    await hoverFor(page, 600);
    await expect(glass).toHaveAttribute("aria-valuenow", "500");
    expect(await holdWidth(puddle)).toBeLessThan(1);
    await page.mouse.up();

    // Empty drains it.
    await empty.click();
    await expect(glass).toHaveAttribute("aria-valuenow", "0");
    await expect(glass).toHaveAttribute("aria-valuetext", "0 ml");
    await expect(line).toHaveText(holdPoured(0));
    await expect(empty).toBeDisabled();
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh glass: an arrow pours exactly one step and
    // stops, a Page key ten; the lowering keys take the value straight down.
    await holdGoto(page, "/components/pour-hold");
    await glass.focus();
    await page.keyboard.press("ArrowUp");
    await expect(glass).toHaveAttribute("aria-valuenow", "10");
    expect(await holdSteady(glass)).toBe(10);
    await expect(line).toHaveText(holdPoured(10));
    await page.keyboard.press("ArrowRight");
    await expect(glass).toHaveAttribute("aria-valuenow", "20");
    expect(await holdSteady(glass)).toBe(20);
    await page.keyboard.press("PageUp");
    await expect(glass).toHaveAttribute("aria-valuenow", "70");
    expect(await holdSteady(glass)).toBe(70);
    await expect(line).toHaveText(holdPoured(70));
    await page.keyboard.press("PageDown");
    await expect(glass).toHaveAttribute("aria-valuenow", "20");
    await page.keyboard.press("ArrowDown");
    await expect(glass).toHaveAttribute("aria-valuenow", "10");
    await expect(glass).toHaveAttribute("aria-valuetext", "10 ml");
    await page.keyboard.press("Home");
    await expect(glass).toHaveAttribute("aria-valuenow", "0");
    await expect(line).toHaveText(holdPoured(0));
    expect(await audioContexts(page)).toBe(0);

    // A held Space pours like the held pointer and stops on a whole step; a
    // held Enter pours on to the same full glass the pointer reached.
    await holdGoto(page, "/components/pour-hold");
    await glass.focus();
    await page.keyboard.down("Space");
    await expect
      .poll(() => holdValue(glass), { intervals: [50] })
      .toBeGreaterThanOrEqual(150);
    await page.keyboard.up("Space");
    const spaced = await holdSteady(glass);
    expect(spaced % 10).toBe(0);
    expect(spaced).toBeGreaterThanOrEqual(150);
    expect(spaced).toBeLessThanOrEqual(500);
    await expect(line).toHaveText(holdPoured(spaced));
    await page.keyboard.down("Enter");
    await expect(glass).toHaveAttribute("aria-valuenow", "500", {
      timeout: 10_000,
    });
    await expect(line).toHaveText(holdPoured(500));
    await page.keyboard.up("Enter");
    expect(await audioContexts(page)).toBe(0);

    // End pours an empty glass full at the default rate: never in less than
    // its 2.8 s of flow.
    await holdGoto(page, "/components/pour-hold");
    const log = await pressLog(line);
    await glass.focus();
    const asked = await pressNow(page);
    await page.keyboard.press("End");
    await expect(line).toHaveText(holdPoured(500), { timeout: 10_000 });
    const fill = pressTook(await log(), holdPoured(500), asked);
    expect(fill).toBeGreaterThan(2800);
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), the pour is heard.
    await holdSoundOn(page, glass);
    await expect(line).toHaveText(holdPoured(0));
    expect(await audioContexts(page)).toBe(0);
    await pressDown(page, glass);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
    await page.mouse.up();

    // Tweaks: the gentlest pour is a trickle that takes over 6 s to fill the
    // glass…
    let tuned = await holdOnStage(page, "pour-hold", "Pour Hold", "rate:0");
    let tunedGlass = tuned.getByRole("slider", { name: "Water" });
    let tunedLine = tuned.getByRole("status").last();
    const slowLog = await pressLog(tunedLine);
    await tunedGlass.focus();
    const go = await pressNow(page);
    await page.keyboard.press("End");
    await expect(tunedLine).toHaveText(holdPoured(500), { timeout: 20_000 });
    expect(pressTook(await slowLog(), holdPoured(500), go)).toBeGreaterThan(
      6000,
    );

    // …and with overflow on, a hold past the brim keeps pouring: the value
    // stays full while a puddle spreads at the foot, until the glass is
    // emptied.
    tuned = await holdOnStage(page, "pour-hold", "Pour Hold", "overflow:on");
    tunedGlass = tuned.getByRole("slider", { name: "Water" });
    tunedLine = tuned.getByRole("status").last();
    const spill = tunedGlass.locator("svg > ellipse").nth(1);
    await pressDown(page, tunedGlass);
    await expect(tunedGlass).toHaveAttribute("aria-valuenow", "500", {
      timeout: 10_000,
    });
    await expect
      .poll(() => holdWidth(spill), { timeout: 10_000 })
      .toBeGreaterThan(12);
    await expect(tunedGlass).toHaveAttribute("aria-valuenow", "500");
    await page.mouse.up();
    await expect(tunedLine).toHaveText(holdPoured(500));
    expect(await hoverStill(() => holdWidth(spill))).toBeGreaterThan(12);
    await tuned.getByRole("button", { name: "Empty" }).click();
    await expect(tunedGlass).toHaveAttribute("aria-valuenow", "0");
    await expect(tunedLine).toHaveText(holdPoured(0));
    await expect.poll(() => holdWidth(spill)).toBeLessThan(1);
  });

  test("peek-hold: a tap opens a row, a held press lifts it into its preview after the delay, sliding onto an action and letting go chooses it, sliding off cancels, a still release leaves it open, and Shift+F10 opens the same menu for the arrows and Enter", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/peek-hold");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const inbox = stage.getByRole("list", { name: "Inbox" });
    const row = (from: string) =>
      inbox.getByRole("button", { name: new RegExp(from) });
    const menu = stage.getByRole("menu");
    const action = (name: string) =>
      menu.getByRole("menuitem", { name, exact: true });
    const coldbrook = row("Coldbrook Bank");
    const gauge = row("Gaugeworks");

    await expect(line).toHaveText(
      "hold a row to peek · shift+f10 from the keyboard",
    );
    await expect(coldbrook).toHaveAttribute("aria-haspopup", "menu");
    await expect(coldbrook).toHaveAttribute("aria-expanded", "false");
    await expect(coldbrook).toHaveAccessibleDescription(
      "Press and hold, or press Shift+F10, for a preview and actions.",
    );
    await expect(menu).toHaveCount(0);
    await hoverCentre(page, inbox);

    // A tap opens the row as usual.
    await pressTap(page, gauge);
    await expect(line).toHaveText("opened · gaugeworks");
    await expect(gauge).not.toHaveAccessibleName(/Unread/);
    await expect(menu).toHaveCount(0);

    // A held press lifts the row into its preview once the delay has passed.
    const log = await pressLog(line);
    const pressed = await pressNow(page);
    await pressDown(page, coldbrook);
    await expect(line).toHaveText("peeking · coldbrook bank");
    const held = pressTook(await log(), "peeking · coldbrook bank", pressed);
    expect(held).toBeGreaterThan(450);
    await expect(coldbrook).toHaveAttribute("aria-expanded", "true");
    await expect(coldbrook).toHaveAttribute(
      "aria-controls",
      (await menu.getAttribute("id")) ?? "",
    );
    await expect(menu).toHaveAccessibleName("Coldbrook Bank");
    await expect(menu).toHaveAccessibleDescription(
      /^Your statement for March is ready to view\./,
    );
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Open",
      "Reply",
      "Flag",
      "Mark read",
    ]);

    // Still held, the finger slides onto Flag, which is highlighted, and
    // letting go there chooses it.
    const flag = action("Flag");
    await hoverStill(async () => (await hoverBox(flag)).y);
    const f = await hoverBox(flag);
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2, {
      steps: 8,
    });
    await expect(flag).toBeFocused();
    await page.mouse.up();
    await expect(line).toHaveText("flagged · coldbrook bank");
    await expect(coldbrook).toHaveAccessibleName(/Flagged/);
    await expect(coldbrook).toHaveAttribute("aria-expanded", "false");
    await expect(coldbrook).toBeFocused();
    await expect(menu).toHaveCount(0);

    // Sliding off every action and letting go cancels.
    const fern = row("Fernworks");
    await pressDown(page, fern);
    await expect(line).toHaveText("peeking · fernworks");
    const list = await hoverBox(inbox);
    await page.mouse.move(list.x + list.width / 2, list.y - 40, { steps: 8 });
    await page.mouse.up();
    await expect(line).toHaveText("peek closed · nothing changed");
    await expect(fern).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveCount(0);

    // Let go without moving, the preview stays open, like a right-click;
    // a tap on an action then chooses it…
    await pressDown(page, gauge);
    await expect(line).toHaveText("peeking · gaugeworks");
    await page.mouse.up();
    await hoverFor(page, 300);
    await expect(line).toHaveText("peeking · gaugeworks");
    await expect(gauge).toHaveAttribute("aria-expanded", "true");
    const unread = action("Mark unread");
    await hoverStill(async () => (await hoverBox(unread)).y);
    await pressTap(page, unread);
    await expect(line).toHaveText("marked unread · gaugeworks");
    await expect(gauge).toHaveAccessibleName(/Unread/);
    await expect(menu).toHaveCount(0);

    // …and a tap on the blurred page closes it.
    await pressDown(page, gauge);
    await expect(line).toHaveText("peeking · gaugeworks");
    await page.mouse.up();
    await expect(menu).toBeVisible();
    const veil = await hoverBox(inbox);
    await page.mouse.click(veil.x + 2, veil.y + veil.height / 2);
    await expect(line).toHaveText("peek closed · nothing changed");
    await expect(gauge).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveCount(0);

    // A right-click opens the same preview at once; Escape closes it and
    // hands focus back to the row.
    const basin = row("Basinworks");
    const b = await hoverBox(basin);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, {
      button: "right",
    });
    await expect(line).toHaveText("peeking · basinworks");
    await expect(basin).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(line).toHaveText("peek closed · nothing changed");
    await expect(basin).toBeFocused();
    await expect(menu).toHaveCount(0);
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh inbox: Shift+F10 opens the same menu with focus
    // on its first action, the arrows and Home/End walk it, and Enter lands
    // where the finger did.
    await holdGoto(page, "/components/peek-hold");
    await coldbrook.focus();
    await page.keyboard.press("Shift+F10");
    await expect(line).toHaveText("peeking · coldbrook bank");
    await expect(coldbrook).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAttribute("aria-orientation", "vertical");
    await expect(action("Open")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(action("Reply")).toBeFocused();
    // A vertical menu: left and right move nothing.
    await page.keyboard.press("ArrowRight");
    await expect(action("Reply")).toBeFocused();
    await page.keyboard.press("End");
    await expect(action("Mark read")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(action("Flag")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(action("Open")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(action("Flag")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(line).toHaveText("flagged · coldbrook bank");
    await expect(coldbrook).toHaveAccessibleName(/Flagged/);
    await expect(coldbrook).toHaveAttribute("aria-expanded", "false");
    await expect(coldbrook).toBeFocused();
    await expect(menu).toHaveCount(0);

    // The menu key opens it too; Escape and Tab each close it and hand focus
    // back to the row.
    await page.keyboard.press("ContextMenu");
    await expect(line).toHaveText("peeking · coldbrook bank");
    await expect(action("Open")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(line).toHaveText("peek closed · nothing changed");
    await expect(coldbrook).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(line).toHaveText("peeking · coldbrook bank");
    await page.keyboard.press("Tab");
    await expect(line).toHaveText("peek closed · nothing changed");
    await expect(coldbrook).toBeFocused();
    await expect(menu).toHaveCount(0);

    // Enter on a row opens it.
    await page.keyboard.press("Enter");
    await expect(line).toHaveText("opened · coldbrook bank");
    await expect(coldbrook).not.toHaveAccessibleName(/Unread/);
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), the lift is heard.
    await holdSoundOn(page, inbox);
    await expect(line).toHaveText(
      "hold a row to peek · shift+f10 from the keyboard",
    );
    expect(await audioContexts(page)).toBe(0);
    await hoverCentre(page, inbox);
    await pressDown(page, row("Fernworks"));
    await expect(line).toHaveText("peeking · fernworks");
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
    await page.mouse.up();

    // Tweaks: a 900 ms charge, and the actions as one row the arrows cross.
    const tuned = await holdOnStage(
      page,
      "peek-hold",
      "Peek Hold",
      "delay:900,actions:row",
    );
    const tunedLine = tuned.getByRole("status").last();
    const tunedRow = tuned
      .getByRole("list", { name: "Inbox" })
      .getByRole("button", { name: /Coldbrook Bank/ });
    const tunedMenu = tuned.getByRole("menu");
    const tunedLog = await pressLog(tunedLine);
    const from = await pressNow(page);
    await pressDown(page, tunedRow);
    await expect(tunedLine).toHaveText("peeking · coldbrook bank");
    await page.mouse.up();
    const slow = pressTook(await tunedLog(), "peeking · coldbrook bank", from);
    expect(slow).toBeGreaterThan(900);
    await expect(tunedMenu).toHaveAttribute("aria-orientation", "horizontal");
    await expect(tunedMenu).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(
      tunedMenu.getByRole("menuitem", { name: "Open", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(
      tunedMenu.getByRole("menuitem", { name: "Reply", exact: true }),
    ).toBeFocused();
    // Escape closes the preview and nothing else: the stage stays.
    await page.keyboard.press("Escape");
    await expect(tunedLine).toHaveText("peek closed · nothing changed");
    await expect(dialogOf(page, "Peek Hold")).toBeVisible();
  });

  test("fuse-button: a held pointer and a held Space burn the fuse while held and pause it where it got to, holding again carries on from there and fires once, Escape puts a paused fuse out, and an assistive click burns it through", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/fuse-button");
    const stage = pressStage(page);
    const fuse = stage.getByRole("button", { name: "Hold to deploy" });
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const idle = "hold to deploy · the fuse is 2 s";
    const burning = "burning · hold till it lands";
    const deployed = "deployed 4.2.0 · 1 deploy today";
    const paused = /^paused at \d+% · hold to relight$/;

    await expect(fuse).toHaveAccessibleDescription(
      "Press and hold to confirm. Escape puts the fuse out.",
    );
    await expect(line).toHaveText(idle);
    await expect(said).toHaveText("");
    await expect(stage.getByText("Release 4.2.0 to production")).toBeVisible();

    // Pointer: held, it burns; let go, it pauses where it got to, which is
    // never more of the 2 s lap than it was held for, and stays there.
    const log = await pressLog(line);
    const lit = await pressNow(page);
    await pressDown(page, fuse);
    await expect(line).toHaveText(burning);
    await pressAfter(page, log, 600);
    await page.mouse.up();
    await expect(line).toHaveText(paused);
    const stopped = (await line.textContent()) ?? "";
    const share = holdShare(stopped);
    await expect(said).toHaveText(
      `Paused at ${share} percent. Hold to continue.`,
    );
    // Timed from just before the press, so a late render can only lengthen
    // the hold it is compared with.
    const heldFor = pressTook(await log(), stopped, lit);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(heldFor / 20 + 1);
    await hoverFor(page, 400);
    await expect(line).toHaveText(stopped);

    // Held again for a moment, it relights from there: the burnt share
    // only grows.
    await pressDown(page, fuse);
    await expect(line).toHaveText(burning);
    await pressAfter(page, log, 300);
    await page.mouse.up();
    await expect(line).toHaveText(paused);
    const more = holdShare(await line.textContent());
    expect(more).toBeGreaterThan(share);
    await expect(said).toHaveText(
      `Paused at ${more} percent. Hold to continue.`,
    );
    expect(await audioContexts(page)).toBe(0);

    // Held a third time, it burns the rest of the lap and fires once.
    await pressDown(page, fuse);
    await expect(line).toHaveText(deployed);
    await expect(said).toHaveText("Confirmed.");
    await expect(stage.getByText("Release 4.2.1 to production")).toBeVisible();
    // Still held once it has fired, nothing more happens; let go, the fuse
    // is laid again.
    await hoverFor(page, 400);
    await expect(line).toHaveText(deployed);
    await page.mouse.up();
    await expect(line).toHaveText(idle);
    await expect(said).toHaveText("");
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh fuse: a held Space burns and letting go
    // pauses; Escape puts it out.
    await holdGoto(page, "/components/fuse-button");
    const keyLog = await pressLog(line);
    await fuse.focus();
    await page.keyboard.down("Space");
    await expect(line).toHaveText(burning);
    await pressAfter(page, keyLog, 500);
    await page.keyboard.up("Space");
    await expect(line).toHaveText(paused);
    const keyShare = holdShare(await line.textContent());
    await expect(said).toHaveText(
      `Paused at ${keyShare} percent. Hold to continue.`,
    );
    await page.keyboard.press("Escape");
    await expect(said).toHaveText("Fuse out.");
    await expect(line).toHaveText(idle);
    // A held Enter, its key repeat no press of its own, burns through and
    // fires once, where the pointer's hold did.
    await page.keyboard.down("Enter");
    await expect(line).toHaveText(burning);
    await page.keyboard.down("Enter");
    await expect(line).toHaveText(deployed);
    await expect(said).toHaveText("Confirmed.");
    await expect(stage.getByText("Release 4.2.1 to production")).toBeVisible();
    await page.keyboard.up("Enter");
    await expect(line).toHaveText(idle);
    await expect(fuse).toBeFocused();
    expect(await audioContexts(page)).toBe(0);

    // An assistive click, with nothing to hold, burns the whole fuse through.
    await holdGoto(page, "/components/fuse-button");
    const clickLog = await pressLog(line);
    const clickSaid = await pressLog(said);
    await fuse.evaluate((button) => (button as HTMLButtonElement).click());
    await holdSaw(clickLog, deployed);
    await holdSaw(clickSaid, "Confirmed.");
    await expect(stage.getByText("Release 4.2.1 to production")).toBeVisible();
    await expect(line).toHaveText(idle);
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), the burn is heard.
    await holdSoundOn(page, fuse);
    await expect(stage.getByText("Release 4.2.0 to production")).toBeVisible();
    expect(await audioContexts(page)).toBe(0);
    await pressDown(page, fuse);
    await expect(line).toHaveText(burning);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
    await page.mouse.up();

    // Tweaks: a 3 s lap takes no less than 3 s of holding to fire…
    let tuned = await holdOnStage(page, "fuse-button", "Fuse Button", "burn:3");
    let tunedFuse = tuned.getByRole("button", { name: "Hold to deploy" });
    let tunedLine = tuned.getByRole("status").last();
    await expect(tunedLine).toHaveText("hold to deploy · the fuse is 3 s");
    let tunedLog = await pressLog(tunedLine);
    let at = await pressNow(page);
    await pressDown(page, tunedFuse);
    await expect(tunedLine).toHaveText(deployed, { timeout: 10_000 });
    await page.mouse.up();
    expect(pressTook(await tunedLog(), deployed, at)).toBeGreaterThan(3000);

    // …and two laps of the default 2 s take no less than 4 s.
    tuned = await holdOnStage(page, "fuse-button", "Fuse Button", "laps:2");
    tunedFuse = tuned.getByRole("button", { name: "Hold to deploy" });
    tunedLine = tuned.getByRole("status").last();
    await expect(tunedLine).toHaveText("hold to deploy · the fuse is 4 s");
    tunedLog = await pressLog(tunedLine);
    at = await pressNow(page);
    await pressDown(page, tunedFuse);
    await expect(tunedLine).toHaveText(deployed, { timeout: 12_000 });
    await page.mouse.up();
    expect(pressTook(await tunedLog(), deployed, at)).toBeGreaterThan(4000);
  });

  test("print-hold: a still held pointer and a held Enter each read the print through Checking to Confirmed, lifting early, slipping past 16px and Escape each stop the read with the reason in words, and Reset arms it again", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/print-hold");
    const stage = pressStage(page);
    const pad = stage.getByRole("button", {
      name: "Hold to approve 1,240.00 to Fernworks Supply",
    });
    const caption = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const reset = stage.getByRole("button", { name: "Reset" });
    const pending = "transfer pending · hold the pad";
    const approved = "transfer approved · 1,240.00 sent";
    const reading = "Reading — keep holding";

    await expect(pad).toHaveAccessibleDescription("Press and hold the pad");
    await expect(pad).not.toHaveAttribute("aria-disabled");
    await expect(line).toHaveText(pending);
    await expect(reset).toBeDisabled();

    // Lifted early, the read drains and the caption says why.
    await pressDown(page, pad);
    await expect(pad).toHaveAccessibleDescription(reading);
    await page.mouse.up();
    await expect(pad).toHaveAccessibleDescription(
      "Released early — hold until it fills",
    );
    await expect(line).toHaveText(pending);

    // Moved more than 16px, the read is refused, however long the thumb
    // then stays down.
    await pressDown(page, pad);
    await expect(pad).toHaveAccessibleDescription(reading);
    const p = await hoverBox(pad);
    await page.mouse.move(p.x + p.width / 2 + 20, p.y + p.height / 2, {
      steps: 5,
    });
    await expect(pad).toHaveAccessibleDescription(
      "Moved — keep your thumb still",
    );
    await hoverFor(page, 1800);
    await page.mouse.up();
    await expect(pad).toHaveAccessibleDescription(
      "Moved — keep your thumb still",
    );
    await expect(line).toHaveText(pending);

    // Held still: the whole read (never under its 1.6 s), Checking while the
    // bank answers, then Confirmed, and the pad takes no more holds. Checking
    // lasts only as long as the bank takes, so it is read from the log.
    const log = await pressLog(caption, "span:not([aria-hidden])");
    const pressed = await pressNow(page);
    await pressDown(page, pad);
    await expect(pad).toHaveAccessibleDescription("Confirmed");
    await page.mouse.up();
    await expect(pad).toHaveAttribute("aria-disabled", "true");
    await expect(line).toHaveText(approved);
    await expect(reset).toBeEnabled();
    const checked = pressTook(await log(), "Checking", pressed);
    expect(pressTook(await log(), reading, pressed)).toBeLessThan(checked);
    expect(checked).toBeGreaterThan(1600);
    await pressDown(page, pad);
    await hoverFor(page, 400);
    await page.mouse.up();
    await expect(pad).toHaveAccessibleDescription("Confirmed");
    await expect(line).toHaveText(approved);

    // Reset arms it again.
    await reset.click();
    await expect(pad).toHaveAccessibleDescription("Press and hold the pad");
    await expect(pad).not.toHaveAttribute("aria-disabled");
    await expect(line).toHaveText(pending);
    await expect(reset).toBeDisabled();
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh pad: a held Space reads and letting go early
    // drains; Escape mid-read cancels…
    await holdGoto(page, "/components/print-hold");
    await pad.focus();
    await page.keyboard.down("Space");
    await expect(pad).toHaveAccessibleDescription(reading);
    await page.keyboard.up("Space");
    await expect(pad).toHaveAccessibleDescription(
      "Released early — hold until it fills",
    );
    await page.keyboard.down("Space");
    await expect(pad).toHaveAccessibleDescription(reading);
    await page.keyboard.press("Escape");
    await expect(pad).toHaveAccessibleDescription("Cancelled");
    await page.keyboard.up("Space");
    await expect(pad).toHaveAccessibleDescription("Cancelled");
    await expect(line).toHaveText(pending);
    // …and a held Enter, its key repeat ignored, reads through to the same
    // Confirmed the pointer reached.
    const keyLog = await pressLog(caption, "span:not([aria-hidden])");
    await page.keyboard.down("Enter");
    await expect(pad).toHaveAccessibleDescription(reading);
    await page.keyboard.down("Enter");
    await expect(pad).toHaveAccessibleDescription("Confirmed");
    await page.keyboard.up("Enter");
    await holdSaw(keyLog, "Checking");
    await expect(pad).toHaveAttribute("aria-disabled", "true");
    await expect(line).toHaveText(approved);
    await expect(pad).toBeFocused();

    // An assistive click, with no key to hold, runs a whole read.
    await reset.click();
    await expect(line).toHaveText(pending);
    await pad.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(pad).toHaveAccessibleDescription("Confirmed", {
      timeout: 10_000,
    });
    await expect(line).toHaveText(approved);
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), the hold is heard.
    await holdSoundOn(page, pad);
    await expect(line).toHaveText(pending);
    expect(await audioContexts(page)).toBe(0);
    await pressDown(page, pad);
    await expect(pad).toHaveAccessibleDescription(reading);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
    await page.mouse.up();

    // Tweaks: a 3 s read that condenses into a padlock and says Unlocked…
    let tuned = await holdOnStage(
      page,
      "print-hold",
      "Print Hold",
      "scan:3,feedback:unlock",
    );
    let tunedPad = tuned.getByRole("button", { name: /^Hold to approve/ });
    const tunedLog = await pressLog(
      tuned.getByRole("status").first(),
      "span:not([aria-hidden])",
    );
    const from = await pressNow(page);
    await pressDown(page, tunedPad);
    await expect(tunedPad).toHaveAccessibleDescription("Unlocked", {
      timeout: 10_000,
    });
    await page.mouse.up();
    await expect(tuned.getByRole("status").last()).toHaveText(approved);
    const slowRead = pressTook(await tunedLog(), "Checking", from);
    expect(pressTook(await tunedLog(), reading, from)).toBeLessThan(slowRead);
    expect(slowRead).toBeGreaterThan(3000);

    // …and Escape cancels a read without closing the stage.
    tuned = await holdOnStage(page, "print-hold", "Print Hold", "scan:3");
    tunedPad = tuned.getByRole("button", { name: /^Hold to approve/ });
    await tunedPad.focus();
    await page.keyboard.down("Space");
    await expect(tunedPad).toHaveAccessibleDescription(reading);
    await page.keyboard.press("Escape");
    await expect(tunedPad).toHaveAccessibleDescription("Cancelled");
    await page.keyboard.up("Space");
    await expect(dialogOf(page, "Print Hold")).toBeVisible();
  });

  test("jiggle-mode: a quick press or Space opens a tile, a held pointer or held Space ripples the grid into edit mode, a drag and the arrow keys carry a tile to the same slot, the remove badge and Delete take a tile away and Undo brings it back, and Done or Escape settles it", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/jiggle-mode");
    const stage = pressStage(page);
    const grid = stage.getByRole("list", { name: "Fieldline shortcuts" });
    const tiles = grid.getByRole("listitem");
    const tile = (name: string) =>
      grid.getByRole("button", { name, exact: true });
    const said = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const done = stage.getByRole("button", { name: "Done" });
    const undo = stage.getByRole("button", { name: "Undo" });
    const badges = grid.getByRole("button", { name: /^Remove / });
    const home = [
      "Inbox",
      "Calendar",
      "Files",
      "Budget",
      "Notes",
      "Reports",
      "Team",
      "Settings",
    ];
    // Budget carried one row down, into the last slot.
    const moved = [...home.filter((n) => n !== "Budget"), "Budget"];
    const editing =
      "Editing Fieldline shortcuts. Drag a tile or press Space to move it, Delete to remove it, Escape when done.";

    await expect(tiles).toHaveText(home);
    await expect(line).toHaveText("8 shortcuts · hold one to edit");
    await expect(tile("Budget")).toHaveAccessibleDescription(
      "Press to open. Hold for a moment, with a finger or with Space, to edit.",
    );
    // One tab stop for the whole grid.
    await expect(grid.locator("button[tabindex='0']")).toHaveCount(1);
    await expect(badges).toHaveCount(0);
    await hoverCentre(page, grid);

    // A quick press opens the tile.
    await pressTap(page, tile("Budget"));
    await expect(line).toHaveText("8 shortcuts · opened budget");

    // Held for the delay, the grid goes into edit mode, every tile with a
    // badge; the release after it opens nothing.
    const log = await pressLog(line);
    const pressed = await pressNow(page);
    await pressDown(page, tile("Budget"));
    await expect(line).toHaveText("editing · drag to reorder");
    const held = pressTook(await log(), "editing · drag to reorder", pressed);
    expect(held).toBeGreaterThan(500);
    await expect(said).toHaveText(editing);
    await page.mouse.up();
    await expect(badges).toHaveCount(8);
    await expect(done).toBeVisible();
    await expect(tile("Budget")).toHaveAccessibleDescription(
      "Editing. Space picks a tile up to move it, Delete removes it, Escape finishes.",
    );

    // A drag carries Budget a row down into the last slot; the new order is
    // reported once, on the drop.
    const b = await hoverBox(tile("Budget"));
    const grip = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await holdDrag(page, grip, { x: grip.x, y: grip.y + 72 });
    await expect(said).toHaveText("Budget moved, 8 of 8.");
    await expect(tiles).toHaveText(moved);
    await expect(line).toHaveText("editing · drag to reorder");

    // The remove badge takes a tile away at once; Undo puts it back in its
    // slot.
    // The tiles rock, so each press goes to wherever its target is now.
    await hoverPress(page, grid.getByRole("button", { name: "Remove Notes" }));
    await expect(said).toHaveText("Notes removed, 7 left.");
    await expect(tiles).toHaveText(moved.filter((n) => n !== "Notes"));
    await undo.click();
    await expect(said).toHaveText("Notes restored, 8 tiles.");
    await expect(tiles).toHaveText(moved);

    // Done leaves edit mode.
    await done.click();
    await expect(said).toHaveText("Done editing.");
    await expect(line).toHaveText("8 shortcuts · notes restored");
    await expect(badges).toHaveCount(0);
    await expect(done).toHaveCount(0);
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh grid: the arrows walk the tiles in two
    // dimensions and a quick Space opens one…
    await holdGoto(page, "/components/jiggle-mode");
    await tile("Inbox").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tile("Calendar")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(tile("Reports")).toBeFocused();
    await page.keyboard.press("End");
    await expect(tile("Settings")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tile("Inbox")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(tile("Budget")).toBeFocused();
    await expect(tile("Budget")).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Space");
    await expect(line).toHaveText("8 shortcuts · opened budget");
    // …held for the delay, it ripples the grid into edit mode.
    await page.keyboard.down("Space");
    await expect(line).toHaveText("editing · drag to reorder");
    await expect(said).toHaveText(editing);
    await page.keyboard.up("Space");
    await expect(badges).toHaveCount(8);
    // Space picks Budget up, ArrowDown carries it a row down and Space drops
    // it: the order the drag made.
    await page.keyboard.press("Space");
    await expect(said).toHaveText(
      "Budget picked up, 4 of 8. Arrows move it, Space drops it, Escape puts it back.",
    );
    await page.keyboard.press("ArrowDown");
    await expect(said).toHaveText("Budget, 8 of 8.");
    await page.keyboard.press("Space");
    await expect(said).toHaveText("Budget dropped, 8 of 8.");
    await expect(tiles).toHaveText(moved);
    await expect(tile("Budget")).toBeFocused();
    // Escape with a tile in hand puts it back where it was.
    await page.keyboard.press("Space");
    await page.keyboard.press("Home");
    await expect(said).toHaveText("Budget, 1 of 8.");
    await page.keyboard.press("Escape");
    await expect(said).toHaveText("Budget put back, 8 of 8.");
    await expect(tiles).toHaveText(moved);
    await expect(line).toHaveText("editing · drag to reorder");
    // Delete does the badge's job, and focus moves to the tile now in that
    // slot.
    await page.keyboard.press("Delete");
    await expect(said).toHaveText("Budget removed, 7 left.");
    await expect(tiles).toHaveText(moved.slice(0, 7));
    await expect(tile("Settings")).toBeFocused();
    // Escape with nothing in hand leaves edit mode, focus kept on the grid.
    await page.keyboard.press("Escape");
    await expect(said).toHaveText("Done editing.");
    await expect(line).toHaveText("7 shortcuts · budget removed");
    await expect(badges).toHaveCount(0);
    await expect(tile("Settings")).toBeFocused();
    // Undo, outside edit mode too, brings Budget back to its slot.
    await undo.click();
    await expect(said).toHaveText("Budget restored, 8 tiles.");
    await expect(tiles).toHaveText(moved);
    await expect(line).toHaveText("8 shortcuts · budget restored");
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), edit mode
    // starting is heard.
    await holdSoundOn(page, grid);
    await expect(line).toHaveText("8 shortcuts · hold one to edit");
    expect(await audioContexts(page)).toBe(0);
    await hoverCentre(page, grid);
    await pressDown(page, tile("Inbox"));
    await expect(line).toHaveText("editing · drag to reorder");
    await page.mouse.up();
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: a one-second hold, and check badges that mark tiles for Done.
    const tuned = await holdOnStage(
      page,
      "jiggle-mode",
      "Jiggle Mode",
      "badge:check,delay:1000",
    );
    const tunedGrid = tuned.getByRole("list", { name: "Fieldline shortcuts" });
    const tunedTile = (name: string) =>
      tunedGrid.getByRole("button", { name, exact: true });
    const tunedSaid = tuned.getByRole("status").first();
    const tunedLine = tuned.getByRole("status").last();
    const tunedLog = await pressLog(tunedLine);
    const from = await pressNow(page);
    await pressDown(page, tunedTile("Budget"));
    await expect(tunedLine).toHaveText("editing · drag to reorder");
    await page.mouse.up();
    const slow = pressTook(await tunedLog(), "editing · drag to reorder", from);
    expect(slow).toBeGreaterThan(1000);
    await expect(tunedGrid.getByRole("button", { name: /^Keep / })).toHaveCount(
      8,
    );
    const keep = tunedTile("Keep Budget");
    await expect(keep).toHaveAttribute("aria-pressed", "true");
    await hoverPress(page, keep);
    await expect(keep).toHaveAttribute("aria-pressed", "false");
    await expect(tunedSaid).toHaveText("Budget will be removed on Done.");
    // A tap on a tile marks it too, and a second tap keeps it again.
    await hoverPress(page, tunedTile("Notes"));
    await expect(tunedSaid).toHaveText("Notes will be removed on Done.");
    await hoverPress(page, tunedTile("Notes"));
    await expect(tunedSaid).toHaveText("Notes kept.");
    await expect(tunedTile("Keep Notes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Escape, claimed from the stage, takes the marked tile away on Done.
    await tunedTile("Inbox").focus();
    await page.keyboard.press("Escape");
    await expect(tunedSaid).toHaveText("Done. 1 removed, 7 left.");
    await expect(tunedLine).toHaveText("7 shortcuts · budget removed");
    await expect(tunedGrid.getByRole("listitem")).toHaveText(
      home.filter((n) => n !== "Budget"),
    );
    await expect(dialogOf(page, "Jiggle Mode")).toBeVisible();
  });

  test("drop-pin: a still held pointer and the keyboard's crosshair drop the pin on the same square, an early lift or a slip drops nothing, a dragged pin and the arrow keys land on the same new square, and Delete or Clear removes it", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await countAudio(page);
    await holdGoto(page, "/components/drop-pin");
    const stage = pressStage(page);
    const map = stage.getByRole("application", {
      name: "Drop-off point for Fernworks order FW-4410",
    });
    const said = map.getByRole("status");
    const line = stage.getByRole("status").last();
    const clear = stage.getByRole("button", { name: "Clear" });
    const none = "no pin · hold anywhere on the map";
    const first = "drop-off set · K3 · 320.0 E · 35.0 N";
    const second = "drop-off set · L2 · 350.0 E · 55.0 N";

    await expect(map).toHaveAttribute("aria-roledescription", "map");
    await expect(map).toHaveAccessibleDescription(
      "Hold anywhere to drop a pin, or use the arrow keys to move the crosshair, Shift to move it further, Enter to drop the pin and Delete to remove it.",
    );
    await expect(line).toHaveText(none);
    await expect(said).toHaveText("");
    await expect(clear).toBeDisabled();

    await hoverCentre(page, map);
    const m = await hoverBox(map);
    const spot = holdOnMap(m, 640, 130);

    // An early lift drops nothing, and nor does a finger that slips 12px,
    // however long it then stays down.
    await page.mouse.move(spot.x, spot.y, { steps: 4 });
    await page.mouse.down();
    await page.mouse.up();
    await holdDownAt(page, spot);
    await page.mouse.move(spot.x + 12, spot.y, { steps: 4 });
    await hoverFor(page, 900);
    await page.mouse.up();
    await expect(line).toHaveText(none);
    await expect(said).toHaveText("");

    // Held still, the pin drops there once the delay has passed, and its
    // square and grid reference are said.
    const log = await pressLog(line);
    const pressed = await pressNow(page);
    await holdDownAt(page, spot);
    await expect(said).toHaveText("Pin dropped at K3, 320.0 east, 35.0 north.");
    await expect(line).toHaveText(first);
    await page.mouse.up();
    const held = pressTook(await log(), first, pressed);
    expect(held).toBeGreaterThan(450);
    await expect(clear).toBeEnabled();

    // The pin drags 1:1 to a new square and is set down there.
    await holdDrag(
      page,
      { x: spot.x, y: spot.y - 16 },
      { x: spot.x + 60, y: spot.y - 56 },
    );
    await expect(said).toHaveText("Pin moved to L2, 350.0 east, 55.0 north.");
    await expect(line).toHaveText(second);

    // Clear, from the host, takes it away.
    await clear.click();
    await expect(line).toHaveText(none);
    await expect(clear).toBeDisabled();
    expect(await audioContexts(page)).toBe(0);

    // Keyboard, from a fresh map: focus brings a crosshair to the middle,
    // Shift+arrow moves it 40 units and an arrow 10, and Enter drops the pin
    // on the square the pointer's hold did.
    await holdGoto(page, "/components/drop-pin");
    await map.focus();
    await page.keyboard.press("Shift+ArrowRight");
    for (let k = 0; k < 3; k += 1) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(said).toHaveText("Pin dropped at K3, 320.0 east, 35.0 north.");
    await expect(line).toHaveText(first);
    // The crosshair names each new square it enters; Space drops the pin on
    // the square the drag reached.
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(said).toHaveText("Crosshair L3.");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowUp");
    await expect(said).toHaveText("Crosshair L2.");
    await page.keyboard.press("Space");
    await expect(said).toHaveText("Pin dropped at L2, 350.0 east, 55.0 north.");
    await expect(line).toHaveText(second);
    // Delete removes it.
    await page.keyboard.press("Delete");
    await expect(said).toHaveText("Pin removed.");
    await expect(line).toHaveText(none);
    await expect(clear).toBeDisabled();
    expect(await audioContexts(page)).toBe(0);

    // With sound on (the page hands over to a fresh demo), the drop is heard.
    await holdSoundOn(page, map);
    expect(await audioContexts(page)).toBe(0);
    await map.focus();
    await page.keyboard.press("Enter");
    await expect(line).toHaveText(/^drop-off set · /);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);

    // Tweaks: a one-second hold that drops a red pin.
    const tuned = await holdOnStage(
      page,
      "drop-pin",
      "Drop Pin",
      "delay:1000,colour:red",
    );
    const tunedMap = tuned.getByRole("application");
    const tunedLine = tuned.getByRole("status").last();
    const t = await hoverBox(tunedMap);
    const tunedLog = await pressLog(tunedLine);
    const from = await pressNow(page);
    await holdDownAt(page, holdOnMap(t, 600, 100));
    await expect(tunedLine).toHaveText("drop-off set · K3 · 300.0 E · 50.0 N");
    await page.mouse.up();
    const slow = pressTook(
      await tunedLog(),
      "drop-off set · K3 · 300.0 E · 50.0 N",
      from,
    );
    expect(slow).toBeGreaterThan(1000);
    // The pin's head is painted in the danger colour.
    const head = await tunedMap
      .locator("svg[width='24'] path")
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
    const danger = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--danger)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(head).toBe(danger);
  });
});

/*
 * The four defects the hold tests found, each pinned where it was fixed:
 * a key step counted from a level still draining, a menu that slid under a
 * still finger and was chosen, a reset's fading light picked up by a tap,
 * and a click during the re-lay that left the fuse held for good.
 */
test.describe("tactile hold regressions", () => {
  test("pour-hold: a key step taken while the glass drains counts from the value it drains to", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await holdGoto(page, "/components/pour-hold");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const glass = stage.getByRole("slider", { name: "Water" });
    await glass.focus();
    await page.keyboard.press("End");
    await expect(line).toHaveText(/full glass/i, { timeout: 30_000 });
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await expect(glass).toHaveAttribute("aria-valuenow", "10");
    await expect(line).not.toHaveText(/full glass/i);
  });

  test("peek-hold: letting go without sliding keeps a lower row's preview open, whatever lands under the finger", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await holdGoto(page, "/components/peek-hold");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const inbox = stage.getByRole("list", { name: "Inbox" });
    for (const name of ["Waylight Pay", "Basinworks"]) {
      const row = inbox.getByRole("button", { name: new RegExp(name) });
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      if (!box) throw new Error(`no box for ${name}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(line).toHaveText(`peeking · ${name.toLowerCase()}`);
      // Let the menu finish sliding into place under the resting finger.
      await expect(stage.getByRole("menu")).toBeVisible();
      await page.mouse.up();
      await expect(line).toHaveText(`peeking · ${name.toLowerCase()}`);
      await expect(stage.getByRole("menu")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(stage.getByRole("menu")).toHaveCount(0);
    }
  });

  test("print-hold: after Reset a quick tap starts a fresh read instead of approving", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await holdGoto(page, "/components/print-hold");
    const stage = pressStage(page);
    const caption = stage.getByRole("status").first();
    const line = stage.getByRole("status").last();
    const pad = stage.getByRole("button", { name: /^Hold to approve/ });
    await pad.focus();
    await page.keyboard.down("Enter");
    await expect(line).toHaveText(/transfer approved/i, { timeout: 30_000 });
    await page.keyboard.up("Enter");
    // Reset and put the thumb straight back, while the finished read's light
    // is still going out: all in one turn of the page, so no round trip lets
    // the light finish draining first.
    await stage.evaluate((root) => {
      const buttons = Array.from(root.querySelectorAll("button"));
      buttons.find((b) => b.textContent?.trim() === "Reset")?.click();
      buttons
        .find((b) =>
          (b.getAttribute("aria-label") ?? b.textContent ?? "").startsWith(
            "Hold to approve",
          ),
        )
        ?.focus();
    });
    await page.keyboard.down(" ");
    await page.waitForTimeout(120);
    await page.keyboard.up(" ");
    // A 120ms tap is a read stopped short, never an approval.
    await expect(caption).toHaveText("Released early — hold until it fills");
    await expect(line).toHaveText(/transfer pending/i);
  });

  test("fuse-button: a click while a spent fuse is re-laid leaves it ready for the next hold", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await holdGoto(page, "/components/fuse-button");
    const stage = pressStage(page);
    const line = stage.getByRole("status").last();
    const fuse = stage.getByRole("button", { name: "Hold to deploy" });
    // An assistive click burns it through; the moment the demo says the fuse
    // is re-laid (the spent cord is still fading out), a second click lands.
    await stage.evaluate(
      (root) =>
        new Promise<void>((resolve) => {
          const button = Array.from(root.querySelectorAll("button")).find((b) =>
            b.textContent?.includes("Hold to deploy"),
          );
          const statuses = root.querySelectorAll("[role=status]");
          const status = statuses[statuses.length - 1];
          if (!button || !status) throw new Error("fuse or status missing");
          let burnt = false;
          const watch = new MutationObserver(() => {
            const text = status.textContent ?? "";
            if (/deployed/i.test(text)) burnt = true;
            if (burnt && /the fuse is/i.test(text)) {
              watch.disconnect();
              button.click();
              resolve();
            }
          });
          watch.observe(status, {
            subtree: true,
            childList: true,
            characterData: true,
          });
          button.click();
        }),
    );
    // Once the fresh cord is in, a held Space burns it through as ever. The
    // wait is for the re-lay's own fade, which nothing on the page reports.
    await page.waitForTimeout(1500);
    await fuse.focus();
    await page.keyboard.down(" ");
    await expect(line).toHaveText(/burning/i);
    await expect(line).toHaveText(/deployed/i, { timeout: 30_000 });
    await page.keyboard.up(" ");
  });
});
