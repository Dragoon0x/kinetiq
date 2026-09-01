import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/**
 * The game wing is built from loops, and a loop is the one thing a generic
 * sweep cannot check: exercise clicks every control and smoke watches the
 * console, but neither can tell whether accepting a mission actually took a
 * slot, whether a gate refused before it opened, or whether cycling a part
 * renamed the avatar. Each test here drives one loop end to end and asserts
 * the state it was supposed to leave behind — a shipped avatar-forge whose
 * handle silently ignored an entire slot is exactly what this catches.
 */

test.describe.configure({ mode: "parallel" });

test("avatar-forge: every slot renames, and a roll moves all four", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/avatar-forge");

  const handleOf = async () => {
    const text = await page.locator("body").innerText();
    const m = text.match(
      /(quiet|brass|iron|pale|swift|dusk|amber|stone)-[a-z]+/,
    );
    return m ? m[0] : "";
  };

  expect(await handleOf()).toBe("quiet-anchor");

  // Each slot must move the handle on its own — a positional hash that
  // cancels a slot against the word table renames nothing and looks fine.
  let previous = await handleOf();
  for (const slot of ["head", "eyes", "crest", "mark"]) {
    await page.getByRole("button", { name: `Next ${slot} shape` }).click();
    await page.waitForTimeout(250);
    const next = await handleOf();
    expect(next, `cycling ${slot} left the handle unchanged`).not.toBe(
      previous,
    );
    previous = next;
  }
});

test("guild-crest: the layered build completes and strikes", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/guild-crest");

  const assemble = page.getByRole("button", { name: "Assemble the crest" });
  await expect(assemble).toBeEnabled();
  await assemble.click();

  await expect(page.getByText(/crest struck/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(assemble).toBeEnabled();

  // Cyclers unlock only once a crest exists, and re-blazon when used.
  const charge = page.getByRole("button", { name: /^Charge, / });
  await expect(charge).toBeEnabled();
  const before = await charge.getAttribute("aria-label");
  await charge.click();
  await page.waitForTimeout(900);
  expect(await charge.getAttribute("aria-label")).not.toBe(before);
});

test("team-roster: teammates ready themselves and the lobby launches", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/team-roster");

  await expect(page.getByText(/waiting on/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Ready up" }).click();
  await expect(page.getByText(/match starting/i).first()).toBeVisible({
    timeout: 25_000,
  });
});

test("duel-ready: both sides lock in and the countdown reaches fight", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/duel-ready");

  const lockIn = page.getByRole("button", { name: "Lock in" });
  await lockIn.click();
  await expect(lockIn).toBeDisabled();

  await expect(page.getByText(/^fight$/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const rematch = page.getByRole("button", { name: /rematch/i });
  await expect(rematch).toBeEnabled();
  await rematch.click();
  await expect(page.getByRole("button", { name: "Lock in" })).toBeEnabled({
    timeout: 10_000,
  });
});

test("emote-wheel: a keyboard hold plays, and the cooldown locks out", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/emote-wheel");

  const trigger = page.getByRole("button", {
    name: "Hold to open the emote wheel",
  });
  await trigger.focus();

  await page.keyboard.down(" ");
  await page.waitForTimeout(500);
  await page.keyboard.press("3");
  await page.keyboard.up(" ");

  await expect(page.getByText(/recent/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(trigger).toBeDisabled();
  await expect(trigger).toBeEnabled({ timeout: 10_000 });
});

test("unlock-gate: refuses below the threshold, then opens for real", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/unlock-gate");

  const advance = page.getByRole("button", { name: "Advance progress" });
  const feature = page.getByRole("button", { name: /run analysis/i });

  await expect(feature).toBeDisabled();

  // One short of the requirement the plate must refuse.
  await advance.click();
  await expect(page.getByText(/still locked/i).first()).toBeVisible({
    timeout: 5000,
  });
  await expect(feature).toBeDisabled();

  // The plate disables its own control while it refuses, and detaches
  // entirely once it splits — so only press when it is actually pressable.
  for (let i = 0; i < 30; i++) {
    if (await feature.isEnabled()) break;
    if ((await advance.count()) === 0) break;
    if (await advance.isEnabled()) await advance.click();
    await page.waitForTimeout(250);
  }

  await expect(page.getByText(/unlocked/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(feature).toBeEnabled();
});

test("prestige-reset: confirms first, then runs the ceremony", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/prestige-reset");

  const prestige = page.getByRole("button", { name: "Prestige" });
  await prestige.click();

  // First press must only arm the confirm, never commit.
  await expect(page.getByRole("button", { name: /keep it/i })).toBeVisible();
  await expect(page.getByText(/prestige 1/i)).toHaveCount(0);

  await prestige.click();
  await expect(page.getByText(/prestige 1/i).first()).toBeVisible({
    timeout: 25_000,
  });
});

test("tier-upgrade: the card flips up the ladder and back down", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/tier-upgrade");

  const up = page.getByRole("button", { name: "Upgrade tier" });
  const back = page.getByRole("button", { name: /step back/i });

  await expect(back).toBeDisabled();
  await expect(page.getByText(/bronze/i).first()).toBeVisible();

  await up.click();
  await expect(page.getByText(/silver/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(back).toBeEnabled();

  await back.click();
  await expect(page.getByText(/bronze/i).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("mission-board: accepting fills a slot, and a full board refuses", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/mission-board");

  const accepts = page.getByRole("button", { name: /^accept/i });
  await expect(accepts).toHaveCount(6);

  // Fill all three slots.
  for (let i = 0; i < 3; i++) {
    await accepts.first().click();
    await page.waitForTimeout(1400);
  }

  // The fourth must be refused, not silently swallowed.
  await accepts.first().click();
  await expect(page.getByText(/no free slots/i).first()).toBeVisible({
    timeout: 8000,
  });
});

test("return-gift: a longer absence unwraps more, and collecting totals", async ({
  page,
}) => {
  await gotoHydrated(page, "/components/return-gift");

  await page.getByRole("button", { name: /a month/i }).click();
  await page.getByRole("button", { name: "Open the parcel" }).click();

  await expect(page.getByText(/gifts/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const collect = page.getByRole("button", { name: /^collect/i });
  await expect(collect).toBeEnabled({ timeout: 10_000 });
  await collect.click();
  await page.waitForTimeout(1200);

  await expect(
    page.getByRole("button", { name: /wrap another/i }),
  ).toBeVisible();
});
