// Device-level probes for the practical wing: forty instruments whose worth
// is entirely in what they do, not in what they render. Each test drives one
// component's core mechanic end to end — preferring the keyboard path where the
// component publishes one — and reads the outcome off the demo's own status
// line, the value it committed, or the ARIA state it flipped.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoHydrated } from "./helpers";

/** The docs page renders the demo inline inside this stage. */
const stageOf = (page: Page): Locator =>
  page.locator("[data-specimen-stage]").first();

/**
 * Several of these components publish an sr-only `role="status"` of their own,
 * and every demo closes with its own status line — which is always last in the
 * demo's tree, after the component it is reporting on.
 */
const demoStatus = (stage: Locator): Locator =>
  stage.locator("[role='status']").last();

// Families append their describe blocks below, one test per instrument.

/**
 * The balances family draws money, so its outcomes are figures: the amount a
 * roll landed on, the account a deck brought forward, the total a posting moved
 * the tally to. Every test drives the mechanic the component advertises —
 * through the keyboard wherever it publishes one — and reads the result off the
 * demo's status line and the ARIA the component publishes about itself.
 */
test.describe("balances", () => {
  test("balance-roll: a credit rolls the figure and raises a chip the mask takes away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/balance-roll");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component announces its own settled change before the demo's line.
    const announced = stage.locator("[role='status']").first();
    // The name carries the amount, so it is read by what it says, not by index.
    const figure = stage.getByRole("button", {
      name: /Hide balance|Show balance/,
    });

    await expect(status).toContainText("Balance $8,412.60");
    await expect(figure).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toBeEmpty();

    await stage.getByRole("button", { name: "Credit" }).click();
    await expect(status).toContainText("Balance $8,652.60 · last +$240.00");
    await expect(announced).toHaveText(
      "Available balance $8,652.60, up $240.00",
    );
    await expect(figure).toHaveAccessibleName("$8,652.60. Hide balance.");
    // The chip is aria-hidden decoration, so it is read off the page instead.
    const chip = stage.getByText("+$240.00", { exact: true });
    await expect(chip).toBeVisible();

    // Masking rolls every column past 9 to the bullet, and takes the chip with
    // it: a hidden balance that still advertises its movement is not hidden.
    await figure.focus();
    await page.keyboard.press("Enter");
    await expect(figure).toHaveAttribute("aria-pressed", "true");
    await expect(figure).toHaveAccessibleName("Balance hidden. Show balance.");
    await expect(status).toContainText("Balance hidden");
    await expect(chip).toHaveCount(0);
    // A masked balance says nothing, rather than announcing a number it hides.
    await expect(announced).toBeEmpty();

    // Space is the other half of the same press, and the figure comes back.
    await page.keyboard.press(" ");
    await expect(figure).toHaveAttribute("aria-pressed", "false");
    await expect(figure).toHaveAccessibleName("$8,652.60. Hide balance.");
    await expect(status).toContainText("Balance $8,652.60");

    // A debit gets the same physics in the other direction, and the same words.
    await stage.getByRole("button", { name: "Debit" }).click();
    await expect(status).toContainText("Balance $8,590.20 · last -$62.40");
    await expect(announced).toHaveText(
      "Available balance $8,590.20, down $62.40",
    );
  });

  test("account-deck: arrows walk the deck and the pick centres with its balance", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/account-deck");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const deck = stage.getByRole("radiogroup", { name: "Waylight Pay" });
    const everyday = deck.getByRole("radio", { name: /Everyday/ });
    const rainy = deck.getByRole("radio", { name: /Rainy Day/ });
    const travel = deck.getByRole("radio", { name: /Travel Pot/ });
    const ops = deck.getByRole("radio", { name: /Fieldline Ops/ });

    await expect(status).toContainText("Account Everyday · $8,412.60");
    await expect(everyday).toHaveAttribute("aria-checked", "true");
    // The card's name spells the account out, so the reading never depends on
    // the rolling figure underneath the deck.
    await expect(everyday).toHaveAccessibleName(
      "Current Everyday •• 4182 $8,412.60",
    );

    // Activation follows focus: the arrow both moves and picks.
    await everyday.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rainy).toBeFocused();
    await expect(rainy).toHaveAttribute("aria-checked", "true");
    await expect(everyday).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Account Rainy Day · $12,940.00");

    // End jumps to the outer account, and the deck does not wrap past it.
    await page.keyboard.press("End");
    await expect(travel).toBeFocused();
    await expect(status).toContainText("Account Travel Pot · $640.00");
    await page.keyboard.press("ArrowRight");
    await expect(travel).toBeFocused();
    await expect(travel).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(everyday).toBeFocused();
    await expect(status).toContainText("Account Everyday · $8,412.60");

    // Two steps in, and the strip has carried that card to the middle.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(ops).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Account Fieldline Ops · $3,208.45");
    await expect(announced).toHaveText("Fieldline Ops, $3,208.45");

    const offCentre = async (): Promise<number> => {
      const frame = await deck.boundingBox();
      const card = await ops.boundingBox();
      if (!frame || !card) return 9999;
      return Math.abs(card.x + card.width / 2 - (frame.x + frame.width / 2));
    };
    await expect.poll(offCentre, { timeout: 5000 }).toBeLessThan(6);

    // The pointer picks the same way the keys do. The press lands last: a card
    // that is half out of the clipped frame makes Playwright scroll the frame
    // to reach it, which is a reach no hand has, and it leaves the strip
    // offset — so nothing is measured after this.
    await rainy.click();
    await expect(rainy).toHaveAttribute("aria-checked", "true");
    await expect(ops).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Account Rainy Day · $12,940.00");
  });

  test("ledger-line: a row opens where it stands, Escape shuts it, and the pending row settles", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/ledger-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const fernworks = stage.getByRole("button", { name: /^Fernworks Supply/ });
    const basinworks = stage.getByRole("button", {
      name: /^Basinworks Exchange/,
    });

    await expect(status).toContainText("Open Fernworks Supply · 1 pending");
    await expect(fernworks).toHaveAttribute("aria-expanded", "true");
    await expect(
      stage.getByRole("region", { name: "Fernworks Supply" }),
    ).toContainText("REF 4K2-8810");
    // Pending is a word in the row's own name, never a colour or a shimmer.
    await expect(basinworks).toHaveAccessibleName(/Pending/);

    // One row is open at a time: opening this one shuts the one that was.
    await basinworks.click();
    await expect(basinworks).toHaveAttribute("aria-expanded", "true");
    await expect(fernworks).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("Open Basinworks Exchange");
    const panel = stage.getByRole("region", { name: "Basinworks Exchange" });
    await expect(panel).toContainText("Services");
    await expect(panel).toContainText("$6,061.00");
    await expect(panel).toContainText("REF 4K2-8797");

    // Escape closes the open row and leaves the focus on it.
    await page.keyboard.press("Escape");
    await expect(basinworks).toHaveAttribute("aria-expanded", "false");
    await expect(basinworks).toBeFocused();
    await expect(status).toContainText("All rows closed · 1 pending");
    // A collapsed panel is out of the tree, so nothing inside it is reachable.
    await expect(stage.getByRole("region")).toHaveCount(0);

    // Settling stamps the tick and takes the shimmer with it.
    await stage.getByRole("button", { name: "Settle pending" }).click();
    await expect(basinworks).toHaveAccessibleName(/Settled$/);
    await expect(status).toContainText("0 pending");
  });

  test("running-tally: postings arrive on their own side and the oldest row leaves", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/running-tally");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const list = stage.getByRole("list", { name: "Cleared today" });
    const credit = stage.getByRole("button", { name: "Post credit" });
    const debit = stage.getByRole("button", { name: "Post debit" });
    const newest = list.getByRole("listitem").first();

    await expect(status).toContainText("Total $1,180.00 · 0 posted");
    await expect(list).toContainText("No movements yet.");

    await credit.click();
    await expect(status).toContainText(
      "Total $1,660.00 · 1 posted · last credit",
    );
    await expect(announced).toHaveText(
      "Total $1,660.00 after a credit of $480.00",
    );
    await expect(newest).toContainText("Waylight payout");
    await expect(newest).toContainText("+$480.00");
    // The direction is spoken as well as drawn: the arrow carries the word.
    await expect(newest.getByRole("img")).toHaveAccessibleName("Credit");

    await debit.click();
    await expect(status).toContainText(
      "Total $1,618.80 · 2 posted · last debit",
    );
    await expect(announced).toHaveText(
      "Total $1,618.80 after a debit of $41.20",
    );
    await expect(newest).toContainText("Card payment");
    await expect(newest).toContainText("-$41.20");
    await expect(newest.getByRole("img")).toHaveAccessibleName("Debit");

    // Past max=5 the oldest row leaves, though the count still knows about it.
    for (let post = 0; post < 4; post += 1) await debit.click();
    await expect(status).toContainText(
      "Total $1,239.10 · 6 posted · last debit",
    );
    await expect(list.getByRole("listitem")).toHaveCount(5, { timeout: 5000 });
    await expect(list).not.toContainText("Waylight payout");
    await expect(stage.getByText("6 entries")).toBeVisible();
  });

  test("statement-fold: the letter opens on three panels and Escape folds it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/statement-fold");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const header = stage.getByRole("button", {
      name: /^August 2026 statement/,
    });

    await expect(status).toContainText("August · open · net +$1,284.20");
    await expect(header).toHaveAttribute("aria-expanded", "true");
    const panels = stage.getByRole("region", { name: "August 2026 statement" });
    await expect(panels).toContainText("+$6,480.00");
    await expect(panels).toContainText("-$5,195.80");
    await expect(panels).toContainText("+$1,284.20");

    // Escape folds the card and hands the focus back to the header.
    await header.focus();
    await page.keyboard.press("Escape");
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header).toBeFocused();
    await expect(status).toContainText("August · folded");
    await expect(stage.getByRole("region")).toHaveCount(0);

    // Stepping months keeps the fold state; a deficit month reads as a deficit.
    await stage.getByRole("button", { name: "Previous month" }).click();
    const july = stage.getByRole("button", { name: /^July 2026 statement/ });
    await expect(july).toHaveAttribute("aria-expanded", "false");
    await expect(july).toHaveAccessibleName(/-\$282\.10$/);
    await expect(status).toContainText("July · folded · net -$282.10");

    await july.click();
    await expect(july).toHaveAttribute("aria-expanded", "true");
    await expect(
      stage.getByRole("region", { name: "July 2026 statement" }),
    ).toContainText("-$282.10");
    await expect(status).toContainText("July · open · net -$282.10");
  });

  test("reserve-gauge: a hold reads its reason, pins it, and hands its money back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/reserve-gauge");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const bar = stage.getByRole("group", { name: "Coldbrook current account" });
    const holds = bar.getByRole("button");
    const fuel = bar.getByRole("button", { name: /Waylight Fuel/ });
    const transfer = bar.getByRole("button", { name: /Fernworks rent/ });
    // The solid run is the only cobalt fill inside the track.
    const runWidth = async (): Promise<number> =>
      bar
        .locator("span.bg-cobalt-bright")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width);

    await expect(status).toContainText("Available 966.20 · 3 holds 318.40");
    await expect(holds).toHaveCount(3);
    await expect(announced).toHaveText(
      "$966.20 available of $1,284.60, $318.40 held",
    );
    await expect(fuel).toHaveAccessibleName(
      "Card pre-authorisation, Waylight Fuel. $84.00 held, clears Thursday.",
    );
    const before = await runWidth();

    // Tabbing to a segment reads it; Right steps to the next one along.
    await fuel.focus();
    await expect(status).toContainText(
      "reading Card pre-authorisation, Waylight Fuel",
    );
    await page.keyboard.press("ArrowRight");
    await expect(transfer).toBeFocused();
    await expect(status).toContainText(
      "reading Outbound transfer, Fernworks rent",
    );

    // Space pins the reason open so touch and keyboard get what hover gives.
    await page.keyboard.press("Space");
    await expect(transfer).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(transfer).toHaveAttribute("aria-pressed", "false");

    // Clearing the oldest hold slides its money across into the solid run.
    await stage.getByRole("button", { name: "Clear oldest" }).click();
    await expect(holds).toHaveCount(2, { timeout: 5000 });
    await expect(status).toContainText("Available 1050.20 · 2 holds 234.40");
    await expect(announced).toHaveText(
      "$1,050.20 available of $1,284.60, $234.40 held",
    );
    await expect.poll(runWidth, { timeout: 5000 }).toBeGreaterThan(before + 15);
  });

  test("balance-compare: the line draws on focus, pins on a press, and re-slopes", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/balance-compare");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const plot = stage.getByRole("button", { name: /^Fernworks payouts\./ });

    // Before anything is read the figures stand, but no line is drawn.
    await expect(status).toContainText("Aug 4690.50 · up 13.8% on jul");
    await expect(status).not.toContainText("line drawn");
    await expect(plot).toHaveAttribute("aria-pressed", "false");
    await expect(plot).toHaveAccessibleName(
      "Fernworks payouts. Jul $4,120.00, Aug $4,690.50, up 13.8%.",
    );

    // Tabbing to it draws the line, exactly as pointing at it would.
    await plot.focus();
    await expect(status).toContainText("line drawn");

    // Enter pins it, Escape releases the pin without taking the focus away.
    await page.keyboard.press("Enter");
    await expect(plot).toHaveAttribute("aria-pressed", "true");
    await expect(plot).toContainText("Pinned");
    await page.keyboard.press("Escape");
    await expect(plot).toHaveAttribute("aria-pressed", "false");
    await expect(plot).toContainText("Compare");
    await expect(status).toContainText("line drawn");

    // Focus gone, the line goes with it: it was a reading, not a latch.
    await page.keyboard.press("Tab");
    await expect(status).not.toContainText("line drawn");

    // A new figure re-slopes the line and turns the direction round.
    const next = stage.getByRole("button", { name: "Next August" });
    await next.click();
    await expect(status).toContainText("Aug 3566.40 · down 13.4% on jul");
    await expect(plot).toHaveAccessibleName(
      "Fernworks payouts. Jul $4,120.00, Aug $3,566.40, down 13.4%.",
    );

    // Level is its own reading, not a zero percent climb.
    await next.click();
    await expect(status).toContainText("Aug 4120.00 · level on jul");
    await expect(plot).toHaveAccessibleName(
      "Fernworks payouts. Jul $4,120.00, Aug $4,120.00, level.",
    );
  });

  test("cash-clock: a scheduled outgoing toggles the projection and the cycle advances", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/cash-clock");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const ring = stage.getByRole("meter", { name: "Waylight Pay cycle" });
    const rent = stage.getByRole("checkbox", {
      name: /^Rent, Fernworks Lofts/,
    });

    await expect(status).toContainText(
      "Projected 1055.60 at payday · 12 days · 4 of 4 scheduled",
    );
    await expect(ring).toHaveAttribute("aria-valuenow", "18");
    await expect(ring).toHaveAttribute("aria-valuemax", "30");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "12 days to payday, day 18 of 30. Projected balance $1,055.60.",
    );
    await expect(rent).toHaveAccessibleName(
      "Rent, Fernworks Lofts, $1,150.00, lands in 3 days",
    );
    await expect(rent).toBeChecked();

    // Space on the real checkbox lifts that outgoing out of the projection.
    await rent.focus();
    await page.keyboard.press("Space");
    await expect(rent).not.toBeChecked();
    await expect(status).toContainText(
      "Projected 2205.60 at payday · 12 days · 3 of 4 scheduled",
    );
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "12 days to payday, day 18 of 30. Projected balance $2,205.60.",
    );

    // Unchecking is not a one-way door: the projection rolls back down.
    await page.keyboard.press("Space");
    await expect(rent).toBeChecked();
    await expect(status).toContainText(
      "Projected 1055.60 at payday · 12 days · 4 of 4 scheduled",
    );

    // Advancing the cycle lands what was due and moves the arc with it.
    await stage.getByRole("button", { name: "Advance 3 days" }).click();
    await expect(ring).toHaveAttribute("aria-valuenow", "21");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "9 days to payday, day 21 of 30. Projected balance $1,055.60.",
    );
    await expect(status).toContainText(
      "Projected 1055.60 at payday · 9 days · 3 of 3 scheduled",
    );
    await expect(rent).toHaveCount(0);
  });

  test("multi-currency: a lane climbs to the top and a refreshed rate rolls its total", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/multi-currency");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const stack = stage.getByRole("listbox", { name: "Basinworks wallet" });
    const lanes = stack.getByRole("option");
    const waylight = stack.getByRole("option", { name: /^WAY Waylight/ });

    await expect(status).toContainText(
      "Top lane FRN · 4210.00 FRN = 5406.90 CBK · rate 1.2843",
    );
    await expect(lanes.first()).toHaveAccessibleName(
      "FRN Fernwork 4,210.00 FRN",
    );
    await expect(lanes.first()).toHaveAttribute("aria-selected", "true");
    await expect(stack).toContainText("1 FRN = 1.2843 CBK");

    // One Tab stop: Down walks the lanes, and only a press brings one up.
    await lanes.first().focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(waylight).toBeFocused();
    await expect(waylight).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("Space");
    await expect(waylight).toHaveAttribute("aria-selected", "true");
    // The chosen lane is the one on top; the rest close the gap under it.
    await expect(lanes.first()).toHaveAccessibleName(
      "WAY Waylight 22,640.00 WAY",
    );
    await expect(status).toContainText(
      "Top lane WAY · 22640.00 WAY = 1616.50 CBK · rate 0.0714",
    );
    await expect(announced).toHaveText(
      "Waylight on top. 22,640.00 WAY is 1,616.50 CBK at 0.0714.",
    );
    await expect(stack).toContainText("1 WAY = 0.0714 CBK");

    // A new rate table rolls the converted figure without moving the lanes.
    await stage.getByRole("button", { name: "Refresh rates" }).click();
    await expect(stack).toContainText("1 WAY = 0.0722 CBK");
    await expect(status).toContainText(
      "Top lane WAY · 22640.00 WAY = 1634.61 CBK · rate 0.0722",
    );
    await expect(announced).toHaveText(
      "Waylight on top. 22,640.00 WAY is 1,634.61 CBK at 0.0722.",
    );
    await expect(lanes.first()).toHaveAccessibleName(
      "WAY Waylight 22,640.00 WAY",
    );
  });

  test("balance-mask: holding shows the figure, releasing hides it, Space latches it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/balance-mask");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const mask = stage.getByRole("button", {
      name: /^(Show|Hide) Available balance$/,
    });

    await expect(status).toContainText("Balance hidden · hold or press space");
    await expect(mask).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toHaveText("Available balance hidden");

    // A hold shows the figure and letting go puts the mask back.
    const box = await mask.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await expect(mask).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Balance shown · 12480.90");
    await page.mouse.up();
    await expect(mask).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("Balance hidden");

    // Space latches the reveal instead of holding it.
    await mask.focus();
    await page.keyboard.press("Space");
    await expect(mask).toHaveAttribute("aria-pressed", "true");
    await expect(mask).toHaveAccessibleName("Hide Available balance");
    await expect(announced).toHaveText("Available balance $12,480.90");

    // A longer figure arrives behind the same control, still shown.
    await stage.getByRole("button", { name: "Pay in 420.00" }).click();
    await expect(status).toContainText("Balance shown · 12900.90");
    await expect(announced).toHaveText("Available balance $12,900.90");

    // Escape hides, which is the whole point of the control.
    await mask.focus();
    await page.keyboard.press("Escape");
    await expect(mask).toHaveAttribute("aria-pressed", "false");
    await expect(mask).toHaveAccessibleName("Show Available balance");
    await expect(status).toContainText("Balance hidden · hold or press space");
  });
});
