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
    // The stage grows out of the card, so its width is read once it lands.
    const dialog = dialogOf(page, "Gel Switch");
    await expect
      .poll(async () => (await dialog.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(389);
  });
});

/** A component's docs-page stage: its demo, with the demo's status line. */
const pressStage = (page: Page): Locator =>
  page.locator("[data-specimen-stage]").first();

/**
 * Opens a component on the gallery stage with tweaks from the deep link. The
 * stage grows out of its card, so nothing on it is pressed or measured until
 * two readings of its box, a poll apart, agree.
 */
const pressOnStage = async (
  page: Page,
  slug: string,
  title: string,
  tweaks: string,
): Promise<Locator> => {
  await gotoHydrated(page, `/tactile?b=${slug}&t=${tweaks}`);
  const dialog = dialogOf(page, title);
  await expect(dialog).toBeVisible();
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
      { intervals: [100] },
    )
    .toBe(true);
  return dialog.locator("[data-specimen-stage]");
};

/** The pointer comes in, goes down on the middle of the target and wavers there, still held. */
const pressDown = async (page: Page, target: Locator) => {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to press");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 30, y + 20);
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(x + 1, y + 1, { steps: 2 });
  await page.mouse.move(x - 1, y, { steps: 2 });
};

/** A whole pointer press: in, down, a waver, and up. */
const pressTap = async (page: Page, target: Locator) => {
  await pressDown(page, target);
  await page.mouse.up();
};

/** An element's top edge, for mechanics that are a distance. */
const pressTop = async (target: Locator) =>
  (await target.boundingBox())?.y ?? Number.NaN;

type PressLog = [text: string, at: number][];

/**
 * Starts a log of every text an element (or one part of it) shows, stamped
 * with the page's own clock, so a timed behaviour is measured where it runs.
 */
const pressLog = async (target: Locator, part?: string) => {
  await target.evaluate((el, sel) => {
    const read = () => (sel ? el.querySelector(sel) : el)?.textContent ?? "";
    const log: [string, number][] = [[read(), performance.now()]];
    Object.assign(el, { pressLog: log });
    new MutationObserver(() => {
      const text = read();
      if (text !== log[log.length - 1]?.[0]) {
        log.push([text, performance.now()]);
      }
    }).observe(el, { subtree: true, childList: true, characterData: true });
  }, part);
  return () =>
    target.evaluate((el) => (el as unknown as { pressLog: PressLog }).pressLog);
};

/** The page's own clock, in ms. */
const pressNow = (page: Page) => page.evaluate(() => performance.now());

/**
 * How long after `since` a text first showed. Measured from a moment read
 * just before the press, so a busy page's late re-render can only lengthen
 * it, never shorten it.
 */
const pressTook = (log: PressLog, text: string, since: number) => {
  const hit = log.find(([t, at]) => t === text && at >= since);
  if (!hit) throw new Error(`"${text}" never showed`);
  return hit[1] - since;
};

/** Waits on the page's own clock until `ms` have passed since a log's last entry. */
const pressAfter = async (
  page: Page,
  log: () => Promise<PressLog>,
  ms: number,
) => {
  const entries = await log();
  const since = entries[entries.length - 1]?.[1] ?? 0;
  await expect
    .poll(() => pressNow(page), { intervals: [50] })
    .toBeGreaterThan(since + ms);
};

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
