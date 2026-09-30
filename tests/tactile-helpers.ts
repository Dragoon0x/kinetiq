// Tactile test helpers shared by the gallery spec and the per-family specs:
// audio counting, the docs stage and the gallery stage, patient loading,
// and status logs stamped with the page's own clock.
import { expect, type Locator, type Page } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/** Counts AudioContexts, so a test can prove none exist before a gesture. */
export const countAudio = async (page: Page) => {
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

export const audioContexts = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __audioContexts: number }).__audioContexts,
  );

export const dialogOf = (page: Page, name: string): Locator =>
  page.getByRole("dialog", { name });

/** A component's docs-page stage: its demo, with the demo's status line. */
export const pressStage = (page: Page): Locator =>
  page.locator("[data-specimen-stage]").first();

/**
 * Opens a component on the gallery stage with tweaks from the deep link. The
 * stage grows out of its card, so nothing on it is pressed or measured until
 * two readings of its box, a poll apart, agree.
 */
export const pressOnStage = async (
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
export const pressDown = async (page: Page, target: Locator) => {
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
export const pressTap = async (page: Page, target: Locator) => {
  await pressDown(page, target);
  await page.mouse.up();
};

/** An element's top edge, for mechanics that are a distance. */
export const pressTop = async (target: Locator) =>
  (await target.boundingBox())?.y ?? Number.NaN;

export type PressLog = [text: string, at: number][];

/**
 * Starts a log of every text an element (or one part of it) shows, stamped
 * with the page's own clock, so a timed behaviour is measured where it runs.
 */
export const pressLog = async (target: Locator, part?: string) => {
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
export const pressNow = (page: Page) => page.evaluate(() => performance.now());

/**
 * How long after `since` a text first showed. Measured from a moment read
 * just before the press, so a busy page's late re-render can only lengthen
 * it, never shorten it.
 */
export const pressTook = (log: PressLog, text: string, since: number) => {
  const hit = log.find(([t, at]) => t === text && at >= since);
  if (!hit) throw new Error(`"${text}" never showed`);
  return hit[1] - since;
};

/** Waits on the page's own clock until `ms` have passed since a log's last entry. */
export const pressAfter = async (
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
 * Loads a page and waits for hydration, patiently: the test server can take
 * a while to answer while it compiles.
 */
export const holdGoto = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("body[data-hydrated]", { timeout: 120_000 });
};
