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

/**
 * The transfers family moves money, so its outcomes are commitments: the step a
 * flow refuses to leave, the digit a pad will not take, the notch a slider parks
 * at. Every test drives the mechanic the component advertises — through the
 * keyboard wherever it publishes one — and reads the result off the demo's
 * status line and the ARIA the component publishes about itself.
 */
test.describe("transfers", () => {
  test("send-flow: the flow walks payee to review, and send is refused until the figure lands", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/send-flow");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card speaks its own step before the demo's line reports it.
    const announced = stage.locator("[role='status']").first();
    const mara = stage.getByRole("radio", { name: "Mara Vance @mara.v" });
    const iyad = stage.getByRole("radio", { name: "Iyad Sorel @sorel" });
    // One control carries the step forward, and its name says which step it is.
    const primary = stage.getByRole("button", {
      name: /^(Next|Send \$|Start another)/,
    });

    await expect(status).toContainText("Step 1 of 3 · to unset · $0.00");
    await expect(announced).toHaveText("Step 1 of 3, Payee");
    // Nothing chosen: Next keeps its place and says why rather than vanishing.
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    // Activation follows focus in the payee group: the arrow moves and chooses.
    await mara.focus();
    await page.keyboard.press("ArrowDown");
    await expect(iyad).toBeFocused();
    await expect(iyad).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("to Iyad Sorel");
    await page.keyboard.press("ArrowUp");
    await expect(mara).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Step 1 of 3 · to Mara Vance · $0.00");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");

    await primary.click();
    await expect(status).toContainText("Step 2 of 3 · to Mara Vance · $0.00");
    await expect(announced).toHaveText("Step 2 of 3, Amount");
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    // Over the balance the flow refuses to go on, and the field says the reason
    // rather than only turning red.
    const field = stage.getByLabel("Amount for Mara Vance");
    await expect(field).toHaveAccessibleDescription("Enter an amount");
    await field.fill("2000");
    await expect(status).toContainText("$2000.00");
    await expect(field).toHaveAccessibleDescription(
      "That is more than the balance",
    );
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    const preset = stage.getByRole("button", { name: "$50.00" });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    await expect(field).toHaveValue("50");
    await expect(field).toHaveAccessibleDescription("Balance $1284.50");
    await expect(status).toContainText("Step 2 of 3 · to Mara Vance · $50.00");

    // The arming window is about 700ms of recoil, which a poll could arrive too
    // late to see. The button is the same node across every step, so its
    // refusal is recorded as it happens and read back once the figure is down.
    await primary.evaluate((element) => {
      const read = () => element.getAttribute("aria-disabled") ?? "armed";
      const trail: string[] = [read()];
      new MutationObserver(() => {
        if (trail[trail.length - 1] !== read()) trail.push(read());
      }).observe(element, {
        attributes: true,
        attributeFilter: ["aria-disabled"],
      });
      (window as unknown as { __armTrail: string[] }).__armTrail = trail;
    });

    await primary.click();
    await expect(status).toContainText("Step 3 of 3 · to Mara Vance · $50.00");
    await expect(announced).toHaveText("Step 3 of 3, Review");
    await expect(primary).toHaveAccessibleName("Send $50.00");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true", {
      timeout: 5000,
    });
    const armTrail = await page.evaluate(
      () => (window as unknown as { __armTrail?: string[] }).__armTrail ?? [],
    );
    // Free on the amount step, refused on arrival at review, armed by the
    // landing: you cannot send a figure that is still moving.
    expect(armTrail).toEqual(["armed", "true", "armed"]);

    await primary.click();
    await expect(status).toContainText("Sent $50.00 to Mara Vance");
    await expect(announced).toHaveText("Sent $50.00 to Mara Vance");
    await expect(primary).toHaveAccessibleName("Start another");

    // Starting again walks back to the payee step without losing the payee.
    await primary.click();
    await expect(announced).toHaveText("Step 1 of 3, Payee");
    await expect(mara).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Step 1 of 3 · to Mara Vance · $50.00");
  });

  test("recipient-pick: arrows walk the faces, a press grows the chip, and the query filters the row", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/recipient-pick");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const field = stage.getByRole("textbox");
    const row = stage.getByRole("listbox", { name: "Send to recents" });
    const faces = row.getByRole("option");
    const mara = row.getByRole("option", { name: "Mara Vance @mara.v" });
    const tomas = row.getByRole("option", { name: "Tomas Renn @t.renn" });

    await expect(faces).toHaveCount(6);
    await expect(status).toContainText("No payee · 6 shown");
    await expect(announced).toHaveText(
      "6 of 6 recent payees shown, none chosen",
    );
    await expect(field).toHaveAccessibleDescription("6 of 6 recents");

    // Down enters the row, the arrows step it, and only a press chooses.
    await field.focus();
    await page.keyboard.press("ArrowDown");
    await expect(mara).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(tomas).toBeFocused();
    await expect(tomas).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("Enter");
    await expect(tomas).toHaveAttribute("aria-selected", "true");
    // Choosing hands the caret back so the flow carries on from the field.
    await expect(field).toBeFocused();
    await expect(status).toContainText("To Tomas Renn · @t.renn");
    await expect(announced).toHaveText("Sending to Tomas Renn, @t.renn");
    // The name and handle exist only on the chip, so the chip's growth is the
    // reveal: an unchosen face is still two letters.
    await expect(tomas).toContainText("@t.renn");
    await expect(mara).not.toContainText("Mara Vance");

    // Down re-enters at the chosen face, and the same press clears it.
    await page.keyboard.press("ArrowDown");
    await expect(tomas).toBeFocused();
    await page.keyboard.press(" ");
    await expect(tomas).toHaveAttribute("aria-selected", "false");
    await expect(tomas).not.toContainText("@t.renn");
    await expect(field).toBeFocused();
    await expect(status).toContainText("No payee · 6 shown");

    // Typing filters the row and the count is spoken, not only drawn.
    await field.fill("an");
    await expect(faces).toHaveCount(3, { timeout: 5000 });
    await expect(status).toContainText("No payee · 3 shown");
    await expect(announced).toHaveText(
      "3 of 6 recent payees shown, none chosen",
    );
    await expect(field).toHaveAccessibleDescription("3 of 6 recents");

    // Escape in the field clears the query and the row comes back whole.
    await page.keyboard.press("Escape");
    await expect(field).toHaveValue("");
    await expect(faces).toHaveCount(6, { timeout: 5000 });
    await expect(status).toContainText("No payee · 6 shown");

    // Nothing matched is said in words rather than left as an empty row.
    await field.fill("zzz");
    await expect(faces).toHaveCount(0, { timeout: 5000 });
    await expect(row).toContainText("No recent payee matches that.");
    await expect(status).toContainText("No payee · 0 shown");
  });

  test("amount-pad: keys and keystrokes build the figure, and the ceiling refuses rather than clamps", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/amount-pad");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const pad = stage.getByRole("group", { name: "To Basinworks Exchange" });
    // The figure is spoken once as a whole string; every drawn cell is hidden.
    const spoken = pad.locator("output span.sr-only");
    const key = (name: string) =>
      pad.getByRole("button", { name, exact: true });

    await expect(spoken).toHaveText("$0.00");
    await expect(status).toContainText("Amount $0.00 · limit $500.00");

    await key("1").click();
    await key("2").click();
    await key("4").click();
    await expect(spoken).toHaveText("$124.00");
    await expect(status).toContainText("Amount $124.00 · limit $500.00");

    // The point locks the cents: two digits fit behind it and no more.
    await key("Decimal point").click();
    await key("5").click();
    await key("0").click();
    await expect(spoken).toHaveText("$124.50");
    await expect(status).toContainText("Amount $124.50 · limit $500.00");
    await expect(key("7")).toHaveAttribute("aria-disabled", "true");
    await expect(key("Decimal point")).toHaveAttribute("aria-disabled", "true");
    // A spent key is refused through the keyboard too, rather than silently
    // swallowing the press. Delete is the one key the full cents leave live.
    await key("Delete").focus();
    await page.keyboard.press("7");
    await expect(spoken).toHaveText("$124.50");

    await key("Delete").click();
    await key("Delete").click();
    await expect(spoken).toHaveText("$124.00");
    await expect(status).toContainText("Amount $124.00");
    await expect(key("7")).not.toHaveAttribute("aria-disabled", "true");

    await stage.getByRole("button", { name: "Clear" }).click();
    await expect(spoken).toHaveText("$0.00");

    // Typed digits drive the same pad: the handler lives on the group, so the
    // keyboard reaches it through whichever key holds the focus.
    await key("1").focus();
    await page.keyboard.press("5");
    await page.keyboard.press("0");
    await page.keyboard.press("0");
    await expect(spoken).toHaveText("$500.00");
    await expect(status).toContainText("Amount $500.00 · limit $500.00");

    // Past the ceiling the press is refused, not clamped: the readout is never
    // a figure the payer cannot actually send.
    await page.keyboard.press(".");
    await page.keyboard.press("1");
    await expect(spoken).toHaveText("$500.00");
    await expect(stage.getByRole("alert")).toHaveText(
      "$500.10 is over the $500.00 limit",
    );
    await expect(status).toContainText("Amount $500.00 · refused $500.10");
  });

  test("transfer-track: the dot walks the rail, a refused hop holds it, and Retry lands it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/transfer-track");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const stops = stage.getByRole("listitem");
    // The travelling dot is the only size-4 disc on the rail; the stops are 2.
    const dot = stage.locator("span.size-4.rounded-full");
    const dotX = async (): Promise<number> => (await dot.boundingBox())?.x ?? 0;

    await expect(stops).toHaveCount(3);
    await expect(status).toContainText("sent · stamped 09:41");
    await expect(announced).toHaveText("Sent, stop 1 of 3");
    await expect(stops.nth(0)).toHaveAttribute("aria-current", "step");
    // The run is spoken as a word per stop, never by colour or position alone.
    await expect(stops.nth(0)).toContainText("current");
    await expect(stops.nth(0)).toContainText("09:41");
    await expect(stops.nth(2)).toContainText("waiting");
    const start = await dotX();

    await stage.getByRole("button", { name: "Advance" }).click();
    await expect(announced).toHaveText("On its way, stop 2 of 3");
    await expect(stops.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(1)).toContainText("current");
    // The stamp is the host's own string, so only its arrival is asserted.
    await expect(status).toContainText("on its way · stamped 09:41,");
    await expect.poll(dotX, { timeout: 5000 }).toBeGreaterThan(start + 20);

    // A refused hop holds the dot at the stop it truly reached.
    await stage.getByRole("button", { name: "Fail the hop" }).click();
    await expect(stage.getByRole("alert")).toHaveText(
      "Fernwork Supply refused the hop. Nothing left the account.",
    );
    await expect(stops.nth(1)).toContainText("held");
    await expect(announced).toHaveText("On its way: the next hop failed");
    await expect(status).toContainText(
      "Failed after on its way · retry offered",
    );
    const retry = stage.getByRole("button", { name: "Retry" });
    await expect(retry).toHaveAccessibleDescription(
      "Fernwork Supply refused the hop. Nothing left the account.",
    );

    await retry.click();
    await expect(retry).toHaveCount(0, { timeout: 5000 });
    await expect(stops.nth(2)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(2)).toContainText("reached");
    await expect(announced).toHaveText("Landed, stop 3 of 3");
    await expect(status).toContainText("landed · stamped 09:41,");
    await expect.poll(dotX, { timeout: 5000 }).toBeGreaterThan(start + 200);
  });

  test("split-bill: a key moves one share, the others give way, and the total never drifts", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/split-bill");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const mara = stage.getByRole("slider", { name: "Mara Vance" });
    const iyad = stage.getByRole("slider", { name: "Iyad Sorel" });
    const priya = stage.getByRole("slider", { name: "Priya Okonkwo" });
    const equalise = stage.getByRole("button", { name: "Equalise" });
    const percentOf = async (share: Locator): Promise<number> =>
      Number(await share.getAttribute("aria-valuenow"));

    // A share is spoken as money as well as a percentage.
    await expect(mara).toHaveAttribute("aria-valuetext", "40 percent, $59.36");
    await expect(status).toContainText(
      "Mara Vance leads · $59.36 of $148.40 · remainder $0.00",
    );
    await expect(announced).toHaveText(
      "Mara Vance has the largest share, $59.36 of $148.40, across 4 people",
    );
    await expect(equalise).toBeEnabled();

    // One arrow takes a cent of the bill from the others in proportion.
    await mara.focus();
    await page.keyboard.press("ArrowRight");
    await expect(mara).toHaveAttribute("aria-valuetext", "41 percent, $60.84");
    await expect(priya).toHaveAttribute("aria-valuetext", "15 percent, $21.89");
    await expect(status).toContainText("Mara Vance leads · $60.84 of $148.40");
    await expect(status).toContainText("remainder $0.00");

    // Home hands the whole share back, and the lead moves with the money.
    await page.keyboard.press("Home");
    await expect(mara).toHaveAttribute("aria-valuetext", "0 percent, $0.00");
    await expect(iyad).toHaveAttribute("aria-valuetext", "42 percent, $61.83");
    await expect(status).toContainText(
      "Iyad Sorel leads · $61.83 of $148.40 · remainder $0.00",
    );

    await equalise.click();
    await expect(mara).toHaveAttribute("aria-valuetext", "25 percent, $37.10");
    await expect(priya).toHaveAttribute("aria-valuetext", "25 percent, $37.10");
    await expect(status).toContainText(
      "Mara Vance leads · $37.10 of $148.40 · remainder $0.00",
    );
    // An even split has nothing left to equalise.
    await expect(equalise).toBeDisabled();
    await expect(stage.getByText("4 ways · remainder $0.00")).toBeVisible();

    // A plain tap still sets the share it landed on, dead centre of the track.
    await priya.click();
    await expect
      .poll(async () => percentOf(priya), {
        timeout: 5000,
      })
      .toBeGreaterThan(44);
    expect(await percentOf(priya)).toBeLessThan(56);
    await expect(status).toContainText("Priya Okonkwo leads");
    await expect(status).toContainText("remainder $0.00");
    await expect(equalise).toBeEnabled();
  });

  test("schedule-send: the knob opens the panel, the date steps, and the sentence rewrites", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/schedule-send");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The animated tokens are decoration; the settled sentence is this line.
    const sentence = stage.locator("[role='status']").first();
    const now = stage.getByRole("radio", { name: "Now" });
    const scheduled = stage.getByRole("radio", { name: "Scheduled" });
    const date = stage.getByRole("spinbutton", { name: "Send date" });

    await expect(sentence).toHaveText("Sends 240.00 now");
    await expect(status).toContainText("Waylight Pay 240.00 now");
    await expect(now).toHaveAttribute("aria-checked", "true");
    // A closed panel is out of the tree entirely, not merely off screen.
    await expect(date).toHaveCount(0);
    await expect(stage.getByRole("radio", { name: "Monthly" })).toHaveCount(0);

    await now.focus();
    await page.keyboard.press("ArrowRight");
    await expect(scheduled).toBeFocused();
    await expect(scheduled).toHaveAttribute("aria-checked", "true");
    await expect(date).toHaveAttribute("aria-valuenow", "1");
    await expect(date).toHaveAttribute(
      "aria-valuetext",
      "Tue 14 Apr, tomorrow",
    );
    await expect(sentence).toHaveText("Sends 240.00 on Tue 14 Apr");
    await expect(status).toContainText("Waylight Pay 240.00 day +1, once");

    // The date is a real spinbutton: a day, a week, and the far end.
    await date.focus();
    await page.keyboard.press("ArrowUp");
    await expect(date).toHaveAttribute("aria-valuenow", "2");
    await expect(date).toHaveAttribute(
      "aria-valuetext",
      "Wed 15 Apr, in 2 days",
    );
    await page.keyboard.press("PageUp");
    await expect(date).toHaveAttribute("aria-valuenow", "9");
    await expect(date).toHaveAttribute(
      "aria-valuetext",
      "Wed 22 Apr, in 9 days",
    );
    await page.keyboard.press("End");
    await expect(date).toHaveAttribute("aria-valuenow", "60");
    await expect(date).toHaveAttribute(
      "aria-valuetext",
      "Fri 12 Jun, in 60 days",
    );
    await expect(
      stage.getByRole("button", { name: "Later day" }),
    ).toBeDisabled();
    await page.keyboard.press("Home");
    await expect(date).toHaveAttribute("aria-valuenow", "1");
    await expect(
      stage.getByRole("button", { name: "Earlier day" }),
    ).toBeDisabled();

    // The repeat picker is the same instrument, and the sentence takes its word.
    await stage.getByRole("radio", { name: "Once" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(stage.getByRole("radio", { name: "Monthly" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(sentence).toHaveText(
      "Sends 240.00 on Tue 14 Apr then every month",
    );
    await expect(status).toContainText("Waylight Pay 240.00 day +1, monthly");

    // An input the picker does not own still rewrites the sentence.
    await stage.getByRole("button", { name: "Amount +50" }).click();
    await expect(sentence).toHaveText(
      "Sends 290.00 on Tue 14 Apr then every month",
    );
    await expect(status).toContainText("Waylight Pay 290.00 day +1, monthly");
  });

  test("transfer-receipt: the sheet unrolls, the reference types itself in, and the copy reports back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/transfer-receipt");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // Three live regions stand in the stage: the copy line inside the sheet,
    // the receipt's own settled line, and the demo's line last.
    const printed = stage.locator("[role='status']").nth(1);
    const sheet = stage.getByRole("region", { name: "Waylight Pay receipt" });

    await expect(status).toContainText("Waylight Pay idle");
    // Nothing is reserved for a receipt that has not printed.
    await expect(sheet).toHaveCount(0);
    await expect(printed).toBeEmpty();

    await stage.getByRole("button", { name: "Send 320.00" }).click();
    await expect(status).toContainText("Waylight Pay printed");
    await expect(sheet).toContainText("320.00");
    await expect(sheet).toContainText("Fernworks Supply");
    await expect(sheet).toContainText("•••• 4417");
    await expect(sheet).toContainText("320.40");
    await expect(sheet).toContainText("Within an hour");

    // The line waits for the typing to finish rather than announcing letters.
    await expect(printed).toHaveText("Receipt ready, reference WAY-4K7Q-2318", {
      timeout: 5000,
    });
    const copy = stage.getByRole("button", {
      name: "Copy reference WAY-4K7Q-2318",
    });
    await expect(copy).toContainText("WAY-4K7Q-2318");

    // A keyboard press copies. Automation may refuse the clipboard, and the
    // receipt is documented to report either answer rather than pretend.
    await copy.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText(
      /Waylight Pay (reference copied|copy blocked)/,
      { timeout: 5000 },
    );

    await stage.getByRole("button", { name: "New transfer" }).click();
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
    await expect(printed).toBeEmpty();
    await expect(status).toContainText("Waylight Pay idle");
  });

  test("limit-meter: the staged preview crosses the ceiling and a confirmed send joins the fill", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/limit-meter");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", {
      name: "Waylight Pay daily limit",
    });
    const confirm = stage.getByRole("button", { name: "Confirm" });

    await expect(meter).toHaveAttribute("aria-valuenow", "600");
    await expect(meter).toHaveAttribute("aria-valuemax", "2000");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "600.00 of 2,000.00 used, 250.00 staged, 1,150.00 left today",
    );
    await expect(status).toContainText("Waylight Pay staging 250.00");

    // Staging past the ceiling names the overage in money, never in colour.
    const stageUp = stage.getByRole("button", { name: "Stage +250" });
    for (let press = 0; press < 5; press += 1) await stageUp.click();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "600.00 of 2,000.00 used, 1,500.00 staged, over by 100.00",
    );
    // A meter may not report past its maximum, so the committed total stands.
    await expect(meter).toHaveAttribute("aria-valuenow", "600");
    await expect(status).toContainText("Waylight Pay over by 100.00");
    await expect(
      stage.getByText("Over by 100.00", { exact: true }),
    ).toBeVisible();
    await expect(confirm).toBeDisabled();

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "600.00 of 2,000.00 used, 250.00 staged, 1,150.00 left today",
    );
    await expect(confirm).toBeEnabled();

    // Confirming moves the staged amount into the fill as a send of its own.
    await confirm.click();
    await expect(meter).toHaveAttribute("aria-valuenow", "850");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "850.00 of 2,000.00 used, 1,150.00 left today",
    );
    await expect(status).toContainText("Waylight Pay 1,150.00 left");
    await expect(
      stage.getByText("850.00 of 2,000.00 sent", { exact: true }),
    ).toBeVisible();
    await expect(confirm).toBeDisabled();
  });

  test("confirm-slab: the track parks at the detent, Escape returns it, and Enter lands the send", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/confirm-slab");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slab = stage.getByRole("group", { name: "Confirm transfer" });
    const track = stage.getByRole("slider", { name: "Slide to send" });
    const percent = async (): Promise<number> =>
      Number(await track.getAttribute("aria-valuenow"));

    await expect(status).toContainText("Basinworks payout ready");
    await expect(track).toHaveAttribute("aria-valuenow", "0");
    await expect(track).toHaveAttribute("aria-valuetext", "0 percent slid");
    await expect(slab).toContainText("Coldbrook Bank");
    await expect(slab).toContainText("1,242.40");

    // The first press takes the thumb to the notch and no further.
    await track.focus();
    await page.keyboard.press("ArrowRight");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "Held at the detent, push past to send",
    );
    await expect(status).toContainText("Basinworks payout held at detent");
    await expect.poll(percent, { timeout: 5000 }).toBeGreaterThan(55);
    expect(await percent()).toBeLessThan(70);

    // The notch is a rest point, not a commitment: Escape hands it back.
    await page.keyboard.press("Escape");
    await expect(status).toContainText("Basinworks payout ready");
    await expect(track).toHaveAttribute("aria-valuetext", "0 percent slid", {
      timeout: 5000,
    });

    // Enter lands the slide only from the notch, so it takes two presses.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Basinworks payout ready");
    await page.keyboard.press("ArrowRight");
    await expect(status).toContainText("held at detent");
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Basinworks payout sent 1,242.40");
    await expect(announced).toHaveText("Sent 1,242.40");
    // The slab sank and the space it held collapsed to the confirmed line,
    // taking the track out of the tree rather than leaving it live behind the
    // outcome.
    await expect(slab).toHaveCount(0, { timeout: 5000 });
    await expect(track).toHaveCount(0);

    await stage.getByRole("button", { name: "Review again" }).click();
    await expect(status).toContainText("Basinworks payout ready");
    await expect(slab).toContainText("1,242.40");
    await expect(track).toHaveAttribute("aria-valuenow", "0");
  });

  test("settle-pulse: the pill widens on settlement and the sum joins it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/settle-pulse");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The pill is its own live region, ahead of the demo's line.
    const pill = stage.locator("[role='status']").first();
    // Everything drawn sits inside the hidden shell; the sentence is beside it.
    const shell = pill.locator("span[aria-hidden]").first();
    const shellWidth = async (): Promise<number> =>
      shell.evaluate((element) => (element as HTMLElement).offsetWidth);

    await expect(pill).toContainText(
      "Transfer of 240.00, pending on Coldbrook Bank",
    );
    await expect(shell).toContainText("Pending");
    // Until the network speaks nothing has moved, so no sum is shown.
    await expect(shell).not.toContainText("240.00");
    await expect(status).toContainText(
      "Waylight Pay 240.00 pending on coldbrook bank",
    );
    const waiting = await shellWidth();

    await stage.getByRole("button", { name: "Settle" }).click();
    await expect(pill).toContainText(
      "Transfer of 240.00, settled on Coldbrook Bank",
    );
    await expect(shell).toContainText("Settled");
    await expect(shell).toContainText("240.00");
    await expect(status).toContainText("Waylight Pay 240.00 settled");
    // The widening is the point of the pill: the sum needs room it did not have.
    await expect
      .poll(shellWidth, { timeout: 5000 })
      .toBeGreaterThan(waiting + 20);

    await stage.getByRole("button", { name: "Return" }).click();
    await expect(pill).toContainText(
      "Transfer of 240.00, returned on Coldbrook Bank",
    );
    await expect(shell).toContainText("Returned");
    await expect(status).toContainText("Waylight Pay 240.00 returned");
    await expect(stage.getByRole("button", { name: "Return" })).toBeDisabled();

    // Back to pending, the sum leaves again and the pill closes on its word.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(pill).toContainText(
      "Transfer of 240.00, pending on Coldbrook Bank",
    );
    await expect(shell).not.toContainText("240.00");
    await expect(status).toContainText(
      "Waylight Pay 240.00 pending on coldbrook bank",
    );
    await expect.poll(shellWidth, { timeout: 5000 }).toBeLessThan(waiting + 10);
  });
});

/**
 * The cards family is a wallet: a slab that turns, a switch you throw at it, a
 * press that mints one, a ceiling you drag over its spend, four digits it shows
 * for a few seconds, a reader it taps, a courier that carries it, the rules it
 * spends by, the stack it sits in, and the plate a counter reads. Every test
 * drives the mechanic the component advertises — through the keyboard wherever
 * it publishes one — and reads the result off the demo's status line and the
 * ARIA the component publishes about itself.
 */

/**
 * A phase that only lives for a beat — a 420ms rise, say — is not something a
 * poll can prove it saw. The trail is recorded in the page instead, by an
 * observer installed before the run starts, and read back once it has settled.
 */
const recordCardsTrail = async (target: Locator): Promise<void> => {
  await target.evaluate((element) => {
    const trail: string[] = [];
    const read = () => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (trail[trail.length - 1] !== text) trail.push(text);
    };
    read();
    new MutationObserver(read).observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    (window as unknown as { __cardsTrail: string[] }).__cardsTrail = trail;
  });
};

/** Everything the recorded node has said so far, oldest first. */
const cardsTrailOf = (page: Page) => async (): Promise<string[]> =>
  page.evaluate(
    () => (window as unknown as { __cardsTrail?: string[] }).__cardsTrail ?? [],
  );

/** A poll target: the number a valued widget is currently publishing. */
const valueNowOf = (target: Locator) => async (): Promise<number> =>
  Number(await target.getAttribute("aria-valuenow"));

test.describe("cards", () => {
  test("card-face: the switch turns the slab, and a freeze takes the number back for good", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-face");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card narrates its own settle before the demo's line does.
    const announced = stage.locator("[role='status']").first();
    const reveal = stage.getByRole("switch", { name: "Show card details" });
    // The number is read by what it says, not by where it sits: the front
    // prints a mask, the back prints the whole thing once the turn lands.
    const printed = stage.getByText("Card number 8412 5507 2264 4417", {
      exact: true,
    });
    const withheld = stage.getByText("Card number hidden", { exact: true });

    await expect(status).toContainText(
      "Waylight card front · number masked · active",
    );
    await expect(reveal).toHaveAttribute("aria-checked", "false");
    await expect(announced).toHaveText("Details hidden");
    await expect(printed).toHaveCount(0);
    await expect(withheld).toHaveCount(1);

    // Space is the switch's native press, and the whole slab turns on it.
    await reveal.focus();
    await page.keyboard.press(" ");
    await expect(reveal).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Waylight card back · number shown · active",
    );
    await expect(announced).toHaveText("Details shown");
    await expect(printed).toHaveCount(1);
    await expect(withheld).toHaveCount(0);

    // Enter is the other half of the same press, and the card turns home.
    await page.keyboard.press("Enter");
    await expect(reveal).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "Waylight card front · number masked · active",
    );
    await expect(printed).toHaveCount(0);

    // A freeze lands on a card that is showing its back: the reveal collapses,
    // the slab turns to its front and the switch goes inert.
    await page.keyboard.press(" ");
    await expect(printed).toHaveCount(1);
    await stage.getByRole("button", { name: "Freeze card" }).click();
    await expect(reveal).toBeDisabled();
    await expect(reveal).toHaveAttribute("aria-checked", "false");
    await expect(announced).toHaveText("Card frozen");
    await expect(status).toContainText(
      "Waylight card front · number masked · frozen",
    );
    await expect(printed).toHaveCount(0);
    await expect(stage.getByText("Frozen", { exact: true })).toBeVisible();

    // Thawing hands the switch back, but not the digits: a frozen reveal is
    // closed for good rather than parked.
    await stage.getByRole("button", { name: "Thaw card" }).click();
    await expect(reveal).toBeEnabled();
    await expect(reveal).toHaveAttribute("aria-checked", "false");
    await expect(announced).toHaveText("Details hidden");
    await expect(status).toContainText(
      "Waylight card front · number masked · active",
    );
    await expect(printed).toHaveCount(0);
  });

  test("card-freeze: a key throws the switch and a sweep past the middle commits it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-freeze");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const track = stage.getByRole("switch", { name: "Freeze Coldbrook card" });
    const tapLine = stage.getByText("Tap to pay · contactless");

    await expect(track).toHaveAttribute("aria-checked", "false");
    await expect(announced).toHaveText("Card active");
    await expect(status).toContainText("Coldbrook card active");
    await expect(tapLine).not.toHaveClass(/line-through/);

    // The keyboard path: End throws it right, Home brings it back.
    await track.focus();
    await page.keyboard.press("End");
    await expect(track).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText("Card frozen");
    await expect(status).toContainText("Coldbrook card frozen");
    // The spending line is struck as well as dimmed, so the state is not tone.
    await expect(tapLine).toHaveClass(/line-through/);

    await page.keyboard.press("Home");
    await expect(track).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Coldbrook card active");
    await expect(tapLine).not.toHaveClass(/line-through/);

    const rail = await track.boundingBox();
    if (!rail) throw new Error("the track has no box to throw across");
    const midY = rail.y + rail.height / 2;

    // A sweep past the halfway mark commits, and narrates itself on the way.
    await page.mouse.move(rail.x + 20, midY);
    await page.mouse.down();
    await page.mouse.move(rail.x + rail.width * 0.4, midY, { steps: 10 });
    await expect(status).toContainText(/throwing \d+%/);
    await page.mouse.move(rail.x + rail.width - 8, midY, { steps: 10 });
    await page.mouse.up();
    await expect(track).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Coldbrook card frozen");
    await expect(status).not.toContainText("throwing");

    // A sweep that stops short of the middle is refused: the knob springs back
    // to where it was rather than taking the throw it did not earn.
    await page.mouse.move(rail.x + rail.width - 20, midY);
    await page.mouse.down();
    await page.mouse.move(rail.x + rail.width * 0.62, midY, { steps: 10 });
    await page.mouse.up();
    await expect(track).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText("Card frozen");
    await expect(status).toContainText("Coldbrook card frozen");
    await expect(tapLine).toHaveClass(/line-through/);
  });

  test("virtual-mint: a press runs the phases and files the card into the wallet", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/virtual-mint");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const wallet = stage.getByRole("list");
    const chips = wallet.getByRole("listitem");

    await expect(status).toContainText(
      "Mint idle · latest 4417 · wallet 1 of 4",
    );
    await expect(chips).toHaveCount(1);
    await expect(announced).toContainText("Wallet holds 1 card, latest ending");

    // The phases are a chain of short timers, so they are recorded rather than
    // polled for: rising and filing are gone before a poll could see them.
    await recordCardsTrail(status);
    await stage.getByRole("button", { name: "Mint card" }).click();
    // The press locks the control for as long as the mint is in flight.
    await expect(stage.getByRole("button", { name: "Minting" })).toBeDisabled();

    await expect(chips).toHaveCount(2, { timeout: 8000 });
    await expect(status).toContainText("wallet 2 of 4", { timeout: 8000 });
    await expect(status).toContainText("Mint idle", { timeout: 8000 });
    await expect(announced).toContainText(
      "Wallet holds 2 cards, latest ending",
    );

    const trail = await cardsTrailOf(page)();
    const phases = ["rising", "printing", "filing", "idle"];
    for (const phase of phases) {
      expect(trail.some((line) => line.includes(`Mint ${phase}`))).toBe(true);
    }
    // The phases arrive in the order the machine names them.
    const seen = phases.filter((phase) =>
      trail.some((line) => line.includes(`Mint ${phase}`)),
    );
    expect(seen).toEqual(phases);

    // Filling the wallet to its cap, then one past it: the oldest chip leaves
    // rather than the row growing a fifth card.
    for (const held of [3, 4]) {
      await stage.getByRole("button", { name: "Mint card" }).click();
      await expect(chips).toHaveCount(held, { timeout: 8000 });
      await expect(status).toContainText(`wallet ${held} of 4`, {
        timeout: 8000,
      });
    }
    const oldest = await chips.first().textContent();
    await stage.getByRole("button", { name: "Mint card" }).click();
    await expect(status).toContainText("Mint idle", { timeout: 8000 });
    await expect(chips).toHaveCount(4);
    await expect(chips.first()).not.toHaveText(oldest ?? "");
  });

  test("spend-limit: keys and a drag move the ceiling, and the room turns into an overspend", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/spend-limit");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rail = stage.getByRole("slider", { name: "Coldbrook card ceiling" });

    await expect(rail).toHaveAttribute("aria-valuenow", "1200");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "1,200 USD limit, 340 USD left this month",
    );
    await expect(status).toContainText("Limit 1,200 · 340 left");

    // One arrow is one step of 50, and the room follows it down.
    await rail.focus();
    await page.keyboard.press("ArrowDown");
    await expect(rail).toHaveAttribute("aria-valuenow", "1150");
    await expect(status).toContainText("Limit 1,150 · 290 left");

    // A page key is five of them, which lands the ceiling just above the spend.
    await page.keyboard.press("PageDown");
    await expect(rail).toHaveAttribute("aria-valuenow", "900");
    await expect(status).toContainText("Limit 900 · 40 left");

    // One more step puts the ceiling under the spend, and the room becomes an
    // overspend rather than a negative amount of room.
    await page.keyboard.press("ArrowDown");
    await expect(rail).toHaveAttribute("aria-valuenow", "850");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "850 USD limit, over by 10 USD",
    );
    await expect(status).toContainText("Limit 850 · over by 10");

    // The ends of the scale are one key each, and neither runs past itself.
    await page.keyboard.press("Home");
    await expect(rail).toHaveAttribute("aria-valuenow", "0");
    await expect(status).toContainText("Limit 0 · over by 860");
    await page.keyboard.press("End");
    await expect(rail).toHaveAttribute("aria-valuenow", "2000");
    await expect(status).toContainText("Limit 2,000 · 1,140 left");

    // Spending against a ceiling that has not moved takes the room away.
    await stage.getByRole("button", { name: "Spend 240" }).click();
    await expect(status).toContainText("Limit 2,000 · 900 left");
    await stage.getByRole("button", { name: "Reset month" }).click();
    await expect(rail).toHaveAttribute("aria-valuenow", "1200");
    await expect(status).toContainText("Limit 1,200 · 340 left");

    // The pointer path settles onto a step rather than wherever it was let go.
    // The reset springs the rail back down the track, so the press waits for it
    // to stop: a box measured mid-flight is where the knob no longer is.
    await rail.hover();
    const knob = await rail.boundingBox();
    if (!knob) throw new Error("the rail has no box to drag");
    const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 24, { steps: 10 });
    await page.mouse.up();
    await expect.poll(valueNowOf(rail), { timeout: 5000 }).toBeLessThan(1200);
    const settled = await valueNowOf(rail)();
    expect(settled % 50).toBe(0);
    // The demo reads the same figure the slider is publishing about itself.
    await expect(status).toContainText(
      `Limit ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(settled)}`,
    );
  });

  test("card-pin: Space shows the PIN while held, Enter latches it, and the window runs out", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-pin");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const hold = stage.getByRole("button", { name: /Hold to show|Showing/ });

    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toHaveText("PIN hidden");
    await expect(status).toContainText("PIN hidden · 0 reveals");
    await expect(stage.getByText("6s window")).toBeVisible();

    // The held path: the digits are up only for as long as the key is down.
    await hold.focus();
    await page.keyboard.down(" ");
    await expect(hold).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText("PIN 4 1 8 2");
    await expect(status).toContainText("PIN shown · 1 reveals");
    await page.keyboard.up(" ");
    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toHaveText("PIN hidden");
    await expect(status).toContainText("PIN hidden · 1 reveals");

    // The latched path, for a hand that cannot hold a key: Enter opens it and
    // Escape closes it early.
    await page.keyboard.press("Enter");
    await expect(hold).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText("PIN 4 1 8 2");
    await expect(status).toContainText("PIN shown · 2 reveals");
    await expect(stage.getByText(/\ds left/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("PIN hidden · 2 reveals");

    // Left alone, the window closes itself: a PIN is not left uncovered.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("PIN shown · 3 reveals");
    await expect(status).toContainText("window expired", { timeout: 10_000 });
    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toHaveText("PIN hidden");
    await expect(stage.getByText("6s window")).toBeVisible();
  });

  test("card-tap: a key drives the card to the reader, and a decline prints its reason", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-tap");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slab = stage.getByRole("button", {
      name: "Tap Waylight card ending 4417 to pay $24.80 at Fernworks Depot",
    });

    await expect(status).toContainText("Tap idle · $24.80 · Fernworks Depot");
    await expect(announced).toHaveText(
      "Ready to tap $24.80 at Fernworks Depot",
    );
    await expect(slab).toHaveAttribute("aria-disabled", "false");

    // Right Arrow is the keyboard's whole gesture: the card crosses the gap and
    // the reader starts reading.
    await slab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(announced).toHaveText("Reading card");
    await expect(status).toContainText("Tap reading");
    await expect(slab).toHaveAttribute("aria-disabled", "true");

    await expect(status).toContainText("Tap approved", { timeout: 5000 });
    await expect(announced).toHaveText("Approved, $24.80 at Fernworks Depot");

    // Armed to refuse, the same tap ends the other way — and the refusal is
    // printed in words beside the tone dot, not carried by the colour.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Tap idle");
    await stage.getByRole("radio", { name: "Decline" }).click();
    await slab.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Tap reading");
    await expect(status).toContainText("Tap declined", { timeout: 5000 });
    await expect(announced).toHaveText("Declined, card limit reached");
    await expect(
      stage.getByText("Card limit reached", { exact: true }),
    ).toBeVisible();

    // A reset hands the stage back, and the card is tappable again.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Tap idle");
    await expect(announced).toHaveText(
      "Ready to tap $24.80 at Fernworks Depot",
    );
    await expect(slab).toHaveAttribute("aria-disabled", "false");
  });

  test("card-order: the stage advances down the rail and the estimate tightens with it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-order");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const stops = stage.getByRole("listitem");
    const advance = stage.getByRole("button", { name: "Advance" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(stops).toHaveCount(4);
    await expect(stops.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(0)).toContainText("Printed, done");
    await expect(stops.nth(1)).toContainText("Posted, waiting");
    await expect(announced).toHaveText(
      "Printed. Arrives in 4 days, Thu 14 Mar.",
    );
    await expect(status).toContainText(
      "Order CBK-4417-2F · Printed · Arrives in 4 days",
    );
    await expect(reset).toBeDisabled();

    // Each press moves the parcel one stop and tightens the courier's estimate.
    await advance.click();
    await expect(stops.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(0)).not.toHaveAttribute("aria-current", "step");
    await expect(stops.nth(1)).toContainText("Posted, done");
    await expect(announced).toHaveText(
      "Posted. Arrives in 2 days, Tue 12 Mar.",
    );
    await expect(status).toContainText(
      "Order CBK-4417-2F · Posted · Arrives in 2 days",
    );

    // One day, singular: the sentence counts rather than pluralising blindly.
    await advance.click();
    await expect(stops.nth(2)).toHaveAttribute("aria-current", "step");
    await expect(announced).toHaveText(
      "Out for delivery. Arrives in 1 day, Mon 11 Mar.",
    );
    await expect(status).toContainText(
      "Order CBK-4417-2F · Out for delivery · Arrives in 1 day",
    );

    // The last stop is a landing: the estimate is replaced by the note, and
    // there is nowhere further to advance to.
    await advance.click();
    await expect(stops.nth(3)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(3)).toContainText("Delivered, done");
    await expect(announced).toHaveText("Delivered. Signed for at the door.");
    await expect(status).toContainText(
      "Order CBK-4417-2F · Delivered · Delivered",
    );
    await expect(advance).toBeDisabled();

    await reset.click();
    await expect(stops.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(stops.nth(3)).toContainText("Delivered, waiting");
    await expect(status).toContainText("Order CBK-4417-2F · Printed");
    await expect(reset).toBeDisabled();
  });

  test("merchant-lock: a padlock takes its category out of the allowance, and the sweep takes them all", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/merchant-lock");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const groceries = stage.getByRole("switch", { name: "Groceries" });
    const travel = stage.getByRole("switch", { name: "Travel" });

    await expect(status).toContainText(
      "Allowed $706 a month · 2 of 6 categories locked",
    );
    await expect(groceries).toHaveAttribute("aria-checked", "false");
    await expect(travel).toHaveAttribute("aria-checked", "true");
    await expect(announced).toContainText(
      "$706 a month allowed across 4 of 6 categories.",
    );

    // A padlock is a switch, so Enter closes it and the sum drops by its row.
    await groceries.focus();
    await page.keyboard.press("Enter");
    await expect(groceries).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Allowed $366 a month · 3 of 6 categories locked",
    );
    await expect(announced).toContainText(
      "Groceries locked. $366 a month allowed across 3 of 6 categories.",
    );

    // Space opens it again, and the money comes straight back.
    await page.keyboard.press(" ");
    await expect(groceries).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "Allowed $706 a month · 2 of 6 categories locked",
    );
    await expect(announced).toContainText("Groceries opened. $706 a month");

    // The header control says what it will do, and does it to every row.
    await stage.getByRole("button", { name: "Lock all" }).click();
    await expect(status).toContainText(
      "Allowed $0 a month · 6 of 6 categories locked",
    );
    await expect(announced).toContainText(
      "Every category locked. $0 a month allowed across 0 of 6 categories.",
    );
    await expect(groceries).toHaveAttribute("aria-checked", "true");
    await expect(travel).toHaveAttribute("aria-checked", "true");
    await expect(stage.getByText("6 of 6 locked")).toBeVisible();

    await stage.getByRole("button", { name: "Open all" }).click();
    await expect(status).toContainText(
      "Allowed $1,336 a month · 0 of 6 categories locked",
    );
    await expect(announced).toContainText(
      "Every category opened. $1,336 a month allowed across 6 of 6 categories.",
    );
    await expect(travel).toHaveAttribute("aria-checked", "false");
  });

  test("card-stack: arrows rotate the wallet and the front card carries its balance", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/card-stack");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const wallet = stage.getByRole("radiogroup", { name: "Coldbrook Bank" });
    const everyday = wallet.getByRole("radio", {
      name: "Waylight Everyday, ending 4417, balance $2,480",
    });
    const travel = wallet.getByRole("radio", {
      name: "Fernwork Travel, ending 8062, balance $910",
    });
    const reserve = wallet.getByRole("radio", {
      name: "Basin Reserve, ending 2350, balance $14,260",
    });

    await expect(everyday).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Front Waylight Everyday ···· 4417 · $2,480",
    );
    await expect(announced).toHaveText(
      "Waylight Everyday, ending 4417, balance $2,480 is at the front.",
    );

    // The group is one Tab stop: the selection travels with the arrow.
    await everyday.focus();
    await page.keyboard.press("ArrowDown");
    await expect(travel).toBeFocused();
    await expect(travel).toHaveAttribute("aria-checked", "true");
    await expect(everyday).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "Front Fernwork Travel ···· 8062 · $910",
    );
    await expect(announced).toHaveText(
      "Fernwork Travel, ending 8062, balance $910 is at the front.",
    );

    // End runs to the back of the wallet, and the next arrow rotates round to
    // the front rather than stopping — a wallet is a loop, not a list.
    await page.keyboard.press("End");
    await expect(reserve).toBeFocused();
    await expect(reserve).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Front Basin Reserve ···· 2350 · $14,260",
    );
    await page.keyboard.press("ArrowRight");
    await expect(everyday).toBeFocused();
    await expect(everyday).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Front Waylight Everyday");

    await page.keyboard.press("ArrowLeft");
    await expect(reserve).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Home");
    await expect(everyday).toHaveAttribute("aria-checked", "true");

    // A pointer reaches a card that is tucked behind the others, and brings it
    // forward to exactly the same place the keyboard would have.
    // The fan leaves a band of every card showing; the click lands on that
    // strip rather than on the middle, which the front card is sitting over.
    await travel.click({ position: { x: 24, y: 12 } });
    await expect(travel).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Front Fernwork Travel ···· 8062 · $910",
    );
    await expect(stage.getByText("Fernwork Travel at the front")).toBeVisible();
  });

  test("chip-contact: the read runs to a hundred, and a refusal offers a retry that re-runs it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/chip-contact");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const plate = stage.getByRole("progressbar", { name: "Chip read" });

    await expect(plate).toHaveAttribute("aria-valuenow", "0");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "0 percent, Waiting for a card",
    );
    await expect(announced).toHaveText("Waiting for a card");
    await expect(status).toContainText("Chip idle · 0%");

    // The read is determinate, so the picture and the announcement move
    // together: the bar's value is the same number the status is saying.
    await stage.getByRole("button", { name: "Read chip" }).click();
    await expect.poll(valueNowOf(plate), { timeout: 6000 }).toBeGreaterThan(0);
    await expect(announced).toContainText("Reading the chip");

    await expect(status).toContainText("Chip approved · 100%", {
      timeout: 8000,
    });
    await expect(plate).toHaveAttribute("aria-valuenow", "100");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "100 percent, Read complete",
    );
    await expect(announced).toHaveText("Approved. The chip was read.");
    await expect(stage.getByRole("button", { name: "Retry" })).toHaveCount(0);

    // Armed to refuse, the same read ends the other way, and the reason is
    // printed under the plinth beside a Retry.
    await stage.getByRole("radio", { name: "Refuse" }).click();
    await stage.getByRole("button", { name: "Read again" }).click();
    await expect.poll(valueNowOf(plate), { timeout: 6000 }).toBeLessThan(100);
    await expect(status).toContainText("Chip declined · 100%", {
      timeout: 8000,
    });
    await expect(announced).toHaveText("Declined, chip could not be read");
    await expect(
      stage.getByText("Chip could not be read", { exact: true }),
    ).toBeVisible();

    // Retry is a real button and starts the read over rather than restating it.
    const retry = stage.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect.poll(valueNowOf(plate), { timeout: 6000 }).toBeLessThan(100);
    await expect(status).toContainText("Chip declined · 100%", {
      timeout: 8000,
    });
    await expect(announced).toHaveText("Declined, chip could not be read");
  });
});

/**
 * The trading family is a terminal: a ladder of resting orders, a tape that
 * prints one figure at a time, a ticket you slide to send, a chart you brush a
 * range on, a position whose profit moves with the mark, a rail carrying stop
 * and target, liquidity drawn as a landscape, a quote that expires while you
 * look at it, and a face saying how long the venue stays open. Every test
 * drives the mechanic the component advertises — through the keyboard wherever
 * it publishes one — and reads the result off the demo's status line and the
 * ARIA the component publishes about itself.
 */

/**
 * A line written from a timer rather than from a render cannot be proved to
 * have spoken *once* by polling it: a poll that misses an intermediate reading
 * is a fact about the polling interval. The trail is recorded in the page
 * instead, by an observer installed before the burst, and read back after.
 */
const recordTradingTrail = async (target: Locator): Promise<void> => {
  await target.evaluate((element) => {
    const trail: string[] = [];
    const read = () => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (trail[trail.length - 1] !== text) trail.push(text);
    };
    read();
    new MutationObserver(read).observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    (window as unknown as { __tradingTrail: string[] }).__tradingTrail = trail;
  });
};

/** Everything the recorded node has said so far, oldest first. */
const tradingTrailOf = (page: Page) => async (): Promise<string[]> =>
  page.evaluate(
    () =>
      (window as unknown as { __tradingTrail?: string[] }).__tradingTrail ?? [],
  );

/** A poll target: the print count the tape's demo is publishing. */
const printsOf = (line: Locator) => async (): Promise<number> =>
  Number(
    /·\s*(\d+)\s*prints/.exec((await line.textContent()) ?? "")?.[1] ?? -1,
  );

/** The pointer x of a bar's centre in a plot laid out as `count` equal columns. */
const barCentre = (
  box: { x: number; width: number },
  index: number,
  count: number,
) => box.x + ((index + 0.5) * box.width) / count;

test.describe("trading", () => {
  test("order-book: arrows walk the ladder across the spread, and a post opens a level the touch then eats", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/order-book");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const book = stage.getByRole("grid", { name: "BSN/USD" });
    // Rows are read by the price they carry, never by index: the ladder gains
    // and loses levels under the test.
    const farAsk = book.getByRole("row", { name: /^Ask \$24\.36/ });
    const bestAsk = book.getByRole("row", { name: /^Ask \$24\.19/ });
    const band = book.getByRole("row", { name: /^Spread/ });
    const bestBid = book.getByRole("row", { name: /^Bid \$24\.16/ });
    const farBid = book.getByRole("row", { name: /^Bid \$23\.98/ });

    await expect(status).toContainText(
      "Spread 0.03 · Touch 24.16 / 24.19 · Reading —",
    );
    // Cumulative depth sums outward from the touch, so the outermost row on a
    // side carries that side's whole book and the money resting under it.
    await expect(farAsk).toHaveAttribute(
      "aria-label",
      "Ask $24.36, size 160 BSN, 1,230 BSN cumulative, $29,842.50 resting",
    );

    // The row that holds focus is the row that is read: the hover reading has
    // an exact keyboard equivalent.
    await farAsk.focus();
    await expect(status).toContainText("Reading ask 24.36 · 1230 BSN");

    await page.keyboard.press("End");
    await expect(farBid).toBeFocused();
    await expect(status).toContainText("Reading bid 23.98 · 1280 BSN");

    await page.keyboard.press("Home");
    await expect(farAsk).toBeFocused();
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(bestAsk).toBeFocused();
    await expect(status).toContainText("Reading ask 24.19 · 180 BSN");

    // The spread band is a row too, so the arrows pass through it, and it names
    // the spread it stands for.
    await page.keyboard.press("ArrowDown");
    await expect(band).toBeFocused();
    await expect(band).toHaveAttribute(
      "aria-label",
      "Spread $0.03, 12 basis points, mid $24.18",
    );

    await page.keyboard.press("ArrowDown");
    await expect(bestBid).toBeFocused();
    await expect(status).toContainText("Reading bid 24.16 · 210 BSN");

    // A post opens a price inside the book without moving the touch, and the
    // press carries focus out of the grid, which is what clears the reading.
    await stage.getByRole("button", { name: "Post orders" }).click();
    await expect(
      book.getByRole("row", { name: /^Bid \$24\.14/ }),
    ).toHaveAttribute(
      "aria-label",
      "Bid $24.14, size 140 BSN, 350 BSN cumulative, $8,453.20 resting",
    );
    await expect(status).toContainText("Touch 24.16 / 24.19 · Reading —");

    // Two fills of 150 drain the 210 resting at the bid; the emptied level
    // leaves the ladder rather than resting at zero, and the touch widens.
    const fill = stage.getByRole("button", { name: "Fill touch" });
    await fill.click();
    await expect(bestBid).toHaveAttribute(
      "aria-label",
      "Bid $24.16, size 60 BSN, 60 BSN cumulative, $1,449.60 resting",
    );
    await fill.click();
    await expect(bestBid).toHaveCount(0);
    await expect(bestAsk).toHaveCount(0);
    await expect(status).toContainText("Spread 0.07 · Touch 24.14 / 24.21");

    // The pointer crossing the band keeps the level it was reading: the band is
    // not a level, so there is nothing there to read instead.
    const touchBid = book.getByRole("row", { name: /^Bid \$24\.14/ });
    await touchBid.hover();
    await expect(status).toContainText("Reading bid 24.14 · 140 BSN");
    await band.hover();
    await expect(status).toContainText("Reading bid 24.14 · 140 BSN");

    // The keyboard owes the pointer an exact equivalent. Focus leaving the grid
    // clears the reading; stepping between rows does not, so an arrow key never
    // flashes the readout back to the mid — and the band is one of the rows an
    // arrow key steps through.
    await touchBid.focus();
    await expect(status).toContainText("Reading bid 24.14 · 140 BSN");
    await page.keyboard.press("ArrowUp");
    await expect(band).toBeFocused();
    await expect(status).toContainText("Reading bid 24.14 · 140 BSN");
  });

  test("price-ticker: a burst of prints rolls the tape and the live line announces only where it settled", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/price-ticker");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const tape = stage.getByRole("group", { name: "BSN/USD" });
    // The figure and the chip are decoration; this sentence is the whole of
    // what the ticker says out loud.
    const announced = tape.locator("[aria-live='polite']");
    const print = stage.getByRole("button", { name: "Print", exact: true });

    await expect(status).toContainText("Last $24.06 · 0 prints · last flat");
    await expect(announced).toHaveText(
      "BSN/USD $24.06, up 0.75 percent on the close",
    );

    // One print: the seeded walk steps a cent down, and the announcement
    // arrives once the flash it waits out has expired.
    await print.click();
    await expect(status).toContainText("Last $24.05 · 1 prints · last down");
    await expect(announced).toHaveText(
      "BSN/USD $24.05, up 0.71 percent on the close",
      { timeout: 5000 },
    );

    // Four prints inside one task — far faster than the 700ms window the
    // sentence waits out. The tape passes through 24.06, 24.03 and 24.02 on
    // its way to 24.03, and none of them may be spoken.
    await recordTradingTrail(announced);
    await print.evaluate(async (button: HTMLButtonElement) => {
      for (let index = 0; index < 4; index += 1) {
        button.click();
        // Its own task each time, so React commits four prints rather than
        // batching them into one, and 60ms apart, so the tape stays inside the
        // window the sentence is waiting out.
        await new Promise((settle) => setTimeout(settle, 60));
      }
    });
    await expect(status).toContainText("Last $24.03 · 5 prints · last up");
    await expect
      .poll(tradingTrailOf(page), { timeout: 5000 })
      .toEqual([
        "BSN/USD $24.05, up 0.71 percent on the close",
        "BSN/USD $24.03, up 0.63 percent on the close",
      ]);

    // Reset puts the opening figure back — and the walk back up to it is a
    // price change like any other, so the tape prints it and says so rather
    // than pretending the counter never moved.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Last $24.06 · 1 prints · last up");
    await expect(announced).toHaveText(
      "BSN/USD $24.06, up 0.75 percent on the close",
      { timeout: 5000 },
    );

    // The live toggle owns an interval, and stopping it has to actually tear
    // that interval down rather than merely stop drawing.
    const live = stage.getByRole("button", { name: "Live" });
    await live.click();
    await expect
      .poll(printsOf(status), { timeout: 8000 })
      .toBeGreaterThanOrEqual(2);
    const stop = stage.getByRole("button", { name: "Stop" });
    await expect(stop).toHaveAttribute("aria-pressed", "true");
    await stop.click();
    const stopped = await printsOf(status)();
    await page.waitForTimeout(1000);
    expect(await printsOf(status)()).toBe(stopped);
  });

  test("order-ticket: the size slider lands on its detents and the track sends the side it was set to", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/order-ticket");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const size = stage.getByRole("slider", { name: "Size" });

    await expect(status).toContainText(
      "buy 50% · 99.67 BSN · Est $2,410.00 · Ready",
    );
    await expect(size).toHaveAttribute(
      "aria-valuetext",
      "50 percent, 99.67 BSN, $2,410.00",
    );

    // An arrow is a percent; PageUp is the detent above wherever that landed,
    // which is the magnet's keyboard equivalent and costs no aiming.
    await size.focus();
    await page.keyboard.press("ArrowRight");
    await expect(size).toHaveAttribute(
      "aria-valuetext",
      "51 percent, 101.66 BSN, $2,458.20",
    );
    await page.keyboard.press("PageUp");
    await expect(size).toHaveAttribute(
      "aria-valuetext",
      "75 percent, 149.50 BSN, $3,615.00",
    );
    await expect(stage.getByRole("button", { name: "75%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.keyboard.press("End");
    await expect(size).toHaveAttribute(
      "aria-valuetext",
      "100 percent, 199.34 BSN, $4,820.00",
    );
    await expect(stage.getByRole("button", { name: "Max" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The quick sizes are the same detents as controls.
    await stage.getByRole("button", { name: "25%" }).click();
    await expect(size).toHaveAttribute("aria-valuenow", "25");
    await expect(status).toContainText("buy 25% · 49.83 BSN · Est $1,205.00");

    // The side toggle is a two-stop radiogroup: one arrow crosses it, and the
    // ticket's estimate follows the side it is now written for.
    const buy = stage.getByRole("radio", { name: "Buy" });
    await buy.focus();
    await page.keyboard.press("ArrowRight");
    const sell = stage.getByRole("radio", { name: "Sell" });
    await expect(sell).toBeFocused();
    await expect(sell).toHaveAttribute("aria-checked", "true");
    await expect(buy).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("sell 25% · 49.83 BSN");

    const track = stage.getByRole("slider", {
      name: "Submit sell order, 49.83 BSN",
    });
    await track.focus();
    for (let nudge = 0; nudge < 3; nudge += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(track).toHaveAttribute("aria-valuetext", "30 percent slid");
    // Submitting is a track, not a tap: Enter short of the commit sends nothing.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("· Ready");

    await page.keyboard.press("End");
    await expect(track).toHaveAttribute("aria-valuetext", "100 percent slid");
    await page.keyboard.press("Enter");
    await expect(track).toHaveAttribute("aria-valuetext", "Order sent");
    await expect(status).toContainText(
      "sell 25% · 49.83 BSN · Est $1,205.00 · Sent",
    );
    await expect(
      stage.getByText("Sell order sent: 49.83 BSN for $1,205.00"),
    ).toBeAttached();

    // The track re-arms itself rather than staying spent.
    await expect(track).toHaveAttribute("aria-valuetext", "0 percent slid", {
      timeout: 6000,
    });

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText(
      "buy 50% · 99.67 BSN · Est $2,410.00 · Ready",
    );
  });

  test("fill-tape: prints run the tape, a hold freezes it with a backlog, and releasing plays the backlog in", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/fill-tape");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[aria-live='polite']");
    const printFill = stage.getByRole("button", { name: "Print fill" });
    const oldest = stage.getByRole("listitem", {
      name: "Sell 84 BSN at $24.14, 14:22:07",
    });

    await expect(status).toContainText("0 fills · 0 BSN · Running");
    await expect(spoken).toHaveText("Tape running");

    for (let print = 0; print < 3; print += 1) await printFill.click();
    await expect(oldest).toBeVisible();
    await expect(
      stage.getByRole("listitem", { name: "Buy 19 BSN at $24.24, 14:22:15" }),
    ).toBeVisible();
    await expect(status).toContainText("3 fills · 119 BSN · Running");

    // Hold is a real button, so the hover hold has a keyboard equivalent. Its
    // name carries the latch and the backlog, so it is held by the pair.
    const hold = stage.getByRole("button", { name: /^(Hold|Release) tape/ });
    await expect(hold).toHaveAccessibleName("Hold tape");
    await hold.focus();
    await page.keyboard.press("Enter");
    await expect(hold).toHaveAttribute("aria-pressed", "true");
    await expect(spoken).toHaveText("Tape held");

    // Fills arriving under a hold are counted, never dropped — and the frozen
    // volume stays with the rows it belongs to.
    for (let print = 0; print < 2; print += 1) await printFill.click();
    await expect(status).toContainText("5 fills · 119 BSN · Held · 2 waiting");
    await expect(stage.getByRole("listitem")).toHaveCount(3);
    await expect(hold).toHaveAccessibleName("Release tape, 2 fills waiting");

    // Releasing the latch is not enough while the control still holds focus:
    // the card holds on focus-within, so reaching Hold never costs you the
    // rows you were reading.
    await hold.focus();
    await page.keyboard.press(" ");
    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("Held · 2 waiting");

    await page.keyboard.press("Tab");
    await expect(spoken).toHaveText("Tape running");
    await expect(status).toContainText("5 fills · 183 BSN · Running");
    await expect(stage.getByRole("listitem")).toHaveCount(5);

    // Past capacity the oldest row collapses off the top; the volume it
    // printed stays counted.
    for (let print = 0; print < 3; print += 1) await printFill.click();
    await expect(stage.getByRole("listitem")).toHaveCount(7);
    await expect(oldest).toHaveCount(0);
    await expect(status).toContainText("8 fills · 393 BSN · Running");

    // The pointer holds the tape the same way the latch does.
    await stage.getByRole("list").hover();
    await expect(status).toContainText("Held · 0 waiting");
    await page.mouse.move(2, 2);
    await expect(status).toContainText("8 fills · 393 BSN · Running");
  });

  test("candle-brush: a sweep brushes a range, and the keyboard reaches the same range and speaks it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/candle-brush");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const plot = stage.getByRole("img", {
      name: "BSN/USD candlestick chart, 28 bars",
    });
    const spoken = stage.locator("[aria-live='polite']");
    const clear = stage.getByRole("button", { name: "Clear range" });

    await expect(status).toContainText("No range · drag to read a move");
    await expect(clear).toBeDisabled();

    // The plot's width is measured, not assumed: bar centres come off the box
    // the browser actually laid out.
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const y = box.y + box.height / 2;
    await page.mouse.move(barCentre(box, 5, 28), y);
    await page.mouse.down();
    await page.mouse.move(barCentre(box, 9, 28), y);
    await page.mouse.move(barCentre(box, 12, 28), y);
    await page.mouse.up();

    await expect(status).toContainText(
      "Bars 6–13 · Open $23.10 · Close $23.19 · +0.39%",
    );
    await expect(stage.getByText("O $23.10 C $23.19 Δ +$0.09")).toBeVisible();
    // A sweep crosses a bar every few pixels, so the live region stays silent
    // for the pointer and speaks only for the keyboard.
    await expect(spoken).toBeEmpty();

    // Reaching Clear takes the pointer off the plate, and a plate with no
    // pointer on it holds no crosshair: the readout falls back to the domain.
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(status).toContainText("No range · drag to read a move");
    await expect(stage.getByText("Range $23.00 – $23.76")).toBeVisible();

    // Space drops the anchor at the cursor and Shift with an arrow extends the
    // range from it: a complete equivalent of the drag. Escape first, because
    // a sweep leaves its anchor standing for exactly this kind of extension
    // and the host's Clear only took the range.
    await plot.focus();
    await page.keyboard.press("Escape");
    await page.keyboard.press("End");
    await expect(status).toContainText("No range · Bar 28 close $23.75");
    await page.keyboard.press(" ");
    await expect(status).toContainText(
      "Bars 28–28 · Open $23.66 · Close $23.75 · +0.38%",
    );
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect(status).toContainText(
      "Bars 25–28 · Open $23.60 · Close $23.75 · +0.64%",
    );
    await expect(spoken).toHaveText(
      "Bars 25 to 28, open $23.60, close $23.75, up 0.64 percent",
    );

    await page.keyboard.press("Escape");
    await expect(status).toContainText("No range · Bar 25 close $23.54");
    await expect(clear).toBeDisabled();
  });

  test("position-card: the mark rolls the P&L and the close slide converts it to a realised figure", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/position-card");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card marks its own thresholds before the demo's line reports.
    const milestone = stage.locator("[role='status']").first();
    const rail = stage.getByRole("slider", { name: "Slide to close BSN" });

    await expect(status).toContainText("BSN long · mark 24.08 · P&L +$8.80");
    await expect(milestone).toHaveText("Position in profit");
    await expect(
      stage.getByText("Unrealised profit and loss +$8.80, +0.92%"),
    ).toBeAttached();

    // A print is money, not price: forty units of a forty-cent move.
    await stage.getByRole("button", { name: "Print" }).click();
    await expect(status).toContainText("BSN long · mark 24.26 · P&L +$16.00");
    await expect(
      stage.getByText("Unrealised profit and loss +$16.00, +1.68%"),
    ).toBeAttached();

    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "Slide to close, 0 percent",
    );
    await rail.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "Slide to close, 40 percent",
    );
    // Released short of the detent the rail comes back, and nothing is closed.
    await page.keyboard.press("Home");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "Slide to close, 0 percent",
    );
    await expect(status).toContainText("BSN long · mark 24.26");

    // Past halfway, Enter converts the number: the figure freezes at what it
    // was worth when the gesture crossed.
    for (let nudge = 0; nudge < 3; nudge += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "Slide to close, 60 percent",
    );
    await page.keyboard.press("Enter");
    await expect(status).toContainText("BSN closed · realised +$16.00");
    await expect(milestone).toHaveText("Position closed, realised +$16.00");
    await expect(
      stage.getByText("Realised profit and loss +$16.00, +1.68%"),
    ).toBeAttached();
    // No dead control is left in the tab order once the position is shut.
    await expect(rail).toHaveCount(0);
    await expect(
      stage.getByText("Position closed", { exact: true }),
    ).toBeVisible();
    await expect(stage.getByRole("button", { name: "Print" })).toBeDisabled();

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("BSN long · mark 24.08 · P&L +$8.80");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "Slide to close, 0 percent",
    );
  });

  test("stop-rail: arrowing a handle redraws the risk, and neighbours are a wall it cannot cross", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/stop-rail");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const settled = stage.locator("[role='status']").first();
    const stop = stage.getByRole("slider", { name: "Stop price" });
    const entry = stage.getByRole("slider", { name: "Entry price" });

    await expect(status).toContainText("Risk $36.00 · reward $96.00 · 2.67R");
    await expect(settled).toHaveText("Risk $36.00, reward $96.00, 2.67 R");
    await expect(stop).toHaveAttribute(
      "aria-valuetext",
      "23.30, risk $36.00, reward $96.00, 2.67 R",
    );

    // One step of the demo's 0.05 tick, and the money follows the forty units
    // the plan is sized for.
    await stop.focus();
    await page.keyboard.press("ArrowRight");
    await expect(stop).toHaveAttribute("aria-valuenow", "23.35");
    await expect(status).toContainText("Risk $34.00 · reward $96.00 · 2.82R");

    // Shift is ten ticks at once.
    await page.keyboard.press("Shift+ArrowRight");
    await expect(stop).toHaveAttribute("aria-valuenow", "23.85");
    await expect(status).toContainText("Risk $14.00 · reward $96.00 · 6.86R");

    // End is this handle's own limit, which is the gap its neighbour leaves it
    // — and pressing on does not push it through entry.
    await page.keyboard.press("End");
    await expect(stop).toHaveAttribute("aria-valuenow", "24");
    await expect(status).toContainText("Risk $8.00 · reward $96.00 · 12.00R");
    await page.keyboard.press("ArrowRight");
    await expect(stop).toHaveAttribute("aria-valuenow", "24");

    await page.keyboard.press("Home");
    await expect(stop).toHaveAttribute("aria-valuenow", "22");
    await expect(status).toContainText("Risk $88.00 · reward $96.00 · 1.09R");

    // Moving entry moves both bands at once: it is the pivot the other two are
    // measured from.
    await entry.focus();
    await page.keyboard.press("PageDown");
    await expect(entry).toHaveAttribute("aria-valuenow", "23.7");
    await expect(status).toContainText("Risk $68.00 · reward $116.00 · 1.71R");
    await expect(settled).toHaveText("Risk $68.00, reward $116.00, 1.71 R");
  });

  test("depth-mound: the plate scrubs level by level and reads the depth resting out to it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/depth-mound");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const plate = stage.getByRole("slider", { name: "FRN" });

    await expect(status).toContainText(
      "FRN · spread 0.04 · bid 8812 / ask 9378",
    );
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Mid 24.30, spread 0.04",
    );

    // Focus opens the crosshair at the best bid, which is where a reader
    // starts, not at the deepest column.
    await plate.focus();
    await expect(plate).toHaveAttribute("aria-valuenow", "9");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Bid 24.28, size 579, 579 cumulative, $14,058",
    );

    // One step right crosses the mid into the ask mound.
    await page.keyboard.press("ArrowRight");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Ask 24.32, size 609, 609 cumulative, $14,811",
    );

    // The ends are the deepest column a side has, and the cumulative there is
    // that whole side of the book.
    await page.keyboard.press("Home");
    await expect(plate).toHaveAttribute("aria-valuenow", "0");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Bid 24.10, size 1,357, 8,812 cumulative, $212,369",
    );
    await page.keyboard.press("End");
    await expect(plate).toHaveAttribute("aria-valuenow", "19");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Ask 24.50, size 1,497, 9,378 cumulative, $229,761",
    );

    // Escape puts the reading back to the face's own summary.
    await page.keyboard.press("Escape");
    await expect(plate).toHaveAttribute(
      "aria-valuetext",
      "Mid 24.30, spread 0.04",
    );

    // The book is also a table, so the terrain means something with no pointer
    // at all — and a churn rewrites both.
    const book = stage.getByRole("table");
    await expect(book).toContainText("FRN order book, Mid 24.30, spread 0.04");
    await expect(book.getByRole("row")).toHaveCount(21);
    await stage.getByRole("button", { name: "Print" }).click();
    await expect(status).toContainText("bid 8842 / ask 9288");
  });

  test("trade-confirm: the quote expires under the sheet, a refresh re-arms it, and confirming places it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/trade-confirm");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const review = stage.getByRole("button", { name: "Review order" });
    const sheet = stage.getByRole("dialog", { name: "Confirm order" });
    const confirm = sheet.getByRole("button", { name: "Confirm" });

    await expect(status).toContainText("CBK buy 40 · quote 18.42 · idle");

    // Focus enters the sheet on Confirm and returns to the opener on Escape.
    await review.click();
    await expect(confirm).toBeFocused({ timeout: 5000 });
    await expect(
      sheet.getByText("buy 40 units of CBK at 18.42, fee $0.35, total $737.15"),
    ).toBeAttached();
    await expect(status).toContainText("quote 18.42 · holding");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(review).toBeFocused();
    await expect(status).toContainText("quote 18.42 · idle");

    // The eight-second hold runs out in place: the sheet expires rather than
    // closing, and the confirm disables rather than disappearing.
    await review.click();
    await expect(confirm).toBeEnabled();
    await expect(status).toContainText("quote 18.42 · expired", {
      timeout: 15000,
    });
    // One sentence per threshold: the hold line speaks on expiry, not per second.
    await expect(sheet.locator("[role='status']")).toHaveText("Quote expired");
    await expect(confirm).toBeDisabled();

    // Refresh asks the host for a new quote; the total is rebuilt from it and
    // the hold starts again.
    await sheet.getByRole("button", { name: "Refresh quote" }).click();
    await expect(status).toContainText("quote 18.47 · holding");
    await expect(
      sheet.getByText("buy 40 units of CBK at 18.47, fee $0.35, total $739.15"),
    ).toBeAttached();
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(status).toContainText("CBK buy 40 · placed at 18.47");
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
  });

  test("market-clock: pinning a session retargets the countdown, and the run flips the venue closed", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/market-clock");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[role='status']").first();
    // The face is read by what it says, and it says everything: state,
    // countdown and every session's hours.
    const face = stage.getByRole("img", { name: /^Basinworks Exchange,/ });
    const afternoon = stage.getByRole("button", { name: /^Afternoon/ });

    await expect(status).toContainText("Basinworks · 12:14 · open");
    await expect(spoken).toHaveText("Basinworks Exchange open");
    await expect(face).toHaveAttribute(
      "aria-label",
      "Basinworks Exchange, open. Closes in 16m. Sessions: Morning 09:00 to 12:30, Afternoon 13:30 to 16:30.",
    );
    await expect(stage.getByText("Closes in 16m")).toBeVisible();
    await expect(stage.getByText("12:14 · next 12:30")).toBeVisible();

    // Pinning retargets the countdown at that session's own next open without
    // touching the state the venue is actually in.
    await afternoon.click();
    await expect(afternoon).toHaveAttribute("aria-pressed", "true");
    await expect(stage.getByText("Afternoon opens in 1h 16m")).toBeVisible();
    await expect(stage.getByText("12:14 · next 13:30")).toBeVisible();
    await expect(face).toHaveAttribute(
      "aria-label",
      "Basinworks Exchange, open. Afternoon opens in 1h 16m. Sessions: Morning 09:00 to 12:30, Afternoon 13:30 to 16:30.",
    );

    await page.keyboard.press("Escape");
    await expect(afternoon).toHaveAttribute("aria-pressed", "false");
    await expect(stage.getByText("Closes in 16m")).toBeVisible();

    // The fast-forward carries the hand past 12:30, and the face flips once.
    await stage.getByRole("button", { name: "Run" }).click();
    await expect(status).toContainText("closed", { timeout: 10000 });
    await stage.getByRole("button", { name: "Pause" }).click();
    await expect(spoken).toHaveText("Basinworks Exchange closed");
    await expect(face).toHaveAttribute("aria-label", /closed\. Opens in /);

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Basinworks · 12:14 · open");
    await expect(spoken).toHaveText("Basinworks Exchange open");
  });
});

/**
 * The wallet family keeps secrets and asks permission, so its outcomes are
 * gates: a phrase that has to be walked before it can be copied, a sheet that
 * refuses to be signed unread, a vault that closes itself, a device that stops
 * waiting. What each test reads is the gate's own state — the ARIA the control
 * publishes, the geometry the indicator settled on, and the demo's status line.
 */

/** A laid-out box's width, measured rather than assumed. */
const walletWidthOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => element.getBoundingClientRect().width);

/** The same, vertically: what a fold or a drawer is currently reserving. */
const walletHeightOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => element.getBoundingClientRect().height);

/**
 * How much of a bar is left, read off the transform its motion value is
 * driving rather than off any text beside it.
 */
const walletScaleXOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 1;
    return new DOMMatrix(transform).a;
  });

/**
 * Where a needle is pointing, in degrees, signed — the arc runs from −90 at
 * one end to +90 at the other, so dropping the sign would make the two ends
 * agree. A settled −0 is folded back to 0 so the reading is comparable.
 */
const walletAngleOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    const matrix = new DOMMatrix(transform);
    const degrees = Math.round(
      (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
    );
    return degrees === 0 ? 0 : degrees;
  });

/** The invented addresses the wallet demos carry, spelled out once. */
const BSN_WALLET = "bsn1q9f4k2mx7v3ptl8ha6ze0rj5cwyd";
const BSN_RECEIVE = "bsn1q7f4c2m8xk3vd9puew5t0lrn6ha2js4c";

test.describe("wallet", () => {
  test("seed-reveal: holding walks the grid to the end, and only that unlocks copy", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/seed-reveal");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card speaks for itself before the demo's line does.
    const announced = stage.locator("[role='status']").first();
    const hold = stage.getByRole("button", { name: "Hold to reveal" });
    const copy = stage.getByRole("button", { name: "Copy recovery phrase" });

    await expect(status).toContainText("Phrase seen 0 / 12 · copy locked");
    await expect(copy).toBeDisabled();
    await expect(announced).toBeEmpty();
    // A covered word is not in the accessibility tree at all: the slot says
    // only that there is something there.
    await expect(
      stage.getByText("Word 3, hidden", { exact: true }),
    ).toHaveCount(1);
    await expect(stage.getByText("3. gravel", { exact: true })).toHaveCount(0);

    // Space held down walks the timer along the grid; there is no other route
    // to the copy gate, which is the whole point of the card.
    await hold.focus();
    await page.keyboard.down(" ");
    await expect(stage.getByText("3. gravel", { exact: true })).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(stage.getByText("12 / 12 seen")).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.up(" ");

    // Letting go re-covers the whole grid at once, but how far the walk got is
    // kept: the phrase is hidden again and copy stays armed.
    await expect(
      stage.getByText("Word 3, hidden", { exact: true }),
    ).toHaveCount(1);
    await expect(status).toContainText("Phrase seen 12 / 12 · copy armed");
    await expect(announced).toHaveText("All 12 words seen. Copy is available.");
    await expect(copy).toBeEnabled();

    // A clipboard that refuses says so rather than pretending it took it.
    await copy.click();
    await expect(status).toContainText(
      /Phrase seen 12 \/ 12 · (copied|blocked)/,
    );
    await expect(announced).toHaveText(
      /^(Recovery phrase copied\.|Copy blocked\. Write the words down instead\.)$/,
    );
  });

  test("seed-confirm: a wrong chip is refused, the right one flies to its slot, and three fill the seal", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/seed-confirm");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const said = stage.locator("[role='status']").first();
    const tray = stage.getByRole("group", { name: "Confirm your phrase" });
    const chip = (word: string): Locator =>
      tray.getByRole("button", { name: word });

    await expect(status).toContainText("Confirm 0 of 3 · 0 misses");
    await expect(stage.getByText("Word 3, empty", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      stage.getByText("Pick the word for position 3."),
    ).toBeVisible();

    // A wrong pick never moves: the chip stays in the tray, nothing is placed,
    // and the miss is counted honestly.
    await chip("willow").click();
    await expect(said).toHaveText("willow is not word 3");
    await expect(status).toContainText("Confirm 0 of 3 · 1 miss");
    await expect(chip("willow")).toHaveCount(1);

    // The tray is a roving-tabindex group whose ends do not wrap.
    await chip("anchor").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(chip("anchor")).toBeFocused();
    await page.keyboard.press("End");
    await expect(chip("pebble")).toBeFocused();
    await page.keyboard.press("Home");
    for (let step = 0; step < 4; step += 1)
      await page.keyboard.press("ArrowRight");
    await expect(chip("gravel")).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(said).toHaveText("gravel placed at word 3");
    await expect(status).toContainText("Confirm 1 of 3 · 1 miss");
    await expect(
      stage.getByText("Word 3, gravel", { exact: true }),
    ).toHaveCount(1);
    // A placed chip leaves the tray rather than being drawn in two places.
    await expect(chip("gravel")).toHaveCount(0);

    // Undo lifts the last placed word back along the same flight path.
    await stage.getByRole("button", { name: "Undo" }).click();
    await expect(said).toHaveText("gravel returned to the tray");
    await expect(status).toContainText("Confirm 0 of 3 · 1 miss");
    await expect(chip("gravel")).toHaveCount(1);

    await chip("gravel").click();
    await chip("anchor").click();
    await expect(said).toHaveText("anchor placed at word 7");
    await expect(status).toContainText("Confirm 2 of 3 · 1 miss");
    await chip("quarry").click();

    // The last slot stamps: the tray gives its box over to the seal, and the
    // miss stays on the line, because the score of the check is the point.
    await expect(said).toHaveText("Phrase confirmed");
    await expect(status).toContainText("Confirm 3 of 3 · phrase confirmed");
    await expect(
      stage.getByText("Word 11, quarry", { exact: true }),
    ).toHaveCount(1);
    await expect(tray.getByText("Phrase confirmed")).toBeVisible();
    await expect(stage.getByText("Every position filled.")).toBeVisible();

    // Start over rebuilds the tray, and the keyboard picks again — this time
    // to check what the tray promises about the chip that just left it: the
    // roving index is clamped and focus lands on its neighbour rather than
    // nothing, which is what keeps Backspace reachable from the tray.
    await stage.getByRole("button", { name: "Start over" }).click();
    await expect(status).toContainText("Confirm 0 of 3 · 0 misses");
    await chip("anchor").focus();
    for (let step = 0; step < 4; step += 1)
      await page.keyboard.press("ArrowRight");
    await expect(chip("gravel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(said).toHaveText("gravel placed at word 3");
    await expect(chip("meadow")).toBeFocused();
    await page.keyboard.press("Backspace");
    await expect(said).toHaveText("gravel returned to the tray");
    await expect(status).toContainText("Confirm 0 of 3 · 0 misses");
    await expect(chip("gravel")).toHaveCount(1);
  });

  test("address-chip: focus unfolds the middle, Escape shuts it, and the press copies the whole address", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/address-chip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const said = stage.locator("[role='status']").first();
    const chip = stage.getByRole("button", {
      name: `Copy Basin deposit address ${BSN_WALLET}`,
    });
    // The collapsed middle is a real zero, not an ellipsis standing in for
    // one, so how far it has opened is a width and nothing else.
    const middle = stage
      .getByText("f4k2mx7v3ptl8ha6ze0rj5", { exact: true })
      .locator("xpath=..");

    await expect(status).toContainText("Address collapsed · not copied");
    await expect.poll(walletWidthOf(middle), { timeout: 5000 }).toBeLessThan(2);

    // Focus opens it exactly as hover does: the keyboard sees what the mouse
    // sees, and the chip reports the change from the handler that made it.
    await chip.focus();
    await expect(status).toContainText("Address expanded");
    await expect
      .poll(walletWidthOf(middle), { timeout: 5000 })
      .toBeGreaterThan(60);

    // Escape shortens the row again without giving up focus.
    await page.keyboard.press("Escape");
    await expect(status).toContainText("Address collapsed");
    await expect(chip).toBeFocused();
    await expect.poll(walletWidthOf(middle), { timeout: 5000 }).toBeLessThan(2);

    await page.keyboard.press("Enter");
    await expect(status).toContainText(
      /Address (collapsed|expanded) · (copied|blocked)/,
    );
    await expect(said).toHaveText(
      /^(Basin deposit address copied|Copy blocked — select the address and copy it manually)$/,
    );
  });

  test("sign-request: the sheet will not be signed until the request has been read to the end", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/sign-request");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const review = stage.getByRole("button", { name: "Review request" });

    await expect(status).toContainText("Sign request idle");
    await review.click();

    const sheet = stage.getByRole("dialog", { name: "Signature request" });
    const list = sheet.getByRole("group", { name: "Request details" });
    const sign = sheet.getByRole("button", { name: "Sign" });

    // Focus lands on the list, not on a button: reading is the first thing to
    // do here, and the scrolling keys have to land somewhere that scrolls.
    await expect(list).toBeFocused();
    await expect(status).toContainText("Sign request open · reading");
    await expect(sign).toHaveAttribute("aria-disabled", "true");
    await expect(
      sheet.getByText("Scroll to the end of the request to sign"),
    ).toBeVisible();
    // A row worth a second look carries the word, never colour alone.
    await expect(sheet.getByText("Warning")).toBeVisible();

    // Reading to the end is what arms the control, and End is the keyboard's
    // way of getting there.
    await page.keyboard.press("End");
    await expect(status).toContainText("Sign request open · armed", {
      timeout: 5000,
    });
    await expect(sign).toHaveAttribute("aria-disabled", "false");
    await expect(sheet.locator("[role='status']")).toHaveText("Ready to sign.");
    await expect(
      sheet.getByRole("button", { name: "Jump to end" }),
    ).toHaveCount(0);

    await sign.click();
    await expect(status).toContainText("Sign request signed");
    await expect(stage.getByRole("dialog")).toHaveCount(0);
    // Closing hands the press back to the control that opened the sheet.
    await expect(review).toBeFocused();

    // Escape rejects, and every raise starts a fresh read.
    await review.click();
    await expect(status).toContainText("Sign request open · reading");
    await page.keyboard.press("Escape");
    await expect(status).toContainText("Sign request rejected");
    await expect(stage.getByRole("dialog")).toHaveCount(0);
  });

  test("wallet-connect: the request closes the rail, approval draws the link, and a refusal opens it again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/wallet-connect");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[role='status']").first();
    // The rail is the only thing that knows how wide the stage is, so it is
    // the thing to measure: the nodes never own a pixel.
    const rail = stage.locator("div.mx-auto.flex.w-full.items-center");
    const link = stage.locator("span.origin-left.bg-cobalt-bright");

    await expect(status).toContainText("Handshake idle");
    await expect(spoken).toHaveText("Not connected");
    const apart = await walletWidthOf(rail)();

    await stage.getByRole("button", { name: "Connect" }).click();
    await expect(status).toContainText("Handshake pending");
    await expect(spoken).toHaveText("Waiting for approval on Waylight");
    await expect(
      stage.getByRole("button", { name: "Cancel request" }),
    ).toBeVisible();
    await expect
      .poll(walletWidthOf(rail), { timeout: 5000 })
      .toBeLessThan(apart * 0.8);

    await stage.getByRole("button", { name: "Approve on device" }).click();
    await expect(status).toContainText("Handshake connected · bsn1q9f4…cwyd");
    // The visible line is abbreviated; the spoken one carries the whole
    // address, so nothing has to be reconstructed from an ellipsis.
    await expect(spoken).toHaveText(`Connected as ${BSN_WALLET}`);
    await expect(stage.getByText("Connected as bsn1q9…cwyd")).toBeVisible();
    await expect
      .poll(walletScaleXOf(link), { timeout: 5000 })
      .toBeGreaterThan(0.98);
    await expect(
      stage.getByRole("button", { name: "Disconnect" }),
    ).toBeVisible();

    await stage.getByRole("button", { name: "Disconnect" }).click();
    await expect(status).toContainText("Handshake idle");

    // A refusal separates: the link falls away and the nodes go back to the
    // full width of the stage.
    await stage.getByRole("button", { name: "Connect" }).click();
    await stage.getByRole("button", { name: "Reject" }).click();
    await expect(status).toContainText("Handshake rejected");
    await expect(spoken).toHaveText("Request rejected");
    await expect(
      stage.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect
      .poll(walletScaleXOf(link), { timeout: 5000 })
      .toBeLessThan(0.02);
    await expect
      .poll(walletWidthOf(rail), { timeout: 5000 })
      .toBeGreaterThan(apart * 0.98);
  });

  test("network-pick: arrows walk the chains and the header re-rolls onto the one picked", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/network-pick");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[role='status']").first();
    const chains = stage.getByRole("radiogroup", { name: "Network" });
    const basin = chains.getByRole("radio", { name: "Basin" });
    const fernwork = chains.getByRole("radio", { name: "Fernwork" });
    const gauge = chains.getByRole("radio", { name: "Gauge" });
    // Every chain's native figure is drawn into one shared cell, so which one
    // is showing is an opacity rather than a mount.
    const native = stage.locator("span.grid.justify-items-start");

    await expect(status).toContainText(
      "Network Basin · 12.4820 BSN · $8,412.60",
    );
    await expect(spoken).toHaveText("Basin. 12.4820 BSN, $8,412.60.");
    await expect(basin).toHaveAttribute("aria-checked", "true");

    // Moving focus selects, as a radio group does.
    await basin.focus();
    await page.keyboard.press("ArrowRight");
    await expect(fernwork).toBeFocused();
    await expect(fernwork).toHaveAttribute("aria-checked", "true");
    await expect(basin).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "Network Fernwork · 940.1204 FRN · $2,408.45",
    );
    await expect(spoken).toHaveText("Fernwork. 940.1204 FRN, $2,408.45.");
    await expect(native.getByText("940.1204 FRN", { exact: true })).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(native.getByText("12.4820 BSN", { exact: true })).toHaveCSS(
      "opacity",
      "0",
    );

    // End jumps to the far chain, and the group does not wrap past it.
    await page.keyboard.press("End");
    await expect(gauge).toBeFocused();
    await expect(status).toContainText(
      "Network Gauge · 1,284.6000 GGE · $640.20",
    );
    await page.keyboard.press("ArrowRight");
    await expect(gauge).toBeFocused();
    await expect(gauge).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(basin).toBeFocused();
    await expect(status).toContainText(
      "Network Basin · 12.4820 BSN · $8,412.60",
    );
    await expect(spoken).toHaveText("Basin. 12.4820 BSN, $8,412.60.");
    await expect(native.getByText("12.4820 BSN", { exact: true })).toHaveCSS(
      "opacity",
      "1",
    );
  });

  test("gas-dial: the chips swing the needle across the arc, and the fee and the wait follow it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gas-dial");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[role='status']").first();
    const stops = stage.getByRole("radiogroup", { name: "Network fee" });
    const slow = stops.getByRole("radio", { name: "Slow" });
    const normal = stops.getByRole("radio", { name: "Normal" });
    const fast = stops.getByRole("radio", { name: "Fast" });
    // The needle is the indicator the dial is really made of; the arc's sweep
    // rides the same motion value, so reading one reads both.
    const needle = stage.locator('line[stroke="var(--ink)"]');
    const eta = stage
      .locator("div.pointer-events-none")
      .getByText(/^\d+:\d\d$/);

    await expect(status).toContainText("Speed Normal · Fee $1.84 · Eta 0:45");
    await expect(spoken).toHaveText("Normal. Fee $1.84, about 45 seconds.");
    await expect(normal).toHaveAttribute("aria-checked", "true");
    await expect.poll(walletAngleOf(needle), { timeout: 5000 }).toBe(0);

    // Home is the slow end of the arc: a quarter turn back, and the wait
    // counts up to three minutes rather than jumping there.
    await normal.focus();
    await page.keyboard.press("Home");
    await expect(slow).toBeFocused();
    await expect(status).toContainText("Speed Slow · Fee $0.42 · Eta 3:00");
    await expect(spoken).toHaveText("Slow. Fee $0.42, about 180 seconds.");
    await expect.poll(walletAngleOf(needle), { timeout: 5000 }).toBe(-90);
    await expect(eta).toHaveText("3:00", { timeout: 5000 });

    await page.keyboard.press("ArrowLeft");
    await expect(slow).toBeFocused();
    await expect(slow).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("End");
    await expect(fast).toBeFocused();
    await expect(status).toContainText("Speed Fast · Fee $4.20 · Eta 0:12");
    await expect(spoken).toHaveText("Fast. Fee $4.20, about 12 seconds.");
    await expect.poll(walletAngleOf(needle), { timeout: 5000 }).toBe(90);
    await expect(eta).toHaveText("0:12", { timeout: 5000 });
    // Only the chosen stop's rate is showing, out of the one shared cell.
    await expect(stage.getByText("41 u", { exact: true })).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(stage.getByText("9 u", { exact: true })).toHaveCSS(
      "opacity",
      "0",
    );
  });

  test("qr-fold: the toggle unfolds the code, Escape folds it away, and the chip copies the address", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/qr-fold");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const said = stage.locator("[role='status']").first();
    const toggle = stage.getByRole("button", { name: "Show payment code" });
    const panel = stage.locator("div.max-w-48");
    const code = stage.getByRole("img", {
      name: `Payment code for Basin address ${BSN_RECEIVE}`,
    });

    await expect(status).toContainText("Code hidden · Address bsn1q7f4…a2js4c");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Folded, the card reserves a strip rather than the square's room.
    await expect(code).toHaveCount(0);
    await expect
      .poll(walletHeightOf(panel), { timeout: 5000 })
      .toBeLessThan(20);

    await toggle.click();
    await expect(status).toContainText("Code shown");
    await expect(
      stage.getByRole("button", { name: "Hide payment code" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(code).toBeVisible();
    await expect
      .poll(walletHeightOf(panel), { timeout: 5000 })
      .toBeGreaterThan(120);

    // Escape anywhere inside the card folds it and hands the press back.
    await page.keyboard.press("Escape");
    await expect(status).toContainText("Code hidden");
    await expect(toggle).toBeFocused();
    await expect
      .poll(walletHeightOf(panel), { timeout: 5000 })
      .toBeLessThan(20);

    // The chip copies the whole address and says which way it went.
    await stage
      .getByRole("button", { name: `Copy address ${BSN_RECEIVE}` })
      .click();
    await expect(said).toHaveText(/^(Address copied|Clipboard unavailable)$/);
    await expect(status).toContainText(/· (copied|copy blocked)/);

    // The requested amount and the card move together.
    await stage.getByRole("button", { name: "Request another amount" }).click();
    await expect(stage.getByText("$42.50")).toBeVisible();
  });

  test("key-vault: the switch opens the drawer, a reveal shows one value, and the ring locks it again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/key-vault");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const said = stage.locator("[role='status']").first();
    const lock = stage.getByRole("switch", { name: "Vault lock" });
    const reveal = stage.getByRole("button", {
      name: "Reveal Payout signing key",
    });

    await expect(status).toContainText("Vault locked");
    await expect(said).toHaveText("Vault locked");
    await expect(lock).toHaveAttribute("aria-checked", "false");
    await expect(stage.getByText("4 keys sealed")).toBeVisible();
    // A sealed vault keeps no values in the document, not even hidden ones.
    await expect(reveal).toHaveCount(0);
    await expect(stage.getByText("cbk_sk_4f81c0a97d2e6b3948af")).toHaveCount(0);

    await lock.focus();
    await page.keyboard.press(" ");
    await expect(lock).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Vault unlocked");
    await expect(said).toHaveText("Vault unlocked, locks in 9 seconds");
    await expect(stage.getByText("4 keys open")).toBeVisible();
    await expect(stage.getByRole("listitem")).toHaveCount(4);

    await reveal.click();
    const hide = stage.getByRole("button", { name: "Hide Payout signing key" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText(
      "Vault unlocked · Last Payout signing key revealed",
    );
    await expect(stage.getByText("cbk_sk_4f81c0a97d2e6b3948af")).toHaveCSS(
      "opacity",
      "1",
    );

    // Escape seals it from anywhere in the card and hands the press back.
    await page.keyboard.press("Escape");
    await expect(lock).toHaveAttribute("aria-checked", "false");
    await expect(lock).toBeFocused();
    await expect(stage.getByRole("listitem")).toHaveCount(0);
    await expect(status).toContainText("Vault locked");

    // The ring is the only thing saying how long the vault stays open. Left
    // alone, it runs out and locks the vault from its own completion.
    await page.keyboard.press(" ");
    await expect(lock).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Vault locked · Last auto-locked", {
      timeout: 13000,
    });
    await expect(lock).toHaveAttribute("aria-checked", "false");
    await expect(stage.getByRole("listitem")).toHaveCount(0);
  });

  test("hardware-nudge: the request drains its deadline, times out, and the resend confirms on the device", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/hardware-nudge");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The visible line under the device is itself the live region — a second
    // sr-only copy would make every state arrive twice.
    const line = stage.locator("[role='status']").first();
    // The card's own control comes before the demo's three stand-ins.
    const device = stage.getByRole("button").first();
    const deadline = stage.locator("span.origin-left");

    await expect(status).toContainText("Device Fieldline Signer · State idle");
    await expect(line).toHaveText("No request sent");
    await expect(device).toHaveText("Send request");
    await expect(stage.getByText("240 BSN")).toBeVisible();
    await expect(stage.getByText("$1,842.60")).toBeVisible();
    await expect(stage.getByText("bsn1q7f…2js4c")).toBeVisible();

    await device.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("State waiting");
    await expect(line).toHaveText("Confirm on Fieldline Signer");
    await expect(device).toHaveText("Cancel");
    // The deadline is a drain, not a label: it is already falling.
    await expect
      .poll(walletScaleXOf(deadline), { timeout: 5000 })
      .toBeLessThan(0.85);

    // Left alone, the request expires from the drain's own completion.
    await expect(line).toHaveText("Request timed out", { timeout: 13000 });
    await expect(status).toContainText("State timed out");
    await expect(device).toHaveText("Send again");
    await expect
      .poll(walletScaleXOf(deadline), { timeout: 5000 })
      .toBeLessThan(0.02);

    // Sending again refills the deadline, and the device answers this time.
    await device.click();
    await expect(status).toContainText("State waiting");
    await expect
      .poll(walletScaleXOf(deadline), { timeout: 5000 })
      .toBeGreaterThan(0.5);
    await stage.getByRole("button", { name: "Confirm on device" }).click();
    await expect(line).toHaveText("Confirmed on Fieldline Signer");
    await expect(status).toContainText("State confirmed");
    await expect(device).toHaveText("Confirmed");
    await expect(device).toBeDisabled();
  });
});

/**
 * The portfolio family reads one book from five angles: the share each asset
 * owns of it, how far it has come, where it drifts from its model, what a
 * single position cost against what it is worth, and the order the holder ranks
 * it in. Every test drives the mechanic the component advertises — through the
 * keyboard wherever it publishes one — and reads the result off the demo's
 * status line, the ARIA the component publishes about itself, and, where the
 * outcome is a proportion, the width the bar actually settled on.
 */

/**
 * A poll target: how much of its own track a fill covers. Measured rather than
 * read off a transform, because a scaled bar's width is the outcome the viewer
 * is looking at.
 */
const fillFractionOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const track = element.parentElement;
    if (!track) return -1;
    const width = track.getBoundingClientRect().width;
    return width === 0
      ? -1
      : Math.round((element.getBoundingClientRect().width / width) * 100) / 100;
  });

/** A laid-out box's width in CSS pixels, measured rather than assumed. */
const boxWidthOf = async (target: Locator): Promise<number> =>
  target.evaluate(
    (element) => Math.round(element.getBoundingClientRect().width * 10) / 10,
  );

/**
 * The pulse prints its beat as a word beside the marks count, which is the only
 * place the live and still states are told apart in text. It is read by what
 * sits next to that count rather than by a class, because the word is the
 * contract and the class is not.
 */
const beatWordOf = (stage: Locator) => async (): Promise<string> =>
  stage.evaluate((root) => {
    const marks = Array.from(root.querySelectorAll("span")).find((node) =>
      /^\d+ \/ \d+ marks$/.test((node.textContent ?? "").trim()),
    );
    return (marks?.previousElementSibling?.textContent ?? "").trim();
  });

test.describe("portfolio", () => {
  test("holdings-ring: arrows walk the legend, and a fifth asset re-proportions the mix", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/holdings-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The ring announces the shape of the mix before the demo's own line, and
    // deliberately not the pick — each legend entry already carries that.
    const announced = stage.locator("[role='status']").first();
    const legend = stage.getByRole("radiogroup", {
      name: "Waylight Pay · portfolio mix",
    });
    const basin = legend.getByRole("radio", { name: /^Basin BSN,/ });
    const fernwork = legend.getByRole("radio", { name: /^Fernwork FRN,/ });
    const gauge = legend.getByRole("radio", { name: /^Gauge GGE,/ });

    await expect(status).toContainText("Mix 4 assets · Total 45,350");
    await expect(announced).toHaveText("4 assets, total $45,350.");
    // The entry spells the asset out, so the reading never depends on the hub.
    await expect(basin).toHaveAccessibleName(
      "Basin BSN, $18,400, 40.6% of the portfolio",
    );
    await expect(basin).toHaveAttribute("aria-checked", "false");

    // Activation follows focus: the arrow both moves and picks.
    await basin.focus();
    await page.keyboard.press("ArrowDown");
    await expect(fernwork).toBeFocused();
    await expect(fernwork).toHaveAttribute("aria-checked", "true");
    await expect(basin).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Mix 4 assets · Fernwork FRN 28.4%");

    // End jumps to the outer asset, and the legend does not wrap past it.
    await page.keyboard.press("End");
    await expect(gauge).toBeFocused();
    await expect(status).toContainText("Gauge GGE 11.9%");
    await page.keyboard.press("ArrowDown");
    await expect(gauge).toBeFocused();
    await expect(gauge).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(basin).toBeFocused();
    await expect(basin).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Basin BSN 40.6%");

    // A fifth asset re-proportions every share already on the rim: the pick is
    // untouched, but what it is worth against the whole is not.
    await stage.getByRole("button", { name: "Add Waylight WAY" }).click();
    await expect(announced).toHaveText("5 assets, total $48,450.");
    await expect(status).toContainText("Mix 5 assets · Basin BSN 38.0%");
    await expect(basin).toHaveAccessibleName(
      "Basin BSN, $18,400, 38.0% of the portfolio",
    );
    await expect(
      legend.getByRole("radio", { name: /^Waylight WAY,/ }),
    ).toHaveAccessibleName("Waylight WAY, $3,100, 6.4% of the portfolio");

    // Escape hands the hub back to the total, and the demo's clear goes quiet.
    await basin.focus();
    await page.keyboard.press("Escape");
    await expect(basin).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Mix 5 assets · Total 48,450");
    await expect(
      stage.getByRole("button", { name: "Clear selection" }),
    ).toBeDisabled();
  });

  test("performance-line: the tabs walk the periods and each one redraws its own return", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/performance-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const tabs = stage.getByRole("tablist", { name: "Waylight Growth" });
    const month = tabs.getByRole("tab", { name: "1M" });
    const year = tabs.getByRole("tab", { name: "1Y" });
    const all = tabs.getByRole("tab", { name: "All" });
    // The trace is read by the sentence it publishes, never by its path data.
    const trace = stage.getByRole("img", { name: /performance:/ });

    await expect(year).toHaveAttribute("aria-selected", "true");
    await expect(status).toContainText(
      "Period 1Y · Return +52.76% since 4 Sep 2025",
    );
    await expect(announced).toHaveText(
      "1Y: up 52.76 percent since 4 Sep 2025, now $57,489.74.",
    );
    await expect(trace).toHaveAttribute(
      "aria-label",
      "1Y performance: $37,633.47 on 4 Sep 2025 to $57,489.74, low $37,633.47, high $59,059.66, up 52.76 percent.",
    );
    // The chip labels the start marker with that period's own opening figure.
    await expect(stage.getByText("4 Sep 2025 · $37,633.47")).toBeVisible();

    // Focus activates: one arrow moves the pill and redraws the plate.
    await year.focus();
    await page.keyboard.press("ArrowRight");
    await expect(all).toBeFocused();
    await expect(all).toHaveAttribute("aria-selected", "true");
    await expect(year).toHaveAttribute("aria-selected", "false");
    await expect(status).toContainText(
      "Period All · Return +71.32% since 2 Mar 2023",
    );
    await expect(trace).toHaveAttribute(
      "aria-label",
      /^All performance: \$25,585\.87 on 2 Mar 2023 to \$43,834\.25, low \$25,424\.52,/,
    );
    await expect(stage.getByText("2 Mar 2023 · $25,585.87")).toBeVisible();

    // The strip does not wrap past its ends.
    await page.keyboard.press("ArrowRight");
    await expect(all).toBeFocused();

    // Home lands on the one losing period, and the figure signs itself.
    await page.keyboard.press("Home");
    await expect(month).toBeFocused();
    await expect(status).toContainText(
      "Period 1M · Return -0.80% since 8 Aug 2026",
    );
    await expect(announced).toHaveText(
      "1M: down 0.80 percent since 8 Aug 2026, now $45,544.64.",
    );
    await expect(stage.getByText("$45,544.64", { exact: true })).toBeVisible();
    await expect(stage.getByText("8 Aug 2026 · $45,912.81")).toBeVisible();

    // The plate is the chosen tab's own panel, and says which one it belongs to.
    await expect(stage.getByRole("tabpanel")).toHaveAccessibleName("1M");
  });

  test("rebalance-bars: the action glides every weight onto its target and the trades settle", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/rebalance-bars");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component's summary sits above the rows, before the demo's line.
    const summary = stage.locator("[role='status']").first();
    const basin = stage.getByRole("meter", { name: "Basin BSN" });
    const fernwork = stage.getByRole("meter", { name: "Fernwork FRN" });
    const action = stage.getByRole("button", { name: "Rebalance · 4 trades" });
    const reset = stage.getByRole("button", { name: "Reset drift" });
    // The solid `Now` bar; the drift lane beside it is hatched, not filled.
    const basinNow = basin.locator("span.bg-cobalt-bright");

    await expect(status).toContainText("Drift 9 points · 4 trades pending");
    await expect(summary).toHaveText("Drift 9 points · $5,580 to move");
    await expect(basin).toHaveAttribute("aria-valuenow", "38");
    // A listener gets the whole trade without the picture.
    await expect(basin).toHaveAttribute(
      "aria-valuetext",
      "Basin BSN, now 38 percent, target 30 percent, sell 8 points, $4,960.",
    );
    await expect(fernwork).toHaveAttribute(
      "aria-valuetext",
      "Fernwork FRN, now 22 percent, target 30 percent, buy 8 points, $4,960.",
    );
    await expect(stage.getByText("Sell $4,960")).toBeVisible();
    await expect(stage.getByText("Buy $620")).toBeVisible();
    await expect(reset).toBeDisabled();
    // Basin is the heaviest weight in the set, so its bar owns the whole track.
    await expect
      .poll(fillFractionOf(basinNow), { timeout: 5000 })
      .toBeGreaterThan(0.98);

    // The action is the only gesture, and Enter is half of the press.
    await action.focus();
    await page.keyboard.press("Enter");

    await expect(summary).toHaveText("On target · 4 trades settled");
    await expect(status).toContainText("On target · 4 trades settled");
    await expect(basin).toHaveAttribute("aria-valuenow", "30");
    await expect(basin).toHaveAttribute(
      "aria-valuetext",
      "Basin BSN, now 30 percent, on target, sale of $4,960 settled.",
    );
    await expect(fernwork).toHaveAttribute(
      "aria-valuetext",
      "Fernwork FRN, now 30 percent, on target, purchase of $4,960 settled.",
    );
    // 30 of the 38 points the track is scaled to, and the drift is spent.
    await expect
      .poll(fillFractionOf(basinNow), { timeout: 5000 })
      .toBeCloseTo(0.79, 1);
    await expect(stage.getByText("Settled", { exact: true })).toHaveCount(4);
    await expect(
      stage.getByRole("button", { name: "Nothing to trade" }),
    ).toBeDisabled();

    // The demo hands the drift back, and the trades are pending again.
    await reset.click();
    await expect(summary).toHaveText("Drift 9 points · $5,580 to move");
    await expect(basin).toHaveAttribute("aria-valuenow", "38");
    await expect(action).toBeEnabled();
  });

  test("holding-row: a press opens the position's lots, and Escape closes it back to its header", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/holding-row");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // One status per position, in the order the demo lists them.
    const basinSays = stage.locator("[role='status']").first();
    const basin = stage.getByRole("button", { name: "BSN Basin Holdings" });
    const fernwork = stage.getByRole("button", {
      name: "FRN Fernwork Industrial",
    });

    await expect(status).toContainText("Paused · Open BSN · 0 ticks");
    await expect(basinSays).toHaveText(
      "BSN $24.18, up 1.24 percent, 2,000 units worth $48,360.00.",
    );
    await expect(basin).toHaveAttribute("aria-expanded", "true");
    await expect(fernwork).toHaveAttribute("aria-expanded", "false");

    // A closed panel is aria-hidden, so only the open one is in the tree at all.
    await expect(stage.getByRole("region")).toHaveCount(1);
    await expect(stage.getByRole("region")).toHaveAccessibleName("BSN");
    await expect(
      stage.getByRole("img", {
        name: "BSN over 30 sessions, low $22.06, high $23.00.",
      }),
    ).toBeVisible();
    await expect(
      stage.getByRole("table", { name: "Lots held in Basin Holdings (BSN)" }),
    ).toBeVisible();
    await expect(
      stage.getByRole("cell", { name: "12 Mar 2025" }),
    ).toBeVisible();
    await expect(stage.getByRole("cell", { name: "$17,840.00" })).toBeVisible();

    // Enter opens the next position, and the demo closes the one that was open.
    await fernwork.focus();
    await page.keyboard.press("Enter");
    await expect(fernwork).toHaveAttribute("aria-expanded", "true");
    await expect(basin).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("Paused · Open FRN · 0 ticks");
    await expect(stage.getByRole("region")).toHaveAccessibleName("FRN");
    await expect(
      stage.getByRole("img", {
        name: "FRN over 30 sessions, low $50.55, high $53.62.",
      }),
    ).toBeVisible();
    await expect(
      stage.getByRole("cell", { name: "22 Jan 2025" }),
    ).toBeVisible();

    // Escape closes the row and hands focus back to the header that opened it.
    await page.keyboard.press("Escape");
    await expect(fernwork).toHaveAttribute("aria-expanded", "false");
    await expect(fernwork).toBeFocused();
    await expect(status).toContainText("Paused · All closed · 0 ticks");
    await expect(stage.getByRole("region")).toHaveCount(0);

    // Space is the other half of the press.
    await page.keyboard.press(" ");
    await expect(fernwork).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Open FRN");

    // The live feed is the row's other edge: a tick moves the price the row
    // publishes, and the demo counts every one of them.
    const live = stage.getByRole("switch", { name: "Live prices" });
    await live.click();
    await expect(live).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Live ·");
    await expect
      .poll(
        async () =>
          Number(/(\d+) ticks/.exec((await status.textContent()) ?? "")?.[1]),
        { timeout: 12_000 },
      )
      .toBeGreaterThan(0);
    await live.click();
    await expect(live).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Paused ·");
    // The sentence is still one sentence, and it is no longer the seeded price.
    await expect(basinSays).toHaveText(
      /^BSN \$\d+\.\d{2}, (up|down) \d+\.\d{2} percent, 2,000 units worth \$[\d,]+\.\d{2}\.$/,
    );
    await expect(basinSays).not.toContainText("BSN $24.18,");
  });

  test("allocation-slider: keys move one row, the others give, and a lock refuses to", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/allocation-slider");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const basin = stage.getByRole("slider", { name: "Basin BSN" });
    const fernwork = stage.getByRole("slider", { name: "Fernwork FRN" });
    const coldbrook = stage.getByRole("slider", { name: "Coldbrook CBK" });

    await expect(status).toContainText("BSN 40 · FRN 25 · CBK 20 · GGE 15");
    await expect(status).toContainText("Sum 100");
    await expect(announced).toHaveText(
      "Mix: Basin BSN 40, Fernwork FRN 25, Coldbrook CBK 20, Gauge GGE 15. Sum 100 percent.",
    );
    await expect(basin).toHaveAttribute("aria-valuenow", "40");
    await expect(basin).toHaveAttribute(
      "aria-valuetext",
      "40 percent, $19,280",
    );

    // One step up, and the untouched rows give it back in proportion.
    await basin.focus();
    await page.keyboard.press("ArrowRight");
    await expect(basin).toHaveAttribute("aria-valuenow", "41");
    await expect(status).toContainText("BSN 41 · FRN 24 · CBK 20 · GGE 15");

    // Page keys move five, and the whole numbers still sum to exactly 100.
    await page.keyboard.press("PageDown");
    await expect(basin).toHaveAttribute("aria-valuenow", "36");
    await expect(status).toContainText("BSN 36 · FRN 26 · CBK 22 · GGE 16");
    await expect(status).toContainText("Sum 100");

    // Home empties the row, and the pool is shared out rather than lost.
    await page.keyboard.press("Home");
    await expect(basin).toHaveAttribute("aria-valuenow", "0");
    await expect(status).toContainText("BSN 0 · FRN 41 · CBK 34 · GGE 25");
    await expect(announced).toHaveText(
      "Mix: Basin BSN 0, Fernwork FRN 41, Coldbrook CBK 34, Gauge GGE 25. Sum 100 percent.",
    );

    // A locked row leaves the pool, and pulling harder cannot break it.
    const lock = stage.getByRole("switch", {
      name: "Lock Fernwork FRN at 41 percent",
    });
    await lock.click();
    await expect(lock).toHaveAttribute("aria-checked", "true");
    await expect(fernwork).toHaveAttribute("aria-disabled", "true");
    await expect(stage.getByText("1 locked")).toBeVisible();

    await coldbrook.focus();
    await expect(coldbrook).toHaveAttribute("aria-valuemax", "59");
    await page.keyboard.press("End");
    await expect(coldbrook).toHaveAttribute("aria-valuenow", "59");
    await expect(fernwork).toHaveAttribute("aria-valuenow", "41");
    await expect(status).toContainText("BSN 0 · FRN 41 · CBK 59 · GGE 0");

    // The lock refuses the key as well as the pointer.
    await fernwork.focus();
    await page.keyboard.press("ArrowRight");
    await expect(fernwork).toHaveAttribute("aria-valuenow", "41");
    await expect(status).toContainText("BSN 0 · FRN 41 · CBK 59 · GGE 0");

    await stage.getByRole("button", { name: "Reset mix" }).click();
    await expect(status).toContainText("BSN 40 · FRN 25 · CBK 20 · GGE 15");
    await expect(
      stage.getByRole("button", { name: "Reset mix" }),
    ).toBeDisabled();
  });

  test("dividend-calendar: arrows read the days, a press pins one, and Page turns the month", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/dividend-calendar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const grid = stage.getByRole("grid", {
      name: "Waylight Pay · income calendar",
    });
    const ninth = grid.getByRole("button", {
      name: "9 September, BSN, $18.40",
      exact: true,
    });

    await expect(status).toContainText("Sep · 6 payouts · total $77.00");
    await expect(status).toContainText("reading —");
    await expect(announced).toHaveText("September, 6 payouts, $77.00 total");
    // A day that pays says so in its own name, so the coin is never the only
    // carrier of the reading.
    await expect(
      grid.getByRole("button", {
        name: "13 September, no payout",
        exact: true,
      }),
    ).toBeVisible();

    // Focus reads the day: the header hands the month total back to that line.
    await ninth.focus();
    await expect(status).toContainText("reading BSN 9 Sep");
    await expect(stage.getByText("9 September · BSN")).toBeVisible();
    await expect(stage.getByText("$18.40", { exact: true })).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(
      grid.getByRole("button", {
        name: "10 September, no payout",
        exact: true,
      }),
    ).toBeFocused();
    await expect(status).toContainText("reading no pay 10 Sep");

    // Home walks back to the start of that week rather than the month.
    await page.keyboard.press("Home");
    await expect(
      grid.getByRole("button", { name: "7 September, no payout", exact: true }),
    ).toBeFocused();

    // Space pins the reading, and Escape releases it.
    await ninth.focus();
    await page.keyboard.press(" ");
    await expect(ninth).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(ninth).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("reading BSN 9 Sep");

    // PageDown turns the month and keeps the day of the month it was on.
    await page.keyboard.press("PageDown");
    await expect(announced).toHaveText("October, 3 payouts, $56.10 total");
    await expect(status).toContainText("Oct · 3 payouts · total $56.10");
    await expect(
      grid.getByRole("button", { name: "9 October, no payout", exact: true }),
    ).toBeFocused();
    await expect(
      grid.getByRole("button", { name: "7 October, BSN, $19.85", exact: true }),
    ).toBeVisible();

    // The nav is two labelled buttons, and it stops at the first month.
    const back = stage.getByRole("button", { name: "Previous month" });
    await back.click();
    await expect(announced).toHaveText("September, 6 payouts, $77.00 total");
    await back.click();
    await expect(announced).toHaveText("August, 4 payouts, $61.00 total");
    await expect(status).toContainText("Aug · 4 payouts · total $61.00");
    await expect(status).toContainText("reading —");
    await expect(back).toBeDisabled();
    await expect(
      grid.getByRole("button", { name: "5 August, BSN, $18.40", exact: true }),
    ).toBeVisible();
  });

  test("gain-loss: the sort re-ranks the rows and the basis re-scales every bar", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gain-loss");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const sorts = stage.getByRole("radiogroup", { name: "Sort holdings" });
    const best = sorts.getByRole("radio", { name: "Best" });
    const worst = sorts.getByRole("radio", { name: "Worst" });
    const name = sorts.getByRole("radio", { name: "Name" });
    const rows = stage.getByRole("listitem");
    // The bars are aria-hidden decoration, so they are found by their tone
    // inside the row the spoken sentence identifies.
    const coldbrookBar = rows
      .filter({ hasText: "CBK, up $2,180" })
      .locator("span.bg-success");
    const gaugeBar = rows
      .filter({ hasText: "GGE, down $1,615" })
      .locator("span.bg-danger");

    await expect(status).toContainText(
      "Sort best · basis amount · net +$2,410 · 6 holdings",
    );
    await expect(announced).toHaveText(
      "Sorted by best, net +$2,410 across 6 holdings",
    );
    // Direction is a word, not a plus sign a screen reader may swallow.
    await expect(rows).toContainText([
      "CBK, up $2,180, 4.2 percent",
      "BSN, up $1,240, 6.8 percent",
      "WAY, up $1,035, 2.6 percent",
      "FLD, unchanged",
      "FRN, down $430, 3.1 percent",
      "GGE, down $1,615, 9.4 percent",
    ]);
    // In money, Coldbrook is the largest move, so its bar reaches the edge.
    await expect
      .poll(fillFractionOf(coldbrookBar), { timeout: 5000 })
      .toBeCloseTo(0.5, 1);
    await expect
      .poll(fillFractionOf(gaugeBar), { timeout: 5000 })
      .toBeLessThan(0.44);

    // Focus activates the sort, and the rows travel to their new places.
    await best.focus();
    await page.keyboard.press("ArrowRight");
    await expect(worst).toBeFocused();
    await expect(worst).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Sort worst");
    await expect(rows).toContainText([
      "GGE, down $1,615, 9.4 percent",
      "FRN, down $430, 3.1 percent",
      "FLD, unchanged",
      "WAY, up $1,035, 2.6 percent",
      "BSN, up $1,240, 6.8 percent",
      "CBK, up $2,180, 4.2 percent",
    ]);

    await page.keyboard.press("End");
    await expect(name).toBeFocused();
    await expect(status).toContainText("Sort name");
    await expect(rows).toContainText([
      "BSN, up $1,240, 6.8 percent",
      "CBK, up $2,180, 4.2 percent",
      "FLD, unchanged",
      "FRN, down $430, 3.1 percent",
      "GGE, down $1,615, 9.4 percent",
      "WAY, up $1,035, 2.6 percent",
    ]);
    await page.keyboard.press("Home");
    await expect(best).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText(
      "Sorted by best, net +$2,410 across 6 holdings",
    );

    // Percent re-scales the whole set against a new maximum: Gauge's 9.4 is the
    // biggest move once money stops being the measure, so the bars swap ends.
    await stage.getByRole("button", { name: "Measure percent" }).click();
    await expect(status).toContainText("basis percent");
    await expect(stage.getByText("+6.8%", { exact: true })).toBeVisible();
    await expect(rows).toContainText([
      "BSN, up $1,240, 6.8 percent",
      "CBK, up $2,180, 4.2 percent",
      "WAY, up $1,035, 2.6 percent",
      "FLD, unchanged",
      "FRN, down $430, 3.1 percent",
      "GGE, down $1,615, 9.4 percent",
    ]);
    await expect
      .poll(fillFractionOf(gaugeBar), { timeout: 5000 })
      .toBeCloseTo(0.5, 1);
    await expect
      .poll(fillFractionOf(coldbrookBar), { timeout: 5000 })
      .toBeLessThan(0.28);

    await stage.getByRole("button", { name: "Measure money" }).click();
    await expect(status).toContainText("basis amount");
    await expect(stage.getByText("+$2,180", { exact: true })).toBeVisible();
  });

  test("cost-basis: a re-mark moves the lane, and the per-share toggle deliberately does not", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/cost-basis");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const lane = stage.getByRole("img", { name: /^Paid / });
    // Base fill to the paid mark, then the coloured extension out to worth.
    const base = lane.locator("span").nth(0);
    const extension = lane.locator("span").nth(1);
    const perShare = stage.getByRole("switch", { name: "Per share" });

    await expect(status).toContainText(
      "Worth $14,824 · paid $12,410 · +19.5% · per share off",
    );
    await expect(announced).toHaveText(
      "Paid $12,410, worth $14,824, up $2,414, 19.5 percent",
    );
    await expect(lane).toHaveAttribute(
      "aria-label",
      "Paid $12,410, worth $14,824, up $2,414, 19.5 percent",
    );
    await expect(perShare).toHaveAttribute("aria-checked", "false");
    await expect(
      stage.getByText("BSN · 340 shares · $36.50 → $43.60"),
    ).toBeVisible();

    // Both fills glide out of nothing, so the lane is measured only once each
    // of them has arrived: 75% of the track to the paid mark, 15% beyond it.
    await expect.poll(fillFractionOf(base), { timeout: 5000 }).toBe(0.75);
    await expect.poll(fillFractionOf(extension), { timeout: 5000 }).toBe(0.15);
    const settledBase = await boxWidthOf(base);
    const settledExtension = await boxWidthOf(extension);

    // Space flips the toggle, and both figures divide by the same share count —
    // so the lane must not move, because the position did not change.
    await perShare.focus();
    await page.keyboard.press(" ");
    await expect(perShare).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("per share on");
    await expect(stage.getByText("Paid $36.50")).toBeAttached();
    await expect(stage.getByText("Worth $43.60")).toBeAttached();
    await expect(stage.getByText("Paid / share")).toBeVisible();
    expect(await boxWidthOf(base)).toBeCloseTo(settledBase, 0);
    expect(await boxWidthOf(extension)).toBeCloseTo(settledExtension, 0);
    // The lane's own sentence still speaks the position, not the per-share view.
    await expect(lane).toHaveAttribute(
      "aria-label",
      "Paid $12,410, worth $14,824, up $2,414, 19.5 percent",
    );

    await page.keyboard.press(" ");
    await expect(perShare).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("per share off");

    // A higher mark widens the extension, because the gap is what it draws.
    await stage.getByRole("button", { name: "Mark up" }).click();
    await expect(announced).toHaveText(
      "Paid $12,410, worth $15,317, up $2,907, 23.4 percent",
    );
    await expect(status).toContainText("Worth $15,317 · paid $12,410 · +23.4%");
    await expect
      .poll(async () => boxWidthOf(extension), { timeout: 5000 })
      .toBeGreaterThan(settledExtension);

    // Marked under what it cost, the position reads down and the extension
    // flips to the other side of the paid mark.
    await stage.getByRole("button", { name: "Reset" }).click();
    for (let step = 0; step < 5; step += 1) {
      await stage.getByRole("button", { name: "Mark down" }).click();
    }
    await expect(announced).toHaveText(
      "Paid $12,410, worth $12,359, down $51, 0.4 percent",
    );
    await expect(status).toContainText("Worth $12,359 · paid $12,410 · -0.4%");
    await expect(
      stage.getByText("BSN · 340 shares · $36.50 → $36.35"),
    ).toBeVisible();
    await expect
      .poll(fillFractionOf(extension), { timeout: 5000 })
      .toBeLessThan(0.02);
  });

  test("portfolio-pulse: a print rolls the book, and the beat stills once the tape stops", async ({
    page,
  }) => {
    // The tape's quiet windows are real seconds — 1.6s of nothing is what tells
    // a live book from a still one — and this route's first paint is the
    // slowest in the family, so the pair of them wants more than the default.
    test.setTimeout(45_000);
    await gotoHydrated(page, "/components/portfolio-pulse");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const beat = beatWordOf(stage);

    await expect(
      stage.getByRole("group", { name: "Basinworks · aggregate book" }),
    ).toBeVisible();
    await expect(status).toContainText("Book $148,000 · 0 ticks · flat");
    await expect(status).toContainText("beat held");
    await expect(stage.getByText("1 / 36 marks")).toBeVisible();
    await expect.poll(beat, { timeout: 4000 }).toBe("Waiting");
    await expect(announced).toHaveText(
      "$148,000, level 0.00 percent on the open",
    );

    // One print: the card rolls what it was given and reports the direction.
    await stage.getByRole("button", { name: "Tick" }).click();
    await expect(status).toContainText("Book $148,069 · 1 ticks · up");
    await expect(stage.getByText("2 / 36 marks")).toBeVisible();
    // The sentence is written once the tape settles, never once per print.
    await expect.poll(beat, { timeout: 6000 }).toBe("Still");
    await expect(announced).toHaveText("$148,069, up 0.05 percent on the open");

    // A running tape keeps the beat alive between prints.
    await stage.getByRole("button", { name: "Live" }).click();
    await expect.poll(beat, { timeout: 4000 }).toBe("Live");
    await expect
      .poll(
        async () =>
          Number(
            /·\s*(\d+)\s*ticks/.exec((await status.textContent()) ?? "")?.[1],
          ),
        { timeout: 8000 },
      )
      .toBeGreaterThanOrEqual(3);
    await stage.getByRole("button", { name: "Stop" }).click();
    await expect.poll(beat, { timeout: 6000 }).toBe("Still");
    await expect(announced).toHaveText(
      /^\$1[\d,]+, (up|down|level) \d+\.\d{2} percent on the open$/,
    );

    // Reset stops the tape and hands the seeded open back. The card reports
    // that as a print of its own — the mark really did change — so the demo's
    // counter starts again from one rather than returning to zero.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Book $148,000 ·");
    await expect(status).toContainText("beat held");
    await expect(announced).toHaveText(
      "$148,000, level 0.00 percent on the open",
      { timeout: 6000 },
    );
  });

  test("watch-drag: the keyboard does the whole gesture, and a drag lands the same way", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/watch-drag");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const basinGrip = stage.getByRole("button", { name: /^Reorder BSN,/ });

    await expect(status).toContainText(
      "Order BSN · FRN · CBK · GGE · WAY · FLD — moves 0",
    );
    await expect(basinGrip).toHaveAccessibleName(
      "Reorder BSN, position 1 of 6",
    );
    await expect(basinGrip).toHaveAttribute("aria-pressed", "false");
    // Only the grip is focusable, so Tab walks ranks rather than readouts.
    await expect(stage.getByRole("button")).toHaveCount(7);

    // Space lifts, and every step says where the row now stands.
    await basinGrip.focus();
    await page.keyboard.press(" ");
    await expect(basinGrip).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText("BSN lifted at position 1 of 6.");

    await page.keyboard.press("ArrowDown");
    await expect(announced).toHaveText("BSN moved to position 2 of 6.");
    await expect(status).toContainText(
      "Order FRN · BSN · CBK · GGE · WAY · FLD — moves 1",
    );
    await expect(basinGrip).toHaveAccessibleName(
      "Reorder BSN, position 2 of 6",
    );

    await page.keyboard.press("End");
    await expect(announced).toHaveText("BSN moved to position 6 of 6.");
    await expect(status).toContainText(
      "Order FRN · CBK · GGE · WAY · FLD · BSN",
    );

    // Escape puts the row back where the lift started, not where it last was.
    await page.keyboard.press("Escape");
    await expect(announced).toHaveText(
      "Move cancelled. BSN back at position 1 of 6.",
    );
    await expect(basinGrip).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText(
      "Order BSN · FRN · CBK · GGE · WAY · FLD — moves 3",
    );

    // Lifted again, two steps down, and Space drops it there for good.
    await basinGrip.focus();
    await page.keyboard.press(" ");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(" ");
    await expect(basinGrip).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toHaveText("BSN dropped at position 3 of 6.");
    await expect(status).toContainText(
      "Order FRN · CBK · BSN · GGE · WAY · FLD — moves 5",
    );

    // Unlifted, the same arrow walks focus between grips instead.
    await page.keyboard.press("ArrowDown");
    await expect(
      stage.getByRole("button", { name: "Reorder GGE, position 4 of 6" }),
    ).toBeFocused();

    await stage.getByRole("button", { name: "Reset order" }).click();
    await expect(status).toContainText(
      "Order BSN · FRN · CBK · GGE · WAY · FLD — moves 0",
    );

    // The pointer lands a row the same way: past the slop it captures, and the
    // drop settles into the slot two pitches up.
    const gauge = stage.getByRole("button", {
      name: "Reorder GGE, position 4 of 6",
    });
    const box = await gauge.boundingBox();
    expect(box).not.toBeNull();
    const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 20, { steps: 4 });
    await page.mouse.move(startX, startY - 70, { steps: 4 });
    await page.mouse.move(startX, startY - 108, { steps: 4 });
    await page.mouse.up();

    await expect(announced).toHaveText("GGE dropped at position 2 of 6.");
    await expect(status).toContainText(
      "Order BSN · GGE · FRN · CBK · WAY · FLD — moves 1",
    );
    await expect(
      stage.getByRole("button", { name: "Reorder GGE, position 2 of 6" }),
    ).toBeVisible();
  });
});

/**
 * The defi family is arithmetic you can press: a pair that flips, a tolerance
 * you set, a slice of a pool, a lock that shuts on a term. Every test drives
 * the mechanic the component advertises — through the keyboard wherever it
 * publishes one — and reads the outcome off the demo's status line, the ARIA
 * value the control carries, and the sentence the component speaks about
 * itself.
 */
test.describe("defi", () => {
  test("swap-pair: the flip trades the fields, and the figure it was about to receive is what it now pays", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/swap-pair");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card speaks its own settled pair before the demo's line does.
    const announced = stage.locator("[role='status']").first();
    const pay = stage.getByLabel("You pay");

    await expect(status).toContainText("Pay 250.00 BSN — Receive 3,104.50 FRN");
    await expect(pay).toHaveValue("250");
    // The announcement is the settled pair in one sentence, not a rate table.
    await expect(announced).toHaveText(
      "Paying 250.00 BSN, receiving 3,104.50 FRN. One BSN is 12.418 FRN.",
    );

    // The control is named by the outcome it performs, so it is pressed by
    // what it does rather than by the arrow drawn inside it.
    await stage
      .getByRole("button", { name: "Pay Fernwork, receive Basin" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Pay 3,104.50 FRN — Receive 250.00 BSN");
    await expect(pay).toHaveValue("3104.5");

    // 3,104.50 FRN is far past a 96.20 balance, and the refusal is carried in
    // words on the field rather than by the danger tint alone — while the
    // receive figure still computes, because hiding it would hide the reason.
    await expect(pay).toHaveAttribute("aria-invalid", "true");
    await expect(pay).toHaveAccessibleDescription("Over balance");

    // Max fills the field with the whole balance, which lands back inside it.
    await stage.getByRole("button", { name: "Pay maximum, 96.20 FRN" }).click();
    await expect(status).toContainText("Pay 96.20 FRN — Receive 7.75 BSN");
    await expect(pay).not.toHaveAttribute("aria-invalid", "true");

    // Typing drives the same arithmetic as the presses do.
    await pay.fill("10");
    await expect(status).toContainText("Pay 10.00 FRN — Receive 0.81 BSN");

    // Space is the other half of the same press, and the pair comes back the
    // way it went: what was about to be received is what is now paid.
    await stage
      .getByRole("button", { name: "Pay Basin, receive Fernwork" })
      .focus();
    await page.keyboard.press(" ");
    await expect(status).toContainText("Pay 0.81 BSN — Receive 10.00 FRN");
    await expect(pay).toHaveValue("0.805283");
  });

  test("slippage-dial: arrows walk the stops, a typed figure takes the knob, and emptying hands it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/slippage-dial");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const stops = stage.getByRole("radiogroup", { name: "Preset tolerance" });
    const tenth = stops.getByRole("radio", { name: "0.1%", exact: true });
    const half = stops.getByRole("radio", { name: "0.5%", exact: true });
    const one = stops.getByRole("radio", { name: "1%", exact: true });
    const custom = stage.getByLabel("Custom tolerance, percent");

    await expect(status).toContainText("Tolerance 0.50% — Min 3,088.98 FRN");
    await expect(half).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText(
      "Tolerance 0.5%. Minimum received 3,088.98 FRN.",
    );

    // Activation follows focus: the arrow both moves and chooses, and the
    // minimum answers the stop it lands on.
    await half.focus();
    await page.keyboard.press("ArrowRight");
    await expect(one).toBeFocused();
    await expect(one).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Tolerance 1.00% — Min 3,073.46 FRN");

    // The rail does not wrap past its last stop.
    await page.keyboard.press("ArrowRight");
    await expect(one).toBeFocused();
    await expect(one).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(tenth).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Tolerance 0.10% — Min 3,101.40 FRN");

    // A tolerance too small to settle is named in words on the field, not left
    // to a tint, and no preset holds the knob while the field does.
    await custom.fill("0.01");
    await expect(status).toContainText("Tolerance 0.01% — Min 3,104.19 FRN");
    await expect(custom).toHaveAttribute("aria-invalid", "true");
    await expect(custom).toHaveAccessibleDescription(
      "The trade may not settle: prices move more than this between blocks.",
    );
    await expect(tenth).toHaveAttribute("aria-checked", "false");

    // Emptying the field hands the tolerance back to the first stop rather
    // than leaving the dial with nothing live.
    await custom.fill("");
    await expect(tenth).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Tolerance 0.10% — Min 3,101.40 FRN");

    // The wide case warns with the sum the quote could slip by, and says it in
    // the announcement as well as under the rail.
    await stage.getByRole("button", { name: "Widen to 5%" }).click();
    await expect(status).toContainText("Tolerance 5.00% — Min 2,949.27 FRN");
    await expect(custom).toHaveValue("5");
    await expect(custom).toHaveAttribute("aria-invalid", "true");
    await expect(announced).toHaveText(
      "Tolerance 5%. Minimum received 2,949.27 FRN. A quote can settle up to 155.23 FRN below this one.",
    );
  });

  test("pool-share: an add grows the wedge and the meter, and the totals reading is a press away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/pool-share");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", {
      name: "Your share of the BSN / FRN pool",
    });
    const totals = stage.getByRole("button", { name: "Pool totals" });
    // Both readings are always mounted so the cross-fade has something to fade
    // to; which one is live is carried by aria-hidden, not by opacity.
    const pooled = stage.locator("dl").nth(1);

    await expect(status).toContainText("Share 2.41% — Position $29,900");
    await expect(meter).toHaveAttribute("aria-valuenow", "2.41");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2.41 percent of the pool, $29,900 of $1,240,000",
    );
    await expect(announced).toHaveText(
      "Position $29,900, 2.41 percent of the BSN / FRN pool. Fees earned $185.",
    );

    // The second reading is a real pressed button, so the keyboard reaches the
    // pool's own totals exactly as the pointer does.
    await expect(totals).toHaveAttribute("aria-pressed", "false");
    await expect(pooled).toHaveAttribute("aria-hidden", "true");
    await totals.focus();
    await page.keyboard.press("Enter");
    await expect(totals).toHaveAttribute("aria-pressed", "true");
    await expect(pooled).toHaveAttribute("aria-hidden", "false");
    await expect(pooled).toContainText("41,800");

    // Escape hands the card back to your share without moving focus.
    await page.keyboard.press("Escape");
    await expect(totals).toHaveAttribute("aria-pressed", "false");
    await expect(totals).toBeFocused();
    await expect(pooled).toHaveAttribute("aria-hidden", "true");

    // The add raises the position and the pool together, so the wedge grows by
    // the difference between the two rather than by the sum alone.
    await stage.getByRole("button", { name: "Add $500" }).click();
    await expect(stage.getByText("+$500")).toBeVisible();
    await expect(status).toContainText("Share 2.45% — Position $30,400");
    await expect(meter).toHaveAttribute("aria-valuenow", "2.45");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2.45 percent of the pool, $30,400 of $1,240,500",
    );
    await expect(announced).toHaveText(
      "Position $30,400, 2.45 percent of the BSN / FRN pool. Fees earned $185.",
    );

    await stage.getByRole("button", { name: "Reset position" }).click();
    await expect(status).toContainText("Share 2.41% — Position $29,900");
    await expect(meter).toHaveAttribute("aria-valuenow", "2.41");
  });

  test("stake-lock: keys walk the detents, the lock shuts on the term, and the cancel arms before it opens", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/stake-lock");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const rail = stage.getByRole("slider", { name: "Lock term" });

    await expect(status).toContainText(
      "Term 90 d · 4.80% — Yield 49.71 BSN — Open",
    );
    await expect(rail).toHaveAttribute("aria-valuenow", "90");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "90 days, 4.8 percent, earns 49.71 BSN",
    );

    // Each detent carries its own rate, so the yield is the figure answering
    // the term rather than a number scaled off one.
    await rail.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rail).toHaveAttribute("aria-valuenow", "180");
    await expect(status).toContainText("Term 180 d · 6.40% — Yield 132.56 BSN");

    // End is the longest term, and the rail does not run past it.
    await page.keyboard.press("End");
    await expect(rail).toHaveAttribute("aria-valuenow", "365");
    await expect(status).toContainText("Term 365 d · 8.10% — Yield 340.20 BSN");
    await page.keyboard.press("ArrowRight");
    await expect(rail).toHaveAttribute("aria-valuenow", "365");

    await page.keyboard.press("Home");
    await expect(rail).toHaveAttribute("aria-valuenow", "30");
    await expect(status).toContainText("Term 30 d · 3.20% — Yield 11.05 BSN");

    // Page keys move two detents at once.
    await page.keyboard.press("PageUp");
    await expect(rail).toHaveAttribute("aria-valuenow", "180");
    await expect(rail).toHaveAttribute(
      "aria-valuetext",
      "180 days, 6.4 percent, earns 132.56 BSN",
    );

    // Shutting the lock starts the only clock on the card and takes the rail
    // out of service — a term cannot be re-chosen once it is locked.
    await stage.getByRole("button", { name: "Lock 180 days" }).click();
    await expect(status).toContainText("— Locked");
    await expect(announced).toHaveText(
      "Locked for 180 days at 6.4 percent, earning 132.56 BSN.",
    );
    await expect(rail).toHaveAttribute("aria-disabled", "true");
    await expect(stage.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /^Unlocks in (180d 00:00:00|179d 23:59:5\d)$/,
    );
    await rail.focus();
    await page.keyboard.press("Home");
    await expect(rail).toHaveAttribute("aria-valuenow", "180");

    // Cancelling early is destructive, so the first press only arms it and the
    // consequence is spoken in the button's own name.
    const cancel = stage.getByRole("button", { name: "Cancel lock early" });
    await cancel.click();
    await expect(announced).toHaveText(
      "Press again to cancel the lock. The earned yield is forfeit.",
    );
    const confirm = stage.getByRole("button", {
      name: "Confirm cancel, the earned yield is forfeit",
    });
    await expect(confirm).toBeVisible();

    await confirm.click();
    await expect(announced).toHaveText(
      "Lock cancelled. The earned yield is forfeit and 4,200.00 BSN is released.",
    );
    await expect(status).toContainText("— Open");
    await expect(stage.getByRole("timer")).toHaveCount(0);
    await expect(rail).not.toHaveAttribute("aria-disabled", "true");
  });

  test("yield-curve: keys and a sweep both walk the ladder, and each term prints what it earns", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/yield-curve");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const plot = stage.getByRole("slider", {
      name: "Coldbrook Bank · term ladder",
    });

    await expect(status).toContainText("Term 90 d — Rate 4.60% — Earns $227");
    await expect(plot).toHaveAttribute("aria-valuenow", "90");
    await expect(plot).toHaveAttribute(
      "aria-valuetext",
      "90 days, 4.60 percent, earns $227",
    );
    await expect(announced).toHaveText("90 days, 4.60 percent, earns $227");

    // The axis is compressed by a square root, but a key still steps one term:
    // what moves is the marker, never the reading's grain.
    await plot.focus();
    await page.keyboard.press("ArrowRight");
    await expect(plot).toHaveAttribute("aria-valuenow", "180");
    await expect(status).toContainText("Term 180 d — Rate 5.70% — Earns $562");

    // Page keys move two terms, and the ladder stops at its own ends.
    await page.keyboard.press("PageUp");
    await expect(plot).toHaveAttribute("aria-valuenow", "365");
    await expect(status).toContainText(
      "Term 365 d — Rate 7.20% — Earns $1,440",
    );
    await page.keyboard.press("ArrowRight");
    await expect(plot).toHaveAttribute("aria-valuenow", "365");

    await page.keyboard.press("Home");
    await expect(plot).toHaveAttribute("aria-valuenow", "30");
    await expect(status).toContainText("Term 30 d — Rate 3.10% — Earns $51");
    await expect(announced).toHaveText("30 days, 3.10 percent, earns $51");

    // The demo's own jump is the same commit through a different door.
    await stage.getByRole("button", { name: "Longest term" }).click();
    await expect(plot).toHaveAttribute("aria-valuenow", "365");

    // A sweep across the plot lands on the nearest term to where it stops, and
    // the capture it takes on the way must not throw.
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    const midY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    const left = (box?.x ?? 0) + 6;
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) - 6, midY);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, midY, {
      steps: 6,
    });
    await page.mouse.move(left, midY, { steps: 6 });
    await page.mouse.up();
    await expect(plot).toHaveAttribute("aria-valuenow", "30");
    await expect(status).toContainText("Term 30 d — Rate 3.10% — Earns $51");
    await expect(announced).toHaveText("30 days, 3.10 percent, earns $51");
  });

  test("route-split: the legend walks the roads, a press pins one, and a rebalance re-lays it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/route-split");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const pinnedLine = stage.locator("[role='status']").first();
    const basin = stage.getByRole("button", {
      name: "Basin Pool, 52 percent, 6,240 BSN",
    });
    const fernwork = stage.getByRole("button", {
      name: "Fernwork Deep, 31 percent, 3,720 BSN",
    });
    const coldbrook = stage.getByRole("button", {
      name: "Coldbrook Bridge, 17 percent, 2,040 BSN",
    });
    const rebalance = stage.getByRole("button", { name: "Rebalance" });

    // With nothing read, the line is the whole trade rather than one road.
    await expect(status).toContainText("Route all roads — 3 legs · 12,000 BSN");
    await expect(pinnedLine).toBeEmpty();

    // Focus reads a road without deciding anything.
    await basin.focus();
    await expect(status).toContainText("Route Basin Pool — 52% · 6,240 BSN");
    await expect(pinnedLine).toBeEmpty();

    await page.keyboard.press("ArrowDown");
    await expect(fernwork).toBeFocused();
    await expect(status).toContainText("Route Fernwork Deep — 31% · 3,720 BSN");
    await page.keyboard.press("End");
    await expect(coldbrook).toBeFocused();
    await page.keyboard.press("Home");
    await expect(basin).toBeFocused();

    // The press is the decision, and it is the only thing announced.
    await page.keyboard.press("Enter");
    await expect(basin).toHaveAttribute("aria-pressed", "true");
    await expect(pinnedLine).toHaveText("Routing 6,240 BSN through Basin Pool");

    // A pin holds after the pointer and the focus have left it.
    await rebalance.focus();
    await expect(status).toContainText("Route Basin Pool — 52% · 6,240 BSN");

    // A changed split re-lays the roads and re-prints every share, and the pin
    // keeps reading the road it was put on.
    await rebalance.click();
    await expect(status).toContainText("Route Basin Pool — 44% · 5,280 BSN");
    await expect(pinnedLine).toHaveText("Routing 5,280 BSN through Basin Pool");
    await expect(
      stage.getByRole("button", {
        name: "Coldbrook Bridge, 32 percent, 3,840 BSN",
      }),
    ).toBeVisible();

    // Escape unpins and keeps focus, so the reading falls back to the road the
    // keyboard is standing on and then to the whole trade.
    const rebalanced = stage.getByRole("button", {
      name: "Basin Pool, 44 percent, 5,280 BSN",
    });
    await rebalanced.focus();
    await page.keyboard.press("Escape");
    await expect(rebalanced).toHaveAttribute("aria-pressed", "false");
    await expect(rebalanced).toBeFocused();
    await expect(pinnedLine).toBeEmpty();
    await rebalance.focus();
    await expect(status).toContainText("Route all roads — 3 legs · 12,000 BSN");
  });

  test("approve-step: the swap stays asleep until the approval lands, and says why while it is", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/approve-step");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const approve = stage.getByRole("button", { name: "Approve 12,000 BSN" });
    const swap = stage.getByRole("button", {
      name: "Swap 12,000 BSN for about 148,320 FRN",
    });

    await expect(status).toContainText("step 1 · approve 12,000 BSN");
    // Never `disabled`: a control taken out of the tab order cannot say why it
    // is asleep, and the reason is the whole point of the pair.
    await expect(swap).toHaveAttribute("aria-disabled", "true");
    await expect(swap).toHaveAccessibleDescription(
      "Approve the allowance before swapping.",
    );

    // A press on the sleeping half does nothing at all: the keyboard reaches
    // it, hears why it is dimmed, and the guarded handler refuses it.
    await swap.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("step 1 · approve 12,000 BSN");

    await approve.focus();
    await page.keyboard.press("Enter");
    await expect(approve).toHaveAttribute("aria-busy", "true");
    await expect(status).toContainText("step 1 · approving");

    // The host resolves it; the control never invents the time.
    await expect(status).toContainText("step 2 · swap ready", {
      timeout: 5000,
    });
    await expect(announced).toHaveText("Approved. Swap is ready.");
    await expect(approve).toHaveCount(0);
    await expect(swap).toHaveAttribute("aria-disabled", "false");
    // The button the press was standing on has become a chip, so focus is
    // handed to the step that just woke rather than dropped on the body.
    await expect(swap).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(swap).toHaveAttribute("aria-busy", "true");
    await expect(status).toContainText("step 2 · swapping");

    await expect(status).toContainText("done · 148,320 FRN", { timeout: 5000 });
    await expect(announced).toHaveText("Swap complete. 148,320 FRN received.");
    await expect(swap).toHaveText("Swapped");
    await expect(swap).toHaveAttribute("aria-disabled", "true");

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("step 1 · approve 12,000 BSN");
    await expect(approve).toBeVisible();
  });

  test("harvest-tap: the press empties the cup into the balance, and the tap fills it again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/harvest-tap");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const harvest = stage.getByRole("button", { name: "Harvest" });

    // Nothing runs until the tap is opened, so the seeded figure is exact.
    await expect(stage.getByText("Paused", { exact: true })).toBeVisible();
    await expect(status).toContainText(
      "Balance 1,250.00 BSN · tap closed · harvested 0× 0.00 BSN",
    );
    await expect(announced).toBeEmpty();
    await expect(harvest).toBeEnabled();

    // The press carries the figure it read at the moment it was pressed, and
    // that sum is spoken once rather than per tick.
    await harvest.click();
    await expect(status).toContainText(
      "Balance 1,253.60 BSN · tap closed · harvested 1× 3.60 BSN",
    );
    await expect(announced).toHaveText(
      "Harvested 3.60 BSN. Balance 1,253.60 BSN.",
    );

    // An emptied cup is below the threshold, and the button names the
    // threshold rather than merely going grey.
    await expect(harvest).toBeDisabled();
    await expect(harvest).toHaveAccessibleDescription(
      "Harvest is available once 1.00 BSN has accrued.",
    );

    // Opening the tap fills it again, and the button wakes on the frame the
    // threshold is actually crossed.
    await stage.getByRole("button", { name: "Start" }).click();
    await expect(stage.getByText("Accruing", { exact: true })).toBeVisible();
    await expect(harvest).toBeEnabled({ timeout: 8000 });

    await harvest.click();
    await expect(announced).toHaveText(
      /^Harvested \d+\.\d{2} BSN\. Balance 1,2\d\d\.\d{2} BSN\.$/,
    );
    await expect(status).toContainText("harvested 2×");

    // Closing the tap says so in a word, not in a colour.
    await stage.getByRole("button", { name: "Pause" }).click();
    await expect(stage.getByText("Paused", { exact: true })).toBeVisible();
    await expect(status).toContainText("tap closed");

    // A reset returns the position to its seed, climb and all.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText(
      "Balance 1,250.00 BSN · tap closed · harvested 0× 0.00 BSN",
    );
  });

  test("impermanent-meter: a diverging price opens the gap, and the breakdown nets the fees against it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/impermanent-meter");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", { name: "Basinworks Exchange" });
    const difference = stage.getByRole("button", {
      name: /^Difference against holding/,
    });
    // The panel is measured rather than reserved, so which state it is in is
    // carried by aria-hidden and the control's own aria-expanded.
    const panel = stage.locator("[id$='-panel']");

    await expect(status).toContainText(
      "Ratio ×1.0 · divergence −0.00% · net +$186",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "0");
    await expect(difference).toHaveAccessibleName(
      "Difference against holding, $0",
    );
    await expect(difference).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveAttribute("aria-hidden", "true");

    // Doubling the pair costs the position 5.72% against simply holding it,
    // and the severity is a word as well as a tone.
    await stage.getByRole("button", { name: "×2.0" }).click();
    await expect(stage.getByRole("button", { name: "×2.0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(status).toContainText(
      "Ratio ×2.0 · divergence −5.72% · net −$1,796",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "5.72");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "5.72 percent below holding: $32,668 pooled against $34,650 held, net negative $1,796 after fees",
    );
    await expect(stage.getByText("Notable")).toBeVisible();
    await expect(difference).toHaveAccessibleName(
      "Difference against holding, $1,982",
    );

    // The breakdown is a real control on the keyboard path, not a hover trick
    // on the hatched gap, and it reads as terms and values.
    await difference.focus();
    await page.keyboard.press("Enter");
    await expect(difference).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(panel).toContainText("$34,650");
    await expect(panel).toContainText("$32,668");
    await expect(panel).toContainText("−$1,982");
    await expect(panel).toContainText("+$186");
    await expect(panel).toContainText("−$1,796");

    await page.keyboard.press("Escape");
    await expect(difference).toHaveAttribute("aria-expanded", "false");
    await expect(difference).toBeFocused();
    await expect(panel).toHaveAttribute("aria-hidden", "true");

    // Further divergence is heavier, and the meter carries the same figure the
    // status line prints.
    await stage.getByRole("button", { name: "×3.0" }).click();
    await expect(status).toContainText(
      "Ratio ×3.0 · divergence −13.40% · net −$6,004",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "13.4");
    await expect(stage.getByText("Heavy")).toBeVisible();
  });

  test("liquidity-range: the price leaving the band stops the earning, and the handles refuse to meet", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/liquidity-range");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const earning = stage.locator("[role='status']").first();
    const low = stage.getByRole("slider", { name: "Range minimum" });
    const high = stage.getByRole("slider", { name: "Range maximum" });

    await expect(status).toContainText(
      "Band 11.80 – 13.10 · price 12.42 in range · depth 47%",
    );
    await expect(low).toHaveAttribute("aria-valuenow", "11.8");
    await expect(low).toHaveAttribute("aria-valuetext", "11.80 FRN per BSN");
    await expect(high).toHaveAttribute("aria-valuenow", "13.1");
    await expect(earning).toHaveText("Price 12.42 is inside the band.");

    // Whether the band is earning is stated in words, never left to the pulse.
    const nudgeUp = stage.getByRole("button", { name: "Price +" });
    await nudgeUp.click();
    await expect(status).toContainText("price 12.70 in range");
    await nudgeUp.click();
    await nudgeUp.click();
    await expect(status).toContainText("price 13.26 out of range");
    await expect(earning).toHaveText(
      "Price 13.26 is outside the band. The position is not earning.",
    );
    await expect(
      stage.getByText("Out of range", { exact: true }),
    ).toBeVisible();

    // Widening the top of the band takes the price back inside it, and the
    // covered depth follows the band rather than the price.
    await high.focus();
    await page.keyboard.press("End");
    await expect(high).toHaveAttribute("aria-valuenow", "15.5");
    await expect(status).toContainText("price 13.26 in range · depth 80%");
    await expect(earning).toHaveText("Price 13.26 is inside the band.");

    // One arrow is one step of the axis's two-hundredth; Shift is ten of them.
    await low.focus();
    await page.keyboard.press("ArrowRight");
    await expect(low).toHaveAttribute("aria-valuenow", "11.83");
    await expect(low).toHaveAttribute("aria-valuetext", "11.83 FRN per BSN");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(low).toHaveAttribute("aria-valuenow", "12.13");
    await expect(status).toContainText("Band 12.13 – 15.50 · price 13.26");
    await expect(status).toContainText("depth 70%");

    // The handles stop one step apart: a band with no width earns nothing, so
    // Home on the upper handle lands on its neighbour plus a step.
    await high.focus();
    await page.keyboard.press("Home");
    await expect(high).toHaveAttribute("aria-valuenow", "12.16");
    await expect(low).toHaveAttribute("aria-valuenow", "12.13");
    await expect(status).toContainText(
      "Band 12.13 – 12.16 · price 13.26 out of range · depth 0%",
    );
  });
});

/**
 * The onchain family watches a ledger, so its outcomes are counts and states:
 * the block that took the next slot, the reading the strip was scrubbed to, the
 * rank a bumped fee climbed to, the node the token crossed onto. Every test
 * drives the mechanic the component advertises — through the keyboard wherever
 * it publishes one — and reads the result off the demo's status line, the ARIA
 * the component publishes about itself, and, where the outcome is a rolled
 * figure, the face each digit column actually settled on.
 */

/**
 * The figure a rolling readout is showing. Each column is ten faces tall and
 * translated by one face per digit, so the digit is the offset the wheel
 * settled on — the text alone carries all ten faces and says nothing.
 */
const rolledFigureOf = (target: Locator) => async (): Promise<string> =>
  target.evaluate((root) =>
    Array.from(root.children)
      .map((column) => {
        const wheel = column.firstElementChild;
        if (!(wheel instanceof HTMLElement)) return column.textContent ?? "";
        const box = wheel.getBoundingClientRect();
        const face = box.height / 10;
        if (face <= 0) return "?";
        return String(
          Math.round((column.getBoundingClientRect().top - box.top) / face),
        );
      })
      .join(""),
  );

/** How many transactions the queue says it holds, read off its own chip. */
const waitingOf = (stage: Locator) => async (): Promise<number> => {
  const chip = (await stage.getByText(/^\d+ waiting$/).textContent()) ?? "";
  return Number(/^(\d+)/.exec(chip)?.[1] ?? 0);
};

/** The seeded miner the block stream's demo runs, replayed for one height. */
const minedAt = (height: number): { txCount: number; percent: number } => {
  const txCount = 640 + (((height - 812441) * 397) % 1780);
  return { txCount, percent: Math.round((txCount / 2400) * 100) };
};

/** Grouped integers, the way every figure on these cards is printed. */
const grouped = (value: number): string => value.toLocaleString("en-US");

/**
 * The gas sampler's seeded walk, in the order the demo appends it. A reading is
 * a pure function of its sample number, so a run that lands two samples instead
 * of one is still exactly predictable.
 */
const GAS_FEED = [18.3, 27.1, 23.7, 20.5];
/** Readings the strip is seeded with before anything is sampled. */
const GAS_SEEDED = 14;

test.describe("onchain", () => {
  test("tx-status: six blocks land on the transfer, and a pinned tile holds its own block", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/tx-status");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card announces its phase before the demo's line, and only its phase:
    // a reader is not told about every block that lands.
    const announced = stage.locator("[role='status']").first();
    const track = stage.getByRole("progressbar", {
      name: "Waylight payout confirmations",
    });
    const detail = stage.locator("p[title]").first();

    await expect(status).toContainText("Transfer pending · block —");
    await expect(announced).toHaveText("Waylight payout pending.");
    await expect(track).toHaveAttribute("aria-valuenow", "0");
    await expect(track).toHaveAttribute("aria-valuemax", "6");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "0 of 6 confirmations, pending",
    );
    await expect(detail).toHaveText("In the queue. No blocks yet.");
    await expect(stage.getByText("Pending", { exact: true })).toBeVisible();

    // Empty slots are decoration: nothing is focusable until a block lands.
    await expect(
      stage.getByRole("group", {
        name: "Confirming blocks for Waylight payout",
      }),
    ).toBeVisible();
    await expect(stage.getByRole("button", { name: /^Block / })).toHaveCount(0);

    await stage.getByRole("button", { name: "Land blocks" }).click();
    await expect(announced).toHaveText("Waylight payout confirming.", {
      timeout: 5000,
    });
    await expect(track).toHaveAttribute("aria-valuetext", /confirming$/);

    // Six blocks in, the pill stamps and every reading of the card agrees.
    await expect(status).toContainText("Transfer final · block 812446", {
      timeout: 15000,
    });
    await expect(announced).toHaveText("Waylight payout final.");
    await expect(track).toHaveAttribute("aria-valuenow", "6");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "6 of 6 confirmations, final",
    );
    await expect(stage.getByText("Final", { exact: true })).toBeVisible();
    await expect(detail).toHaveText("Final after 6 confirmations.");

    const tiles = stage.getByRole("button", { name: /^Block / });
    await expect(tiles).toHaveCount(6);
    const oldest = stage.getByRole("button", {
      name: "Block 812,441, confirmation 1 of 6, 940 transactions",
    });
    const newest = stage.getByRole("button", {
      name: "Block 812,446, confirmation 6 of 6, 995 transactions",
    });

    // Focus lights a tile exactly as the pointer does, and the detail line
    // reads the block under it rather than the run as a whole.
    await oldest.focus();
    await expect(detail).toHaveText(
      "Block 812,441 · 940 tx · confirmation 1 of 6",
    );
    await page.keyboard.press("ArrowRight");
    await expect(
      stage.getByRole("button", { name: /^Block 812,442,/ }),
    ).toBeFocused();
    await expect(detail).toHaveText(
      "Block 812,442 · 1,211 tx · confirmation 2 of 6",
    );

    // End jumps to the block on top, and the row does not wrap past it.
    await page.keyboard.press("End");
    await expect(newest).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(newest).toBeFocused();
    await expect(detail).toHaveText(
      "Block 812,446 · 995 tx · confirmation 6 of 6",
    );

    await page.keyboard.press("Home");
    await expect(oldest).toBeFocused();

    // Pressing pins the block, so the demo's head follows the pin rather than
    // the newest tile; Escape hands it back without losing focus.
    await page.keyboard.press("Enter");
    await expect(oldest).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Transfer final · block 812441");
    await page.keyboard.press("Escape");
    await expect(oldest).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("Transfer final · block 812446");

    // A dropped transfer is the other ending: no slots, no stamp, no bounce.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(track).toHaveAttribute("aria-valuenow", "0");
    await stage.getByRole("button", { name: "Drop" }).click();
    await expect(status).toContainText("Transfer dropped · block —");
    await expect(announced).toHaveText(
      "Waylight payout dropped from the queue.",
    );
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "Dropped before any confirmation",
    );
    await expect(detail).toHaveText(
      "Dropped from the queue. Send it again to retry.",
    );
    await expect(stage.getByText("Dropped", { exact: true })).toBeVisible();
  });

  test("block-stream: the rail fills from the right, and a pointer or a focus holds the feed", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/block-stream");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const rail = stage.getByRole("list", { name: "Basin ledger" });
    const tiles = rail.getByRole("button");
    const caption = stage.locator("p[title]").first();
    const held = stage.getByText("Held", { exact: true });

    await expect(status).toContainText("Head 812443 · stopped · 1434 tx");
    await expect(announced).toHaveText("Block 812,443, 1,434 transactions.");
    await expect(tiles).toHaveCount(3);
    await expect(tiles.first()).toHaveAccessibleName(
      "Block 812,441, 640 transactions, 27 percent full",
    );
    await expect(caption).toHaveText("Block 812,443 · 1,434 tx · 60% full");
    await expect(held).toHaveCount(0);

    // Mining puts the newest block at the right-most place on the rail.
    await stage.getByRole("button", { name: "Start stream" }).click();
    await expect(status).toContainText("streaming");
    await expect(status).toContainText("Head 812444", { timeout: 8000 });

    // A reader's pointer holds the stream, so the tile being read cannot slide
    // out from under them — and pointing at it reads it into the caption.
    await stage.getByRole("button", { name: /^Block 812,441,/ }).hover();
    await expect(held).toBeVisible();
    await expect(status).toContainText("held");
    await expect(caption).toHaveText("Block 812,441 · 640 tx · 27% full");

    // The ticker is stopped, not ignored: nothing arrives at all while it is
    // held, so the head the hold caught is the head a second later.
    const frozen = (await status.textContent()) ?? "";
    await page.waitForTimeout(1000);
    expect(await status.textContent()).toBe(frozen);
    const head = Number(/Head (\d+)/.exec(frozen)?.[1] ?? 0);
    const newest = minedAt(head);

    // Focus does exactly what the pointer does, so the hold survives the mouse
    // wandering off and the rail is readable without one.
    await tiles.first().focus();
    await page.mouse.move(0, 0);
    await expect(held).toBeVisible();
    await expect(status).toContainText("held");

    await page.keyboard.press("End");
    await expect(tiles.last()).toBeFocused();
    await expect(caption).toHaveText(
      `Block ${grouped(head)} · ${grouped(newest.txCount)} tx · ${newest.percent}% full`,
    );
    await page.keyboard.press("ArrowRight");
    await expect(tiles.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tiles.first()).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(tiles.first()).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(tiles.first()).toHaveAttribute("aria-pressed", "false");

    // The feed runs again the moment focus leaves the rail, and the rail keeps
    // its cap: the tile pushed off the end leaves rather than piling up.
    await stage.getByRole("button", { name: "Pause stream" }).focus();
    await expect(held).toHaveCount(0);
    await expect(status).toContainText("streaming");
    await expect(status).toContainText("Head 812447", { timeout: 12000 });
    await expect(tiles).toHaveCount(5);
    await expect(tiles.last()).toHaveAccessibleName(
      `Block 812,447, ${grouped(minedAt(812447).txCount)} transactions, ${minedAt(812447).percent} percent full`,
    );
  });

  test("gas-tracker: the strip scrubs its own history, and a lowered ceiling flips the verdict", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gas-tracker");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card speaks the ceiling verdict only, so it says nothing per sample.
    const announced = stage.locator("[role='status']").first();
    const strip = stage.getByRole("slider", { name: "Basin relay fee" });
    const caption = stage.locator("p[title]").first();

    await expect(status).toContainText(
      "Fee 20.1 gu · ceiling 30 · under · live",
    );
    await expect(announced).toHaveText(
      "Basin relay fee under the 30.0 gu ceiling.",
    );
    await expect(strip).toHaveAttribute("aria-valuemin", "0");
    await expect(strip).toHaveAttribute("aria-valuemax", "13");
    await expect(strip).toHaveAttribute("aria-valuenow", "13");
    await expect(strip).toHaveAttribute(
      "aria-valuetext",
      "Reading 14 of 14, 20.1 gu, below the 30.0 gu ceiling, live",
    );
    await expect(caption).toHaveText("Under the 30.0 gu ceiling");

    // The strip is a real slider: the arrows walk the run one reading at a
    // time and the caption reads the column the cursor landed on.
    await strip.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(strip).toHaveAttribute("aria-valuenow", "12");
    await expect(strip).toHaveAttribute(
      "aria-valuetext",
      "Reading 13 of 14, 20.6 gu, below the 30.0 gu ceiling",
    );
    await expect(caption).toHaveText("Reading 13 of 14 · 20.6 gu");
    await expect(status).toContainText("reading 13 of 14");

    // Home is the oldest reading, and the run does not wrap past it.
    await page.keyboard.press("Home");
    await expect(strip).toHaveAttribute("aria-valuenow", "0");
    await expect(status).toContainText("reading 1 of 14");
    await page.keyboard.press("ArrowLeft");
    await expect(strip).toHaveAttribute("aria-valuenow", "0");

    // The peak of the run sits over the ceiling and the cursor says so — while
    // the spoken verdict stays with the live reading, not the scrubbed one.
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(strip).toHaveAttribute(
      "aria-valuetext",
      "Reading 5 of 14, 30.2 gu, above the 30.0 gu ceiling",
    );
    await expect(announced).toHaveText(
      "Basin relay fee under the 30.0 gu ceiling.",
    );

    await page.keyboard.press("End");
    await expect(strip).toHaveAttribute("aria-valuenow", "13");
    await page.keyboard.press("Escape");
    await expect(status).toContainText("· live");
    await expect(caption).toHaveText("Under the 30.0 gu ceiling");

    // Bringing the ceiling under the live reading is a crossing, and a
    // crossing is the one thing this card announces.
    const lower = stage.getByRole("button", { name: "Ceiling −5" });
    await lower.click();
    await lower.click();
    await expect(status).toContainText("ceiling 20 · over");
    await expect(announced).toHaveText(
      "Basin relay fee above the 20.0 gu ceiling.",
    );
    await expect(caption).toHaveText("Above the 20.0 gu ceiling");
    await expect(strip).toHaveAttribute(
      "aria-valuetext",
      "Reading 14 of 14, 20.1 gu, above the 20.0 gu ceiling, live",
    );

    // A sample lands at the right of the strip: the run grows a column and the
    // headline is the reading that arrived, whichever of them it is.
    await stage.getByRole("button", { name: "Start sampling" }).click();
    await expect
      .poll(async () => Number(await strip.getAttribute("aria-valuemax")), {
        timeout: 8000,
      })
      .toBeGreaterThan(13);
    await stage.getByRole("button", { name: "Pause sampling" }).click();
    const last = Number(await strip.getAttribute("aria-valuemax"));
    const landed = GAS_FEED[last - GAS_SEEDED] ?? 0;
    await expect(status).toContainText(`Fee ${landed.toFixed(1)} gu`);
    await expect(strip).toHaveAttribute("aria-valuenow", String(last));
    await expect(strip).toHaveAttribute(
      "aria-valuetext",
      `Reading ${last + 1} of ${last + 1}, ${landed.toFixed(1)} gu, ${
        landed >= 20 ? "above" : "below"
      } the 20.0 gu ceiling, live`,
    );
  });

  test("tx-flow: one roving tabindex crosses both columns, and a pinned leg keeps its reading", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/tx-flow");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The card speaks the reconciliation, which changes rarely; the readout
    // under the diagram is aria-hidden because each row already says it.
    const announced = stage.locator("[role='status']").first();
    const readout = stage.locator("p[title]").first();
    const inputs = stage.getByRole("list", {
      name: "Basinworks payout inputs",
    });
    const outputs = stage.getByRole("list", {
      name: "Basinworks payout outputs",
    });
    const inOne = inputs.getByRole("button", {
      name: "Input 1, bsn1q8f4…hd21c, 0.8200 BSN",
    });
    const inTwo = inputs.getByRole("button", {
      name: "Input 2, bsn1qk3r…7vte0, 0.4200 BSN",
    });
    const outTwo = outputs.getByRole("button", {
      name: "Output 2, bsn1qr7d…c1nf8, 0.3060 BSN",
    });
    const feeLeg = outputs.getByRole("button", {
      name: "Network fee, Basin relay, 0.0040 BSN",
    });

    await expect(status).toContainText("Legs 5 · flowing");
    await expect(announced).toHaveText(
      "Basinworks payout balanced: in 1.2400 BSN, out 1.2360 BSN, fee 0.0040 BSN.",
    );
    await expect(readout).toHaveText("In 1.2400 · out 1.2360 · fee 0.0040 BSN");

    // Focus lights a leg exactly as pointing at its edge does.
    await inOne.focus();
    await expect(readout).toHaveText("Input 1 · bsn1q8f4…hd21c · 0.8200 BSN");
    await expect(status).toContainText("Leg bsn1q8f4…hd21c · 0.8200 BSN");

    // Down walks a column; right crosses to the other one at the same row.
    await page.keyboard.press("ArrowDown");
    await expect(inTwo).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(outTwo).toBeFocused();
    await expect(readout).toHaveText("Output 2 · bsn1qr7d…c1nf8 · 0.3060 BSN");
    await page.keyboard.press("ArrowLeft");
    await expect(inTwo).toBeFocused();

    // End is the fee leg, which is marked in words rather than in colour.
    await page.keyboard.press("End");
    await expect(feeLeg).toBeFocused();
    await expect(readout).toHaveText("Network fee · Basin relay · 0.0040 BSN");

    // Pinning survives the focus moving on: the reading is the pin's, not the
    // leg the keyboard has since walked to.
    await page.keyboard.press("Enter");
    await expect(feeLeg).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Home");
    await expect(inOne).toBeFocused();
    await expect(readout).toHaveText("Network fee · Basin relay · 0.0040 BSN");
    await expect(status).toContainText("Leg Basin relay · 0.0040 BSN");

    await page.keyboard.press("Escape");
    await expect(feeLeg).toHaveAttribute("aria-pressed", "false");
    await expect(readout).toHaveText("Input 1 · bsn1q8f4…hd21c · 0.8200 BSN");

    // Splitting a payment re-measures the gutter mid-flight: the paid legs
    // renumber, and the transaction still reconciles to the same three sums.
    await stage.getByRole("button", { name: "Split output" }).click();
    await expect(status).toContainText("Legs 6 · flowing");
    await expect(outputs.getByRole("button")).toHaveCount(4);
    await expect(
      outputs.getByRole("button", {
        name: "Output 2, bsn1qv2t…s6hb9, 0.3500 BSN",
      }),
    ).toBeVisible();
    await expect(
      outputs.getByRole("button", {
        name: "Output 3, bsn1qr7d…c1nf8, 0.3060 BSN",
      }),
    ).toBeVisible();
    await expect(announced).toHaveText(
      "Basinworks payout balanced: in 1.2400 BSN, out 1.2360 BSN, fee 0.0040 BSN.",
    );
    await expect(readout).toHaveText("In 1.2400 · out 1.2360 · fee 0.0040 BSN");

    // The march is the host's to stop, and stopping it changes nothing else.
    await stage.getByRole("button", { name: "Stop flow" }).click();
    await expect(status).toContainText("Legs 6 · held");
    await expect(readout).toHaveText("In 1.2400 · out 1.2360 · fee 0.0040 BSN");
  });

  test("mempool-queue: three bumps carry your row over the cut, and the block takes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/mempool-queue");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The queue speaks your rank, which is derived — so it changes on a climb
    // rather than on every arrival.
    const announced = stage.locator("[role='status']").first();
    const queue = stage.getByRole("list", { name: "Basin pending queue" });
    const bump = stage.getByRole("button", { name: /^Bump your fee to/ });
    const waiting = waitingOf(stage);

    await expect(status).toContainText("Yours #4 of 5 · 1 short · fee 12.0 gu");
    await expect(announced).toHaveText(
      "Your transaction is number 4 of 5, 1 place short of the next block.",
    );
    await expect(queue.getByRole("listitem")).toHaveCount(5);
    await expect(stage.getByText("5 waiting", { exact: true })).toBeVisible();
    await expect(stage.getByText("Next block cut")).toBeVisible();
    // The row's own sentence, not a name on the list item: position, offer and
    // whether it makes the block, all in words.
    await expect(
      stage.getByText(
        "Position 4 of 5, bsn1q8f4…hd21c, 12.0 gu, waiting. Your transaction.",
      ),
    ).toBeVisible();
    await expect(bump).toHaveAccessibleName("Bump your fee to 15.0 gu");

    // Bumping is the only control on the list, and it says what it would pay.
    await bump.press("Enter");
    await expect(status).toContainText("Yours #4 of 5 · 1 short · fee 15.0 gu");
    await expect(bump).toHaveAccessibleName("Bump your fee to 18.0 gu");
    await bump.press(" ");
    await expect(status).toContainText("fee 18.0 gu");
    await expect(announced).toHaveText(
      "Your transaction is number 4 of 5, 1 place short of the next block.",
    );

    // The third bump clears the row above, and the cut line lands under yours.
    await bump.press("Enter");
    await expect(status).toContainText(
      "Yours #3 of 5 · in next block · fee 21.0 gu",
    );
    await expect(announced).toHaveText(
      "Your transaction is number 3 of 5 and makes the next block.",
    );
    await expect(
      stage.getByText(
        "Position 3 of 5, bsn1q8f4…hd21c, 21.0 gu, in the next block. Your transaction.",
      ),
    ).toBeVisible();

    // Mining takes the rows above the cut, and yours goes with them.
    await stage.getByRole("button", { name: "Mine block" }).click();
    await expect(status).toContainText("Yours — · mined · fee — gu");
    await expect(announced).toHaveText("2 waiting.");
    await expect(queue.getByRole("listitem")).toHaveCount(2);
    await expect(stage.getByRole("button", { name: /^Bump/ })).toHaveCount(0);

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Yours #4 of 5 · 1 short · fee 12.0 gu");

    // Arrivals are the host's, and a better-paying one pushes your row back
    // without touching the offer it is making.
    await stage.getByRole("button", { name: "Start arrivals" }).click();
    await expect.poll(waiting, { timeout: 10000 }).toBeGreaterThan(5);
    await stage.getByRole("button", { name: "Pause arrivals" }).click();
    const total = await waiting();
    await expect(announced).toContainText(`of ${total},`);
    await expect(status).toContainText(`of ${total} ·`);
    await expect(status).toContainText("fee 12.0 gu");
  });

  test("explorer-search: a pasted hash classifies, resolves after the wait, and Escape clears it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/explorer-search");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The field announces the settled outcome once per resolution, never once
    // per keystroke, so it stays empty until a lookup answers.
    const announced = stage.locator("[role='status']").first();
    const field = stage.getByRole("searchbox", { name: "Basinworks explorer" });

    await expect(status).toContainText("Explorer unknown typing");
    await expect(announced).toBeEmpty();
    await expect(field).toHaveValue("");
    await expect(
      stage.getByText("Not a hash, an address or a block height."),
    ).toBeVisible();

    // The shape is classified before anything is looked up, and the lookup
    // lands a card a reader can jump to.
    await stage.getByRole("button", { name: "Hash", exact: true }).click();
    await expect(
      stage.getByText("Recognised as a transaction hash."),
    ).toBeVisible();
    await expect(status).toContainText("Explorer hash resolved", {
      timeout: 8000,
    });
    await expect(announced).toHaveText(
      "Transaction resolved. Transfer to Fernworks Supply.",
    );
    const card = stage.getByRole("region", {
      name: "Transfer to Fernworks Supply",
    });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Confirmed");
    await expect(card).toContainText("4,812,907");
    await expect(card).toContainText("1,240.00 BSN");
    await expect(card.getByRole("button", { name: "Open" })).toBeVisible();

    // Enter in the field opens the record it resolved.
    await field.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Explorer hash opened");

    // Escape clears the field and dismisses the card, leaving focus behind.
    await page.keyboard.press("Escape");
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(card).toHaveCount(0);
    await expect(status).toContainText("Explorer unknown typing");
    await expect(announced).toBeEmpty();

    // A block height is the second shape, and this one is not on the chain:
    // recognised, waited out, and answered with nothing.
    await field.fill("4812908");
    await expect(status).toContainText("Explorer block resolving");
    await expect(status).toContainText("Explorer block no match", {
      timeout: 8000,
    });
    await expect(announced).toHaveText("Nothing found for that query.");
    await expect(
      stage.getByRole("region", { name: "No record found" }),
    ).toBeVisible();

    // One digit along is a record, and the card lays out for a block instead.
    await field.fill("4812907");
    await expect(status).toContainText("Explorer block resolved", {
      timeout: 8000,
    });
    const block = stage.getByRole("region", { name: "Block 4,812,907" });
    await expect(block).toBeVisible();
    await expect(block).toContainText("184");
    await expect(block).toContainText("31.08 BSN");
    await expect(announced).toHaveText("Block resolved. Block 4,812,907.");

    // The clear control is the pointer's half of Escape.
    await stage.getByRole("button", { name: "Clear the query" }).click();
    await expect(field).toHaveValue("");
    await expect(block).toHaveCount(0);
    await expect(status).toContainText("Explorer unknown typing");
  });

  test("finality-ring: nine more blocks close the notch and the ring stamps final", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/finality-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The ring announces the settled word once, so it is silent until then.
    const announced = stage.locator("[role='status']").first();
    const ring = stage.getByRole("progressbar");
    const next = stage.getByRole("button", { name: "Next block" });

    await expect(status).toContainText("Finality 3/12 settling");
    await expect(announced).toBeEmpty();
    await expect(ring).toHaveAttribute("aria-valuemin", "0");
    await expect(ring).toHaveAttribute("aria-valuemax", "12");
    await expect(ring).toHaveAttribute("aria-valuenow", "3");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "3 of 12 confirmations, 87.50 percent certain",
    );
    await expect(stage.getByText("3 of 12 blocks")).toBeVisible();
    await expect(stage.getByText("1,240.00 BSN")).toBeVisible();
    await expect(ring.getByText("Settling", { exact: true })).toBeVisible();

    // Each block halves the doubt left in the transfer.
    await next.press("Enter");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "4 of 12 confirmations, 93.75 percent certain",
    );
    await expect(status).toContainText("Finality 4/12 settling");
    await expect(stage.getByText("4 of 12 blocks")).toBeVisible();

    // Finality is the one place the figure is allowed to be exact, and the
    // centre gives up its probability for the drawn check.
    for (let block = 0; block < 8; block += 1) {
      await next.click();
    }
    await expect(ring).toHaveAttribute("aria-valuenow", "12");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "12 of 12 confirmations, final",
    );
    await expect(announced).toHaveText("Final. 12 of 12 confirmations.");
    await expect(status).toContainText("Finality 12/12 final");
    await expect(ring.getByText("Final", { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();

    // Reset takes the ring back to a bare notch, and the word goes quiet.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "0 of 12 confirmations, 0.00 percent certain",
    );
    await expect(status).toContainText("Finality 0/12 settling");
    await expect(announced).toBeEmpty();
    await expect(next).toBeEnabled();
  });

  test("nonce-line: the missing nonce blocks the tail, and filling it closes the line", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/nonce-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const detail = stage.locator("p[aria-live='polite']").first();
    const rail = stage.getByRole("list", { name: "Basin outbox" });
    const gap = rail.getByRole("button", { name: "Nonce 43 missing, fill it" });
    const first = rail.getByRole("button", { name: /^Nonce 41,/ });
    const last = rail.getByRole("button", { name: /^Nonce 46,/ });
    const blocked = rail.getByRole("button", { name: /^Nonce 44,/ });

    await expect(status).toContainText("Nonce 44 blocked");
    await expect(announced).toHaveText("3 transactions waiting on nonce 43");
    await expect(stage.getByText("Gap at 43")).toBeVisible();
    await expect(rail.getByRole("button")).toHaveCount(6);
    await expect(detail).toHaveText(
      "Nonce 44 · 0x0c19bfa2 · 120.00 BSN · waiting on 43",
    );
    // Blocked is spelled out, so it never rests on the dimming alone.
    await expect(blocked).toHaveAccessibleName(
      "Nonce 44, 120.00 BSN to Coldbrook Bank, waiting on nonce 43",
    );
    await expect(first).toHaveAccessibleName(
      "Nonce 41, 300.00 BSN to Fernworks Supply, confirmed",
    );

    // The rail walks on a roving tabindex, and it does not wrap at either end.
    await blocked.focus();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
    await expect(status).toContainText("Nonce 41 confirmed");
    await expect(detail).toHaveText(
      "Nonce 41 · 0x4f2a91c0 · 300.00 BSN · Confirmed",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(first).toBeFocused();
    await page.keyboard.press("End");
    await expect(last).toBeFocused();
    await expect(status).toContainText("Nonce 46 blocked");
    await page.keyboard.press("ArrowRight");
    await expect(last).toBeFocused();

    // The gap keeps the same keyboard contract as every other tile.
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(gap).toBeFocused();
    await expect(status).toContainText("Nonce 43 gap");
    await expect(detail).toHaveText("Nonce 43 · missing");

    // Filling it is the whole interaction: the tail stops waiting on a nonce
    // that has arrived, and the line reads as one run again.
    await page.keyboard.press("Enter");
    await expect(announced).toHaveText("Line in order");
    await expect(stage.getByText("In order", { exact: true })).toBeVisible();
    await expect(status).toContainText("Nonce 43 pending");
    await expect(detail).toHaveText(
      "Nonce 43 · 0x71c40ade · 64.80 BSN · Pending",
    );
    await expect(blocked).toHaveAccessibleName(
      "Nonce 44, 120.00 BSN to Coldbrook Bank, pending",
    );
    await expect(stage.getByRole("button", { name: "Fill 43" })).toBeDisabled();

    // Reset puts the gap back, tail and all.
    await stage.getByRole("button", { name: "Reset run" }).click();
    await expect(announced).toHaveText("3 transactions waiting on nonce 43");
    await expect(stage.getByText("Gap at 43")).toBeVisible();
    await expect(blocked).toHaveAccessibleName(
      "Nonce 44, 120.00 BSN to Coldbrook Bank, waiting on nonce 43",
    );
  });

  test("bridge-hop: four stages carry the token across and the destination balance rolls up", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/bridge-hop");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // Arrival is announced once; every stage before it is silent.
    const announced = stage.locator("[role='status']").first();
    const hop = stage.getByRole("list", { name: "Bridge stages" });
    const track = stage.getByRole("progressbar", {
      name: "Bridge from Basin to Coldbrook",
    });
    const detail = stage.locator("p[aria-live='polite']").first();
    const advance = stage.getByRole("button", { name: "Advance" });
    const locked = hop.getByRole("button", { name: "Locked, done" });
    const minted = hop.getByRole("button", { name: /^Minted,/ });
    const balance = rolledFigureOf(
      stage.locator("span.inline-flex.tabular-nums").first(),
    );
    // The rail never fills, so the token is the only thing that crosses it.
    const tokenLeft = async (): Promise<number> => {
      const box = await stage.locator("span.z-20").first().boundingBox();
      return box ? Math.round(box.x) : -1;
    };

    await expect(status).toContainText("Bridge locked · 1/4");
    await expect(announced).toBeEmpty();
    await expect(track).toHaveAttribute("aria-valuemin", "0");
    await expect(track).toHaveAttribute("aria-valuemax", "4");
    await expect(track).toHaveAttribute("aria-valuenow", "1");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "1 of 4 stages, locked",
    );
    // Every node's state is a word, never a colour.
    await expect(locked).toBeVisible();
    await expect(
      hop.getByRole("button", { name: "Attested, in progress" }),
    ).toBeVisible();
    await expect(
      hop.getByRole("button", { name: "Relayed, waiting" }),
    ).toBeVisible();
    await expect(hop.locator("li[aria-current='step']")).toHaveCount(1);
    await expect(detail).toHaveText(
      "Attested · Signed by 9 of 12 guards · 0xb7e3…05aa",
    );
    await expect.poll(balance, { timeout: 5000 }).toBe("80.00");
    const parked = await tokenLeft();

    // Focus is the keyboard equal of hovering a node, and it does not wrap.
    await hop.getByRole("button", { name: "Attested, in progress" }).focus();
    await page.keyboard.press("Home");
    await expect(locked).toBeFocused();
    await expect(detail).toHaveText("Locked · Held on Basin · 0x4f2a…be17");
    await page.keyboard.press("ArrowLeft");
    await expect(locked).toBeFocused();
    await page.keyboard.press("End");
    await expect(minted).toBeFocused();
    await expect(detail).toHaveText(
      "Minted · Issued to the recipient · 0x93de…5c8b",
    );

    // Each completed stage takes the token one node further along the rail.
    await advance.click();
    await expect(status).toContainText("Bridge attested · 2/4");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "2 of 4 stages, attested",
    );
    await expect(
      hop.getByRole("button", { name: "Attested, done" }),
    ).toBeVisible();
    await expect(announced).toBeEmpty();

    // Arrival is the one place that celebrates, and the balance is the outcome.
    await advance.click();
    await advance.click();
    await expect(status).toContainText("Bridge arrived · 4/4");
    await expect(track).toHaveAttribute("aria-valuenow", "4");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "4 of 4 stages, arrived",
    );
    await expect(announced).toHaveText("Arrived on Coldbrook.");
    await expect(minted).toHaveAccessibleName("Minted, done");
    await expect(hop.locator("li[aria-current='step']")).toHaveCount(0);
    await expect(advance).toBeDisabled();
    await expect.poll(balance, { timeout: 5000 }).toBe("500.00");
    await expect
      .poll(tokenLeft, { timeout: 5000 })
      .toBeGreaterThan(parked + 60);

    // Reset sends the token back to the source pillar and takes the credit
    // with it: the destination is only richer once the hop has landed.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Bridge waiting · 0/4");
    await expect(track).toHaveAttribute(
      "aria-valuetext",
      "0 of 4 stages, waiting",
    );
    await expect(announced).toBeEmpty();
    await expect.poll(balance, { timeout: 5000 }).toBe("80.00");
    await expect.poll(tokenLeft, { timeout: 5000 }).toBeLessThan(parked);
  });

  test("receipt-proof: verifying stamps the root, and another leaf takes the proof back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/receipt-proof");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The outcome is announced once; the walk is read off the polite line.
    const announced = stage.locator("[role='status']").first();
    const detail = stage.locator("p[aria-live='polite']").first();
    const detailName = detail.locator("span").first();
    const detailHash = detail.locator("span").last();
    const leafThree = stage.getByRole("button", { name: /^Leaf 3,/ });
    const leafFour = stage.getByRole("button", { name: /^Leaf 4,/ });
    const leafFive = stage.getByRole("button", { name: /^Leaf 5,/ });
    const root = stage.getByRole("button", { name: /^Block root,/ });
    const verify = stage.getByRole("button", { name: "Verify" });

    await expect(status).toContainText("Proof leaf 3 idle");
    await expect(announced).toBeEmpty();
    // The part each node plays in the proof is stated in words.
    await expect(leafThree).toHaveAccessibleName(
      "Leaf 3, on the proof path, hash 0xbfc0…43f3",
    );
    await expect(leafThree).toHaveAttribute("aria-pressed", "true");
    await expect(
      stage.getByRole("button", { name: /^Leaf 2,/ }),
    ).toHaveAccessibleName("Leaf 2, proof sibling, hash 0x906a…d0a2");
    await expect(
      stage.getByRole("button", { name: /^Leaf 0,/ }),
    ).toHaveAccessibleName("Leaf 0, not in this proof, hash 0xcf3f…f621");
    await expect(detailName).toHaveText("Leaf 3");
    await expect(detailHash).toHaveText("0xbfc02cb8f0b943f3");
    await expect(
      stage.getByText("Proving leaf 3 · on the proof path"),
    ).toBeVisible();
    await expect(stage.getByText("240.00 BSN")).toBeVisible();

    // Verifying climbs the path and then stamps the root.
    await verify.click();
    await expect(root).toHaveAccessibleName(/^Block root, checking,/);
    await expect(status).toContainText("Proof leaf 3 checking");
    await expect(status).toContainText("Proof leaf 3 verified", {
      timeout: 8000,
    });
    await expect(root).toHaveAccessibleName(
      "Block root, verified, hash 0xf69b…ab6d",
    );
    await expect(announced).toHaveText(
      "Proof verified against the block root.",
    );
    await expect(verify).toBeDisabled();

    // Walking the field is the keyboard equal of hovering it: left and right
    // stay on a level, up changes level, and the read-out follows.
    await leafThree.focus();
    await page.keyboard.press("ArrowRight");
    await expect(leafFour).toBeFocused();
    await expect(detailName).toHaveText("Leaf 4");
    await expect(detailHash).toHaveText("0x6575cc4d437c4453");
    await page.keyboard.press("ArrowUp");
    await expect(
      stage.getByRole("button", { name: /^Level 1 node 2,/ }),
    ).toBeFocused();
    await expect(detailName).toHaveText("Level 1 node 2");
    await expect(detailHash).toHaveText("0x022d0dd0d17cdf7b");
    await page.keyboard.press("End");
    await expect(
      stage.getByRole("button", { name: /^Level 1 node 3,/ }),
    ).toBeFocused();

    // A proof of one leaf is not a proof of another: choosing drops it back to
    // idle, and the path and its siblings are redrawn around the new leaf.
    await leafFive.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Proof leaf 5 idle");
    await expect(leafFive).toHaveAttribute("aria-pressed", "true");
    await expect(leafThree).toHaveAttribute("aria-pressed", "false");
    await expect(announced).toBeEmpty();
    await expect(root).toHaveAccessibleName(/^Block root, on the proof path,/);
    await expect(leafFour).toHaveAccessibleName(
      "Leaf 4, proof sibling, hash 0x6575…4453",
    );
    await expect(leafThree).toHaveAccessibleName(
      "Leaf 3, not in this proof, hash 0xbfc0…43f3",
    );
    await expect(
      stage.getByText("Proving leaf 5 · on the proof path"),
    ).toBeVisible();
    await expect(verify).toBeEnabled();
  });
});

/** A laid-out box's width in CSS pixels — read for a bubble that grew. */
const budgetWidthOf = async (target: Locator): Promise<number> =>
  (await target.boundingBox())?.width ?? 0;

/** A laid-out box's height — read for a panel that is measured, not reserved. */
const budgetHeightOf = async (target: Locator): Promise<number> =>
  (await target.boundingBox())?.height ?? 0;

/**
 * The budgeting family measures money against a line drawn before it was
 * spent: an allocation, a cap, a limit, a daily budget, a floor. Its outcomes
 * are which side of that line a figure lands on, so every test carries a figure
 * across one — by key where the component publishes a keyboard path, by pointer
 * where the gesture is the point — and reads the verdict off the demo's status
 * line and the ARIA the component publishes about itself.
 */
test.describe("budgeting", () => {
  test("envelope-row: a key lifts the coin, arrows carry it, and the drop moves the money", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/envelope-row");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const row = stage.getByRole("list", { name: "Fieldline · October" });
    const groceries = row.getByRole("button", { name: /^Groceries,/ });
    const repairs = row.getByRole("button", { name: /^Repairs,/ });
    const gifts = row.getByRole("button", { name: /^Gifts,/ });

    await expect(status).toContainText("$880 allocated · $266 left");
    await expect(announced).toHaveText("$880 allocated, $266 left.");
    await expect(groceries).toHaveAccessibleName(
      "Groceries, $420 allocated, $268 spent, $152 left",
    );
    // Overspend is a word in the card's own name, never a tint alone.
    await expect(repairs).toHaveAccessibleName(
      "Repairs, $180 allocated, $214 spent, $34 over",
    );
    await expect(groceries).toHaveAttribute("aria-pressed", "false");
    await expect(
      stage.getByText("Drag a coin, or press an envelope, to lift $25."),
    ).toBeVisible();

    // Enter lifts the coin: the held card is pressed, and the hint changes.
    await groceries.focus();
    await page.keyboard.press("Enter");
    await expect(groceries).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText("Holding $25 from Groceries.");
    await expect(
      stage.getByText(
        "Holding $25 — drop it on another envelope, or press Escape.",
      ),
    ).toBeVisible();

    // Arrows walk the row, and a second Enter drops the coin where focus is.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(repairs).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("moved $25 · Groceries → Repairs");
    await expect(announced).toHaveText(
      "Moved $25 from Groceries to Repairs. Repairs now $205 allocated.",
    );
    await expect(groceries).toHaveAccessibleName(
      "Groceries, $395 allocated, $268 spent, $127 left",
    );
    await expect(repairs).toHaveAccessibleName(
      "Repairs, $205 allocated, $214 spent, $9 over",
    );
    // The coin flies the rest of the way, and only then is it put down.
    await expect(groceries).toHaveAttribute("aria-pressed", "false", {
      timeout: 5000,
    });

    // Escape puts a lifted coin back, and nothing moves.
    await page.keyboard.press("End");
    await expect(gifts).toBeFocused();
    await page.keyboard.press(" ");
    await expect(gifts).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(announced).toHaveText("Move cancelled.");
    await expect(gifts).toHaveAttribute("aria-pressed", "false", {
      timeout: 5000,
    });
    await expect(status).toContainText("moved $25 · Groceries → Repairs");

    // A second move, from Gifts, takes Repairs back under its line.
    await page.keyboard.press("Enter");
    await expect(gifts).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(repairs).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("moved $25 · Gifts → Repairs");
    await expect(repairs).toHaveAccessibleName(
      "Repairs, $230 allocated, $214 spent, $16 left",
    );
    await expect(gifts).toHaveAccessibleName(
      "Gifts, $95 allocated, $38 spent, $57 left",
    );

    await stage.getByRole("button", { name: "Reset month" }).click();
    await expect(status).toContainText("$880 allocated · $266 left");
    await expect(repairs).toHaveAccessibleName(
      "Repairs, $180 allocated, $214 spent, $34 over",
    );
  });

  test("spend-ring: charges carry the fill past the pace mark and over the budget, and the stops swap the centre", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/spend-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", { name: "Coldbrook · October" });
    const stops = stage.getByRole("radiogroup", { name: "Centre figure" });
    const spentStop = stops.getByRole("radio", { name: "Spent" });
    const leftStop = stops.getByRole("radio", { name: "Left" });
    const charge = stage.getByRole("button", { name: "Add charge" });
    const nextDay = stage.getByRole("button", { name: "Next day" });

    await expect(status).toContainText("Day 18/30 · $820 of $1,400 · on pace");
    await expect(meter).toHaveAttribute("aria-valuemax", "1400");
    await expect(meter).toHaveAttribute("aria-valuenow", "820");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$820 of $1,400 spent, 59 percent, day 18 of 30, on pace",
    );
    await expect(stage.getByText("On pace", { exact: true })).toBeVisible();
    await expect(meter.getByText("$820", { exact: true })).toBeVisible();
    await expect(spentStop).toHaveAttribute("aria-checked", "true");

    // One charge carries the fill past the day's mark.
    await charge.click();
    await expect(status).toContainText(
      "Day 18/30 · $948 of $1,400 · ahead of pace",
    );
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$948 of $1,400 spent, 68 percent, day 18 of 30, ahead of pace",
    );
    await expect(
      stage.getByText("Ahead of pace", { exact: true }),
    ).toBeVisible();
    // The centre counts to the new figure rather than jumping to it.
    await expect(meter.getByText("$948", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // The month catching up is the other way back on pace: the mark walks.
    await nextDay.click();
    await nextDay.click();
    await expect(status).toContainText(
      "Day 20/30 · $948 of $1,400 · ahead of pace",
    );
    await nextDay.click();
    await expect(status).toContainText("Day 21/30 · $948 of $1,400 · on pace");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$948 of $1,400 spent, 68 percent, day 21 of 30, on pace",
    );

    // Four more take it over: the meter stops at its maximum and says why.
    for (let press = 0; press < 4; press += 1) await charge.click();
    await expect(status).toContainText(
      "Day 21/30 · $1,460 of $1,400 · over by $60",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "1400");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$1,460 of $1,400 spent, day 21 of 30, $60 over budget",
    );
    await expect(stage.getByText("Over budget", { exact: true })).toBeVisible();

    // The stops are a radio group: an arrow both moves and selects, and the
    // centre re-counts to what is left — a negative figure, in the open.
    await spentStop.focus();
    await page.keyboard.press("ArrowRight");
    await expect(leftStop).toBeFocused();
    await expect(leftStop).toHaveAttribute("aria-checked", "true");
    await expect(spentStop).toHaveAttribute("aria-checked", "false");
    await expect(meter.getByText("remaining", { exact: true })).toBeVisible();
    await expect(meter.getByText("-$60", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press("Home");
    await expect(spentStop).toBeFocused();
    await expect(spentStop).toHaveAttribute("aria-checked", "true");
    await expect(meter.getByText("of $1,400", { exact: true })).toBeVisible();
    await expect(meter.getByText("$1,460", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    await stage.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(status).toContainText("Day 18/30 · $820 of $1,400 · on pace");
  });

  test("category-bars: a header opens its merchants, the next closes it, and a recalculation re-ranks the board", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/category-bars");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const board = stage.getByRole("list", { name: "Fernworks · October" });
    const headers = board.getByRole("button");
    const groceries = board.getByRole("button", { name: /^Groceries,/ });
    const home = board.getByRole("button", { name: /^Home,/ });
    const gifts = board.getByRole("button", { name: /^Gifts,/ });
    // Panels are reached through the header's own aria-controls, the way a
    // screen reader would, rather than by a class or an index.
    const panelOf = async (header: Locator): Promise<Locator> =>
      stage.locator(`[id="${await header.getAttribute("aria-controls")}"]`);

    await expect(status).toContainText("5 categories · $1,717 total");
    await expect(announced).toHaveText("5 categories, $1,717 total.");
    // Heaviest first, and every header says its share in words.
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toHaveAccessibleName(
      "Groceries, $686, 40 percent of total, 3 merchants",
    );
    await expect(headers.nth(1)).toHaveAccessibleName(
      "Home, $469, 27 percent of total, 2 merchants",
    );
    await expect(headers.nth(4)).toHaveAccessibleName(
      "Gifts, $124, 7 percent of total, 2 merchants",
    );
    const groceriesPanel = await panelOf(groceries);
    await expect(groceries).toHaveAttribute("aria-expanded", "false");
    await expect(groceriesPanel).toHaveAttribute("aria-hidden", "true");

    // A press unpacks the merchants; the panel is measured, not reserved.
    await groceries.click();
    await expect(groceries).toHaveAttribute("aria-expanded", "true");
    await expect(groceriesPanel).toHaveAttribute("aria-hidden", "false");
    await expect(status).toContainText("Groceries open · $686 · 40% of total");
    await expect(announced).toHaveText(
      "Groceries open, $686, 40 percent of $1,717.",
    );
    await expect(groceriesPanel).toContainText("Basin Market");
    await expect(groceriesPanel).toContainText("$267");
    await expect
      .poll(() => budgetHeightOf(groceriesPanel), { timeout: 5000 })
      .toBeGreaterThan(40);

    // ArrowDown walks the headers; Enter opens the next and closes the first.
    await page.keyboard.press("ArrowDown");
    await expect(home).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(home).toHaveAttribute("aria-expanded", "true");
    await expect(groceries).toHaveAttribute("aria-expanded", "false");
    await expect(groceriesPanel).toHaveAttribute("aria-hidden", "true");
    await expect(status).toContainText("Home open · $469 · 27% of total");
    const homePanel = await panelOf(home);
    await expect(homePanel).toContainText("Gauge Hardware");
    await expect(homePanel).toContainText("$367");
    await expect
      .poll(() => budgetHeightOf(groceriesPanel), { timeout: 5000 })
      .toBeLessThan(1);

    await page.keyboard.press("End");
    await expect(gifts).toBeFocused();
    await page.keyboard.press("Home");
    await expect(groceries).toBeFocused();

    // A new month re-sorts the rows and rolls the total; the open row keeps
    // its place in the reading, with its new share.
    await stage.getByRole("button", { name: "Recalculate" }).click();
    await expect(status).toContainText("Home open · $556 · 33% of total");
    await expect(headers.nth(0)).toHaveAccessibleName(
      "Home, $556, 33 percent of total, 2 merchants",
    );
    await expect(headers.nth(1)).toHaveAccessibleName(
      "Groceries, $516, 30 percent of total, 3 merchants",
    );
    await expect(home).toHaveAttribute("aria-expanded", "true");
    await expect(await panelOf(home)).toContainText("$375");

    await home.click();
    await expect(home).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("5 categories · $1,701 total");
    await expect(announced).toHaveText("5 categories, $1,701 total.");
  });

  test("forecast-line: a bill switched off lifts the closing figure out of the red, and switched back on runs the month short again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/forecast-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const plot = stage.getByRole("img");
    const rent = stage.getByRole("switch", { name: "Rent, $780 on day 28" });
    const utilities = stage.getByRole("switch", {
      name: "Coldbrook Utilities, $132 on day 24",
    });
    const studio = stage.getByRole("switch", {
      name: "Fernworks Studio, $39 on day 22",
    });

    await expect(status).toContainText(
      "3 of 3 bills on · closing -$105 · short on day 29",
    );
    await expect(rent).toHaveAttribute("aria-checked", "true");
    await expect(plot).toHaveAccessibleName(
      "Balance from day 1 to day 30. Actual through day 18, $1,662. Projected to run short on day 29, closing at -$105.",
    );
    await expect(announced).toHaveText(
      /Projected to run short on day 29, closing at -\$105\.$/,
    );
    await expect(stage.getByText("-$105", { exact: true })).toBeVisible();

    // Space throws the switch, and the plan is re-priced from that same event.
    await rent.focus();
    await page.keyboard.press(" ");
    await expect(rent).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("2 of 3 bills on · closing $675");
    await expect(status).not.toContainText("short");
    await expect(plot).toHaveAccessibleName(
      "Balance from day 1 to day 30. Actual through day 18, $1,662. Projected to close at $675 on day 30.",
    );
    // The closing figure counts to the new value rather than jumping to it.
    await expect(stage.getByText("$675", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    await utilities.click();
    await expect(utilities).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("1 of 3 bills on · closing $807");

    // Rent back on without the utilities lands the month just above zero.
    await rent.click();
    await expect(rent).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("2 of 3 bills on · closing $27");
    await expect(status).not.toContainText("short");
    await expect(stage.getByText("$27", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // And the utilities on top of it cross zero on day 29 again.
    await utilities.focus();
    await page.keyboard.press("Enter");
    await expect(utilities).toHaveAttribute("aria-checked", "true");
    await expect(studio).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "3 of 3 bills on · closing -$105 · short on day 29",
    );
    await expect(plot).toHaveAccessibleName(
      /Projected to run short on day 29, closing at -\$105\.$/,
    );
  });

  test("spend-alert: the pill arrives at the threshold, changes its word at the limit, and a dismissal leaves a dot that brings it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/spend-alert");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const charge = stage.getByRole("button", { name: "Add charge" });
    const dismiss = stage.getByRole("button", {
      name: "Dismiss the Groceries alert",
    });
    const dot = stage.getByRole("button", { name: "Show the Groceries alert" });
    const meter = stage.getByRole("meter", {
      name: "Groceries against its limit",
    });

    await expect(status).toContainText("Groceries $342 of $450 · clear");
    await expect(dismiss).toHaveCount(0);
    await expect(dot).toHaveCount(0);

    // The first charge stays under the threshold; the second crosses it.
    await charge.click();
    await expect(status).toContainText("Groceries $380 of $450 · clear");
    await expect(dismiss).toHaveCount(0);
    await charge.click();
    await expect(status).toContainText(
      "Groceries $418 of $450 · nearing limit · $32 left",
    );
    await expect(
      stage.getByText("Groceries is nearing its limit"),
    ).toBeVisible();
    await expect(stage.getByText("$32 left of $450")).toBeVisible();
    await expect(meter).toHaveAttribute("aria-valuemax", "450");
    await expect(meter).toHaveAttribute("aria-valuenow", "418");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$418 of $450, $32 left",
    );

    // Escape from inside the pill dismisses it and hands focus to the dot.
    await dismiss.focus();
    await page.keyboard.press("Escape");
    await expect(dismiss).toHaveCount(0);
    await expect(status).toContainText("Groceries $418 of $450 · dismissed");
    await expect(dot).toBeVisible();
    await expect(dot).toBeFocused();
    await expect(dot).toHaveAttribute("aria-expanded", "false");

    // Crossing the limit is news the dismissal has not heard: the pill comes
    // back with a different word, and the meter stops at its maximum.
    await charge.click();
    await expect(status).toContainText("Groceries $456 of $450 · over by $6");
    await expect(stage.getByText("Groceries is over its limit")).toBeVisible();
    await expect(stage.getByText("$6 over $450")).toBeVisible();
    await expect(meter).toHaveAttribute("aria-valuenow", "450");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$456 of $450, $6 over",
    );
    await expect(dot).toHaveCount(0);

    // The dot is a real button: Enter restores the pill and focuses its close.
    await dismiss.click();
    await expect(status).toContainText("Groceries $456 of $450 · dismissed");
    await expect(dot).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dismiss).toBeVisible();
    await expect(dismiss).toBeFocused();
    await expect(status).toContainText("Groceries $456 of $450 · over by $6");
    await expect(dot).toHaveCount(0);

    await stage.getByRole("button", { name: "Reset month" }).click();
    await expect(status).toContainText("Groceries $342 of $450 · clear");
    await expect(dismiss).toHaveCount(0);
    await expect(dot).toHaveCount(0);
  });

  test("merchant-cluster: a bubble opens to its transactions, arrows walk the pack, and Escape packs it again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/merchant-cluster");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const cluster = stage.getByRole("group", {
      name: "Waylight Pay · card spend, November",
    });
    const bubbles = cluster.getByRole("button");
    const ferngate = cluster.getByRole("button", { name: /^Ferngate Market,/ });
    const marrow = cluster.getByRole("button", { name: /^Marrow & Vine,/ });
    const halyard = cluster.getByRole("button", { name: /^Halyard Coffee,/ });

    await expect(status).toContainText(
      "Nov spend $962.35 · 6 merchants · reading —",
    );
    // The pack is sized by its stage, so every expectation is in its terms.
    await expect(bubbles).toHaveCount(6);
    const stageWidth = await budgetWidthOf(cluster);
    await expect(ferngate).toHaveAccessibleName(
      "Ferngate Market, $362.40, 38 percent of spend, 4 transactions",
    );
    await expect(halyard).toHaveAccessibleName(
      "Halyard Coffee, $34.00, 4 percent of spend, 4 transactions",
    );
    await expect(ferngate).toHaveAttribute("aria-expanded", "false");
    const panel = stage.locator(
      `[id="${await ferngate.getAttribute("aria-controls")}"]`,
    );
    await expect(panel).toHaveAttribute("aria-hidden", "true");

    // Enter opens the largest bite: it glides to the centre at a larger radius
    // and the panel unpacks its transactions.
    await ferngate.focus();
    await page.keyboard.press("Enter");
    await expect(ferngate).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(status).toContainText("reading Ferngate Market 38%");
    await expect(panel).toContainText("4 transactions");
    await expect(panel).toContainText("25 Nov");
    await expect(panel).toContainText("$109.65");
    await expect(panel.getByRole("listitem")).toHaveCount(4);
    await expect
      .poll(() => budgetHeightOf(panel), { timeout: 5000 })
      .toBeGreaterThan(60);
    await expect
      .poll(() => budgetWidthOf(ferngate), { timeout: 5000 })
      .toBeGreaterThan(stageWidth * 0.43);

    // Arrows step the pack in spend order, and Space swaps the open bubble.
    await page.keyboard.press("ArrowRight");
    await expect(marrow).toBeFocused();
    await page.keyboard.press(" ");
    await expect(marrow).toHaveAttribute("aria-expanded", "true");
    await expect(ferngate).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("reading Marrow & Vine 22%");
    await expect(panel).toContainText("3 transactions");
    await expect(panel).toContainText("Table of six");
    await expect(panel.getByRole("listitem")).toHaveCount(3);

    // Escape packs the cluster and keeps focus where it was.
    await page.keyboard.press("Escape");
    await expect(marrow).toHaveAttribute("aria-expanded", "false");
    await expect(marrow).toBeFocused();
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await expect(status).toContainText("reading —");
    await expect
      .poll(() => budgetWidthOf(ferngate), { timeout: 5000 })
      .toBeLessThan(stageWidth * 0.38);

    // Home and End reach the largest and the smallest bite.
    await page.keyboard.press("End");
    await expect(halyard).toBeFocused();
    await page.keyboard.press("Home");
    await expect(ferngate).toBeFocused();

    // The pointer opens the smallest bubble the same way, and closes it again.
    await halyard.click();
    await expect(halyard).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("reading Halyard Coffee 4%");
    await expect(panel).toContainText("Cortado");
    await halyard.click();
    await expect(halyard).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("reading —");
  });

  test("week-strip: a key picks a day, Page keys and a swipe change the week, and the chevrons stop at the ends", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/week-strip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component's own live heading comes before the demo's line.
    const heading = stage.locator("[role='status']").first();
    const strip = stage.getByRole("group");
    const bars = strip.getByRole("button");
    const wed = strip.getByRole("button", { name: /^Wed,/ });
    const thu = strip.getByRole("button", { name: /^Thu,/ });
    const sun = strip.getByRole("button", { name: /^Sun,/ });
    const previous = stage.getByRole("button", { name: "Previous week" });
    const next = stage.getByRole("button", { name: "Next week" });

    await expect(status).toContainText(
      "Week of Oct 20 · $412.90 · 3 days over · reading —",
    );
    await expect(strip).toHaveAccessibleName("Week of Oct 20");
    await expect(heading).toContainText("$412.90 · 3 over budget");
    await expect(bars).toHaveCount(7);
    // Over budget and today are words in the bar's name, never a tone alone.
    await expect(wed).toHaveAccessibleName(
      "Wed, $84.10, over the $60.00 daily budget",
    );
    await expect(sun).toHaveAccessibleName("Sun, $42.15, today");
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
    await expect(
      stage.getByText("Week $412.90 · budget $60.00 a day"),
    ).toBeVisible();

    // Arrows walk the bars, Enter picks one, and the readout says its share.
    await bars.first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(wed).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(wed).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("reading Wed $84.10");
    await expect(
      stage.getByText("Wed · $84.10 · 20% of the week"),
    ).toBeVisible();

    // One day at a time: End reaches today, Space picks it and drops Wednesday.
    await page.keyboard.press("End");
    await expect(sun).toBeFocused();
    await page.keyboard.press(" ");
    await expect(sun).toHaveAttribute("aria-pressed", "true");
    await expect(wed).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("reading Sun $42.15");

    // PageUp turns the week back: the same seven bars carry the new heights,
    // and the reading is cleared because the day it named is gone.
    await page.keyboard.press("PageUp");
    await expect(status).toContainText(
      "Week of Oct 13 · $323.10 · 2 days over · reading —",
    );
    await expect(strip).toHaveAccessibleName("Week of Oct 13");
    await expect(heading).toContainText("$323.10 · 2 over budget");
    await expect(sun).toHaveAttribute("aria-pressed", "false");
    await expect(sun).toHaveAccessibleName("Sun, $18.90");
    await expect(thu).toHaveAccessibleName(
      "Thu, $88.90, over the $60.00 daily budget",
    );
    await expect(next).toBeEnabled();

    // The chevron steps once more, to the oldest week, where it stops.
    await previous.click();
    await expect(status).toContainText(
      "Week of Oct 6 · $408.95 · 3 days over · reading —",
    );
    await expect(previous).toBeDisabled();

    // A swipe to the left is the pointer's way forward: captured after 4px
    // of travel, committed past the threshold on release, and no bar is
    // picked by the press it began with.
    const box = await strip.boundingBox();
    if (!box) throw new Error("the strip has no box to swipe");
    const midY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.85, midY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, midY, { steps: 6 });
    await page.mouse.move(box.x + box.width * 0.15, midY, { steps: 6 });
    await page.mouse.up();
    await expect(status).toContainText(
      "Week of Oct 13 · $323.10 · 2 days over · reading —",
    );
    await expect(previous).toBeEnabled();

    // PageDown from a bar comes home to the current week, where Next is shut.
    await sun.focus();
    await page.keyboard.press("PageDown");
    await expect(status).toContainText(
      "Week of Oct 20 · $412.90 · 3 days over · reading —",
    );
    await expect(sun).toHaveAccessibleName("Sun, $42.15, today");
    await expect(next).toBeDisabled();
  });

  test("goal-thermometer: expenses raise the mercury past the warning line and over the cap, and the meter says so", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/goal-thermometer");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", { name: "Groceries · November" });
    // Threshold crossings are announced once each through this polite region.
    const crossing = stage.locator("p[aria-live='polite']");
    const entries = stage.getByRole("list").getByRole("listitem");
    const add = stage.getByRole("button", { name: "Add expense" });
    const reset = stage.getByRole("button", { name: "Reset", exact: true });

    await expect(status).toContainText(
      "Groceries · $378.55 of $600.00 · 63% · 5 expenses · under cap",
    );
    await expect(meter).toHaveAttribute("aria-valuemax", "600");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$378.55 of $600.00 spent. $221.45 left.",
    );
    await expect(
      stage.getByText("$221.45 left", { exact: true }),
    ).toBeVisible();
    await expect(entries).toHaveCount(5);
    await expect(crossing).toBeEmpty();
    await expect(reset).toBeDisabled();

    // Two expenses reach the warning line: the tube warns once, in words.
    await add.click();
    await expect(status).toContainText(
      "$436.55 of $600.00 · 73% · 6 expenses · under cap",
    );
    await expect(crossing).toBeEmpty();
    await add.click();
    await expect(status).toContainText(
      "$510.70 of $600.00 · 85% · 7 expenses · near cap",
    );
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$510.70 of $600.00 spent. Near the cap · $89.30 left.",
    );
    await expect(crossing).toHaveText("Near the cap · $89.30 left");
    // The newest expense is the chip on the rail, and a row in the hidden list.
    await expect(
      stage.getByText("Basin Grocers", { exact: true }),
    ).toBeVisible();
    await expect(entries).toHaveCount(7);
    await expect(entries.last()).toHaveText("Basin Grocers, $74.15");

    // Two more go over: the meter stops at its maximum while the sentence
    // names the overage, and the script runs out.
    await add.click();
    await expect(status).toContainText(
      "$572.00 of $600.00 · 95% · 8 expenses · near cap",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "572");
    await add.click();
    await expect(status).toContainText(
      "Groceries · $640.40 of $600.00 · 107% · 9 expenses · over cap",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "600");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$640.40 of $600.00 spent. Over the cap by $40.40.",
    );
    await expect(crossing).toHaveText("Over the cap by $40.40");
    await expect(entries).toHaveCount(9);
    await expect(add).toBeDisabled();
    // The hidden copy of the total is exact at once; the drawn one counts to
    // it, so the figure is in the stage twice only once the count has landed.
    await expect(stage.getByText("$640.40", { exact: true })).toHaveCount(2, {
      timeout: 5000,
    });

    // Reset empties the envelope back to its opening five, and the crossing
    // region goes quiet rather than announcing a return.
    await reset.click();
    await expect(status).toContainText(
      "Groceries · $378.55 of $600.00 · 63% · 5 expenses · under cap",
    );
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$378.55 of $600.00 spent. $221.45 left.",
    );
    await expect(entries).toHaveCount(5);
    await expect(crossing).toBeEmpty();
    await expect(reset).toBeDisabled();
    await expect(add).toBeEnabled();
  });

  test("bill-calendar: Enter lifts a bill, arrows choose its day, the drop re-plots the trough, and a drag does the same", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/bill-calendar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const grid = stage.getByRole("grid", {
      name: "Coldbrook Bank · November bills",
    });
    // The keyboard drag is narrated through this polite region.
    const note = stage.locator("p[aria-live='polite']");
    const reset = stage.getByRole("button", { name: "Reset days" });
    const day = (n: number): Locator =>
      grid.getByRole("button", { name: new RegExp(`^November ${n},`) });

    await expect(status).toContainText(
      "November · 5 bills $1,638.00 · low $542.00 on the 26 · no moves yet",
    );
    await expect(day(26)).toHaveAccessibleName(
      "November 26, Coldbrook Card $320.00 due, balance $542.00",
    );
    await expect(day(18)).toHaveAccessibleName(
      "November 18, no bills, balance $900.00",
    );
    // One cell in the tab order: the first bill's day, until something is read.
    await expect(day(3)).toHaveAttribute("tabindex", "0");
    await expect(
      stage.getByText("Low $542.00 on the 26", { exact: true }),
    ).toBeVisible();
    await expect(reset).toBeDisabled();

    // Enter lifts the bill on the focused day; arrows then choose its new day
    // while focus stays put, and Enter drops it there.
    await day(26).click();
    await expect(day(26)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(note).toHaveText(
      "Coldbrook Card, $320.00, lifted from November 26. Arrow keys choose a day, Enter drops it, Escape cancels.",
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await expect(day(26)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText(
      "low $542.00 on the 21 · moved Coldbrook Card 26 → 18",
    );
    await expect(note).toHaveText(
      "Coldbrook Card moved to November 18. Lowest balance $542.00.",
    );
    await expect(day(18)).toHaveAccessibleName(
      "November 18, Coldbrook Card $320.00 due, balance $580.00",
    );
    await expect(day(26)).toHaveAccessibleName(
      "November 26, no bills, balance $542.00",
    );
    await expect(day(18)).toBeFocused();
    await expect(
      stage.getByText("Low $542.00 on the 21", { exact: true }),
    ).toBeVisible();
    await expect(reset).toBeEnabled();

    // Escape puts a lifted bill back where it was.
    await page.keyboard.press("Enter");
    await expect(note).toHaveText(/lifted from November 18\./);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(note).toHaveText(
      "Move cancelled. Coldbrook Card stays on 18.",
    );
    await expect(day(18)).toHaveAccessibleName(
      "November 18, Coldbrook Card $320.00 due, balance $580.00",
    );
    await expect(status).toContainText("moved Coldbrook Card 26 → 18");
    await expect(day(18)).toBeFocused();

    // The pointer makes the same move: past 4px the chip is carried, and the
    // day under the release takes the bill.
    const from = await day(18).boundingBox();
    const to = await day(28).boundingBox();
    if (!from || !to) throw new Error("the calendar has no cells to drag");
    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height / 2;
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + 12, fromY + 6, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(status).toContainText(
      "low $542.00 on the 28 · moved Coldbrook Card 18 → 28",
    );
    await expect(note).toHaveText(
      "Coldbrook Card moved to November 28. Lowest balance $542.00.",
    );
    await expect(day(28)).toHaveAccessibleName(
      "November 28, Coldbrook Card $320.00 due, balance $542.00",
    );
    await expect(day(18)).toHaveAccessibleName(
      "November 18, no bills, balance $900.00",
    );
    await expect(
      stage.getByText("Low $542.00 on the 28", { exact: true }),
    ).toBeVisible();

    await reset.click();
    await expect(status).toContainText(
      "November · 5 bills $1,638.00 · low $542.00 on the 26 · no moves yet",
    );
    await expect(day(26)).toHaveAccessibleName(
      "November 26, Coldbrook Card $320.00 due, balance $542.00",
    );
    await expect(reset).toBeDisabled();
  });

  test("cashflow-river: focus reads a ribbon, Enter pins the reading past the focus leaving, and a new month re-forms the river", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/cashflow-river");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The figure being read is announced once per stream through this region.
    const header = stage.locator("[aria-live='polite']");
    const diagram = stage.getByRole("img");
    const chips = stage.getByRole("list", {
      name: "Fieldline Ops · monthly cashflow streams",
    });
    const retainers = chips.getByRole("button", { name: /^Retainers,/ });
    const payroll = chips.getByRole("button", { name: /^Payroll,/ });
    const rent = chips.getByRole("button", { name: /^Rent,/ });
    const kept = chips.getByRole("button", { name: /^Kept,/ });

    await expect(status).toContainText(
      "November · in $18,400 · out $15,260 · kept $3,140 · reading —",
    );
    await expect(header).toHaveText("$18,400 in · $15,260 out · $3,140 kept");
    // Surplus is a word in the header, never a tone alone.
    await expect(stage.getByText("surplus", { exact: true })).toBeVisible();
    await expect(diagram).toHaveAccessibleName(
      "Fieldline Ops · monthly cashflow. 3 income streams totalling $18,400 merge into a balance and split into 4 outgoings totalling $15,260, leaving $3,140 kept.",
    );
    // Seven streams and the balancing band, each a chip that says its share.
    await expect(chips.getByRole("button")).toHaveCount(8);
    await expect(payroll).toHaveAccessibleName(
      "Payroll, out, $9,200, 60 percent of spend",
    );
    await expect(kept).toHaveAccessibleName(
      "Kept, out, $3,140, 21 percent of spend",
    );

    // Focus lights a ribbon and reads it — the hover's keyboard equal.
    await retainers.focus();
    await expect(status).toContainText("reading Retainers $11,200");
    await expect(header).toHaveText("Retainers · $11,200 · 61% of income");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(payroll).toBeFocused();
    await expect(status).toContainText("reading Payroll $9,200");
    await expect(header).toHaveText("Payroll · $9,200 · 60% of spend");

    // Enter pins it: the reading survives focus moving on to the next chip.
    await page.keyboard.press("Enter");
    await expect(payroll).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowRight");
    await expect(rent).toBeFocused();
    await expect(header).toHaveText("Payroll · $9,200 · 60% of spend");
    await expect(status).toContainText("reading Payroll $9,200");

    // Escape releases the pin, and the chip that holds focus is lit again.
    await page.keyboard.press("Escape");
    await expect(payroll).toHaveAttribute("aria-pressed", "false");
    await expect(header).toHaveText("Rent · $2,200 · 14% of spend");

    // End and Home reach the balancing band and the first stream.
    await page.keyboard.press("End");
    await expect(kept).toBeFocused();
    await expect(header).toHaveText("Kept · $3,140 · 21% of spend");
    await page.keyboard.press("Home");
    await expect(retainers).toBeFocused();
    await expect(header).toHaveText("Retainers · $11,200 · 61% of income");

    // A new month re-forms the river, and the chips carry the new shares.
    await stage.getByRole("button", { name: "October" }).click();
    await expect(status).toContainText(
      "October · in $17,490 · out $14,880 · kept $2,610 · reading —",
    );
    await expect(header).toHaveText("$17,490 in · $14,880 out · $2,610 kept");
    await expect(payroll).toHaveAccessibleName(
      "Payroll, out, $8,900, 60 percent of spend",
    );
    await expect(kept).toHaveAccessibleName(
      "Kept, out, $2,610, 18 percent of spend",
    );
    await expect(diagram).toHaveAccessibleName(/leaving \$2,610 kept\.$/);

    // The pointer reads the same way, and leaving takes the reading with it.
    await payroll.hover();
    await expect(status).toContainText("reading Payroll $8,900");
    await expect(header).toHaveText("Payroll · $8,900 · 60% of spend");
    await page.mouse.move(2, 2);
    await expect(status).toContainText("reading —");
    await expect(header).toHaveText("$17,490 in · $14,880 out · $2,610 kept");
  });
});

/** A laid-out box's width in CSS pixels — read for a pill that closed. */
const billingWidthOf = async (target: Locator): Promise<number> =>
  (await target.boundingBox())?.width ?? 0;

/** A laid-out box's height — read for a drawer that is measured, not reserved. */
const billingHeightOf = async (target: Locator): Promise<number> =>
  (await target.boundingBox())?.height ?? 0;

/**
 * How far along its track a stacked bar's last segment ends, as a fraction of
 * the track. Measured rather than read off a style, because the bar's end
 * settling back to the marker is the outcome the viewer is looking at.
 */
const barEndOf = (segment: Locator) => async (): Promise<number> =>
  segment.evaluate((element) => {
    const track = element.parentElement;
    if (!track) return -1;
    const box = track.getBoundingClientRect();
    if (box.width === 0) return -1;
    const end = element.getBoundingClientRect().right - box.left;
    return Math.round((end / box.width) * 100) / 100;
  });

/**
 * Where a draining ring stands. Motion drives its dash offset from one value,
 * so the number holds exactly while the rail is paused and moves every frame
 * while it runs — read as computed style, which is the same whether motion
 * wrote it as an attribute or inline.
 */
const ringOffsetOf = (ring: Locator) => async (): Promise<number> =>
  ring.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).strokeDashoffset),
  );

/**
 * The billing family is arithmetic that has to be seen to be believed: a
 * total that re-sums when a row leaves, a charge split into whole cents, a
 * countdown that holds when told to, a credit that travels from one document
 * to another. Every test drives the mechanic through the keyboard where the
 * component publishes one — and through the pointer where the gesture is the
 * point — and reads the figures off the demo's status line and the ARIA the
 * component publishes about itself.
 */
test.describe("billing", () => {
  test("subscription-list: Enter cancels a row, focus and the clock pass to the next charge, and Restore brings it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/subscription-list");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component announces its monthly total before the demo's line.
    const announced = stage.locator("[role='status']").first();
    const list = stage.getByRole("list", { name: "Subscriptions" });
    const rows = list.getByRole("listitem");
    // A cancelled row keeps its timer while it leaves, so the live one is last.
    const timer = stage.getByRole("timer").last();
    const cancelFernworks = stage.getByRole("button", {
      name: "Cancel Fernworks Studio",
    });
    const cancelBasinworks = stage.getByRole("button", {
      name: "Cancel Basinworks Data",
    });
    const pause = stage.getByRole("button", { name: /^(Pause|Resume)$/ });
    const restore = stage.getByRole("button", { name: "Restore" });

    // Four rows, the yearly plan counted as a twelfth, and the soonest charge
    // — Fernworks, a day and two hours out — wears the clock.
    await expect(status).toContainText(
      /^Monthly \$111\.50 · next in 1d 02:1[34]:\d\d$/,
    );
    await expect(announced).toHaveText(
      "$111.50 a month across 4 subscriptions",
    );
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText(
      "Fernworks Studio, $18.00 a month",
    );
    await expect(rows.last()).toContainText(
      /Gaugeworks Atlas, \$240\.00 a year, \$20\.00 a month, next charge in 2[01] days/,
    );
    await expect(timer).toHaveAccessibleName("Next charge in 1 day 2 hours");
    await expect(stage.getByText("Monthly total, $111.50")).toHaveCount(1);
    await expect(restore).toBeDisabled();

    // Enter on the leading row's cancel: the row leaves, the next row's cancel
    // takes the focus, and the clock restarts on the charge that now leads.
    await cancelFernworks.focus();
    await page.keyboard.press("Enter");
    await expect(cancelBasinworks).toBeFocused();
    await expect(status).toContainText("cancelled Fernworks Studio");
    await expect(status).toContainText(
      /^Monthly \$93\.50 · next in 5d 02:59:5\d · cancelled Fernworks Studio$/,
      { timeout: 5000 },
    );
    await expect(announced).toHaveText("$93.50 a month across 3 subscriptions");
    await expect(cancelFernworks).toHaveCount(0);
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Basinworks Data, $64.00 a month");
    await expect(timer).toHaveAccessibleName(
      /^Next charge in 5 days [23] hours$/,
    );
    await expect(stage.getByText("Monthly total, $93.50")).toHaveCount(1);
    await expect(restore).toBeEnabled();

    // Pause holds the clock where it stands: the timer reads the same second
    // a second later, and the button offers Resume.
    await pause.click();
    await expect(pause).toHaveText("Resume");
    const held = (await timer.textContent()) ?? "";
    expect(held).toMatch(/^5d 02:59:\d\d$/);
    await page.waitForTimeout(1000);
    await expect(timer).toHaveText(held);
    await pause.click();
    await expect(pause).toHaveText("Pause");

    // Restore puts the cancelled row back at the top, and the total with it.
    await restore.click();
    await expect(status).toContainText(
      /^Monthly \$111\.50 · next in 1d 02:1[34]:\d\d$/,
    );
    await expect(announced).toHaveText(
      "$111.50 a month across 4 subscriptions",
    );
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Fernworks Studio");
    await expect(cancelFernworks).toBeVisible();
    await expect(timer).toHaveAccessibleName("Next charge in 1 day 2 hours");
    await expect(restore).toBeDisabled();
  });

  test("invoice-build: Enter removes the line under focus and hands focus on, the figures follow, and the last removal must not drop focus", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/invoice-build");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const lines = stage.getByRole("list", { name: "Invoice FW-2214" });
    const rows = lines.getByRole("listitem");
    const removeRig = stage.getByRole("button", { name: "Remove Rig hire" });
    const removeSurvey = stage.getByRole("button", {
      name: "Remove Site survey",
    });
    const removeSpool = stage.getByRole("button", {
      name: "Remove Cable spool",
    });
    const add = stage.getByRole("button", { name: "Add line" });
    const reset = stage.getByRole("button", { name: "Reset" });

    // Three lines — 360 + 480 + 222 — taxed at 8%.
    await expect(status).toContainText("Lines 3 · total $1,146.96");
    await expect(announced).toHaveText("Total $1,146.96 across 3 lines");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Rig hire, 3 at $120.00, $360.00");
    await expect(stage.getByText("Subtotal $1,062.00")).toHaveCount(1);
    await expect(stage.getByText("Tax 8 percent, $84.96")).toHaveCount(1);
    await expect(
      stage.getByText("Total $1,146.96", { exact: true }),
    ).toHaveCount(1);
    await expect(reset).toBeDisabled();

    // Enter on the first line's remove: the line goes, the next line's remove
    // takes the focus, and every figure rolls down.
    await removeRig.focus();
    await page.keyboard.press("Enter");
    await expect(removeSurvey).toBeFocused();
    await expect(status).toContainText(
      "Lines 2 · total $758.16 · removed Rig hire",
    );
    await expect(announced).toHaveText("Total $758.16 across 2 lines");
    await expect(rows).toHaveCount(2);
    await expect(stage.getByText("Subtotal $702.00")).toHaveCount(1);
    await expect(stage.getByText("Tax 8 percent, $56.16")).toHaveCount(1);
    await expect(reset).toBeEnabled();

    // A second Enter without moving: focus is already on the next remove.
    await page.keyboard.press("Enter");
    await expect(removeSpool).toBeFocused();
    await expect(status).toContainText(
      "Lines 1 · total $239.76 · removed Site survey",
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(
      "Cable spool, 12 at $18.50, $222.00",
    );

    // Add line walks the script: a fourth line opens and the figures rise.
    await add.click();
    await expect(status).toContainText(
      "Lines 2 · total $810.00 · added Mast section",
    );
    await expect(announced).toHaveText("Total $810.00 across 2 lines");
    await expect(rows).toHaveCount(2);
    await expect(rows.last()).toContainText(
      "Mast section, 2 at $264.00, $528.00",
    );
    await expect(stage.getByText("Subtotal $750.00")).toHaveCount(1);
    await expect(stage.getByText("Tax 8 percent, $60.00")).toHaveCount(1);
    await expect(stage.getByText("Total $810.00", { exact: true })).toHaveCount(
      1,
    );

    // Reset restores the opening three and forgets the last change.
    await reset.click();
    await expect(status).toHaveText("Lines 3 · total $1,146.96");
    await expect(rows).toHaveCount(3);
    await expect(reset).toBeDisabled();
    await expect(add).toBeEnabled();

    // A keyboard run of deletions to the empty state. The contract says the
    // last removal hands focus to the list rather than the body.
    await removeRig.focus();
    await page.keyboard.press("Enter");
    await expect(removeSurvey).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(removeSpool).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(removeSpool).toHaveCount(0);
    await expect(status).toContainText(
      "Lines 0 · total $0.00 · removed Cable spool",
    );
    await expect(announced).toHaveText("Total $0.00 across 0 lines");
    await expect(stage.getByText("No lines yet.")).toBeVisible();
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("due-badge: each state swaps the words and the glyph, only overdue breathes, and paid closes the pill", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/due-badge");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The badge speaks its whole standing through its own region, once.
    const announced = stage.locator("[role='status']").first();
    const pill = stage.locator("span.isolate");
    const pulse = stage.locator("[class*='-inset-0.5']");
    const due = stage.getByRole("button", { name: "Due", exact: true });
    const overdue = stage.getByRole("button", { name: "Overdue" });
    const paid = stage.getByRole("button", { name: "Paid" });

    await expect(status).toContainText("Invoice 4821 · due · $340.00");
    await expect(announced).toHaveText("Invoice 4821, due in 4 days, $340.00");
    await expect(due).toHaveAttribute("aria-pressed", "true");
    await expect(
      pill.getByText("Due in 4 days", { exact: true }).last(),
    ).toBeVisible();
    await expect(pulse).toHaveCount(0);
    const wide = await billingWidthOf(pill);

    // Overdue: the words slide, the glyph changes, and a ring breathes outside
    // the pill — the only state that gets ambient motion.
    await overdue.click();
    await expect(status).toContainText("Invoice 4821 · overdue · $340.00");
    await expect(announced).toHaveText(
      "Invoice 4821, overdue by 2 days, $340.00",
    );
    await expect(overdue).toHaveAttribute("aria-pressed", "true");
    await expect(due).toHaveAttribute("aria-pressed", "false");
    await expect(
      pill.getByText("Overdue by 2 days", { exact: true }).last(),
    ).toBeVisible();
    await expect(pill.getByText("Due in 4 days", { exact: true })).toHaveCount(
      0,
    );
    await expect(pulse).toHaveCount(1);

    // The badge owes no keyboard path of its own; the buttons are reached as
    // buttons are. Paid stops the pulse and closes the pill to its new words.
    await overdue.focus();
    await page.keyboard.press("Tab");
    await expect(paid).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Invoice 4821 · paid · $340.00");
    await expect(announced).toHaveText("Invoice 4821, paid, $340.00");
    await expect(paid).toHaveAttribute("aria-pressed", "true");
    await expect(pill.getByText("Paid", { exact: true }).last()).toBeVisible();
    await expect(
      pill.getByText("Overdue by 2 days", { exact: true }),
    ).toHaveCount(0);
    await expect(pulse).toHaveCount(0);
    await expect
      .poll(() => billingWidthOf(pill), { timeout: 5000 })
      .toBeLessThan(wide - 30);

    // Back to due, and the pill opens out to the longer label again.
    await due.click();
    await expect(announced).toHaveText("Invoice 4821, due in 4 days, $340.00");
    await expect(status).toContainText("Invoice 4821 · due · $340.00");
    await expect
      .poll(() => billingWidthOf(pill), { timeout: 5000 })
      .toBeGreaterThan(wide - 2);
  });

  test("payment-plan: arrows, Page keys and the ends re-split the charge in whole cents, and a click on the rail lands on its stop", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/payment-plan");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slider = stage.getByRole("slider", { name: "Order BSX-3390" });
    const plan = stage.getByRole("list", { name: "Order BSX-3390" });
    const rows = plan.getByRole("listitem");

    // $1,284 plus a 2% fee is 130,968 cents; three ways is exact.
    await expect(status).toContainText("3 × $436.56 · charged $1,309.68");
    await expect(slider).toHaveAttribute("aria-valuemin", "2");
    await expect(slider).toHaveAttribute("aria-valuemax", "8");
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "3 payments of $436.56 a month",
    );
    await expect(announced).toHaveText("3 payments of $436.56 a month");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Payment 1 of 3, today, $436.56");
    await expect(stage.getByText("Plan fee 2%")).toBeVisible();
    await expect(stage.getByText("$25.68", { exact: true })).toBeVisible();

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "4");
    await expect(status).toContainText("4 × $327.42 · charged $1,309.68");
    await expect(rows).toHaveCount(4);

    // Page keys move by three; seven ways leaves five cents for the front.
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "7");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "7 payments of $187.10 a month",
    );
    await expect(status).toContainText(
      "7 × $187.09 · charged $1,309.68 · first $187.10",
    );
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText("Payment 1 of 7, today, $187.10");
    await expect(rows.nth(4)).toContainText(
      "Payment 5 of 7, in 4 months, $187.10",
    );
    await expect(rows.nth(5)).toContainText(
      "Payment 6 of 7, in 5 months, $187.09",
    );
    await expect(rows.last()).toContainText(
      "Payment 7 of 7, in 6 months, $187.09",
    );
    await expect(
      stage.getByText("First payment, then $187.09 × 6"),
    ).toBeVisible();

    // End is the most instalments, and the slider does not step past it.
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "8");
    await expect(status).toContainText("8 × $163.71 · charged $1,309.68");
    await expect(status).not.toContainText("first");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "8");
    await expect(rows).toHaveCount(8);

    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "2");
    await expect(status).toContainText("2 × $654.84 · charged $1,309.68");
    await expect(rows).toHaveCount(2);
    await page.keyboard.press("PageDown");
    await expect(slider).toHaveAttribute("aria-valuenow", "2");

    // A plain click on the rail lands on the stop it hit: the middle is five,
    // and 130,968 over five hands three cents to the earliest payments.
    const rail = stage.locator("div.touch-none");
    const box = await rail.boundingBox();
    if (!box) throw new Error("the plan has no rail to click");
    await rail.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(slider).toHaveAttribute("aria-valuenow", "5");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "5 payments of $261.94 a month",
    );
    await expect(status).toContainText(
      "5 × $261.93 · charged $1,309.68 · first $261.94",
    );
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(2)).toContainText(
      "Payment 3 of 5, in 2 months, $261.94",
    );
    await expect(rows.nth(3)).toContainText(
      "Payment 4 of 5, in 3 months, $261.93",
    );
    await expect(announced).toHaveText("5 payments of $261.94 a month");
  });

  test("retry-schedule: Retry now runs the attempt early, a failure moves the wait on, and a success charges and ends the schedule", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/retry-schedule");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const schedule = stage.getByRole("list", { name: "Invoice WP-1180" });
    const attempts = schedule.getByRole("listitem");
    const timer = stage.getByRole("timer");
    const retry = stage.getByRole("button", { name: /^(Retry now|Trying)$/ });
    const succeed = stage.getByRole("button", { name: "Succeed next" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText(
      /^Attempt 2\/4 · waiting · next in 00:4\d$/,
    );
    await expect(announced).toHaveText(
      /^Invoice WP-1180: attempt 2 of 4, in 4\d seconds\.$/,
    );
    await expect(timer).toHaveAccessibleName(/^Next attempt in 4\d seconds$/);
    await expect(attempts).toHaveCount(4);
    await expect(attempts.nth(0)).toContainText("Attempt 1, Now, failed");
    await expect(attempts.nth(1)).toContainText("Attempt 2, +2h, next");
    await expect(attempts.nth(2)).toContainText("Attempt 3, +1d, scheduled");
    await expect(attempts.nth(3)).toContainText("Attempt 4, +3d, scheduled");
    await expect(stage.getByText("Payment failed")).toBeVisible();
    await expect(reset).toBeDisabled();

    // Enter on Retry now: the button goes busy without being disabled, the
    // wait holds, and the attempt comes back a failure — so the wait restarts
    // on the next dot.
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(retry).toHaveText("Trying");
    await expect(retry).toHaveAttribute("aria-busy", "true");
    await expect(retry).toHaveAttribute("aria-disabled", "true");
    await expect(status).toContainText("Attempt 2/4 · trying");
    await expect(announced).toHaveText("Invoice WP-1180: trying now.");
    await expect(attempts.nth(1)).toContainText("Attempt 2, +2h, running now");
    await expect(status).toContainText(
      /^Attempt 3\/4 · waiting · next in 00:4\d$/,
      { timeout: 5000 },
    );
    await expect(attempts.nth(1)).toContainText("Attempt 2, +2h, failed");
    await expect(attempts.nth(2)).toContainText("Attempt 3, +1d, next");
    await expect(announced).toHaveText(
      /^Invoice WP-1180: attempt 3 of 4, in 4\d seconds\.$/,
    );
    await expect(retry).toHaveText("Retry now");
    await expect(retry).not.toHaveAttribute("aria-busy", "true");
    await expect(reset).toBeEnabled();

    // Succeed next, and the same press: the tick lands, the rail turns, the
    // button gives way to the final line, and nothing is next any more.
    await succeed.click();
    await expect(succeed).toHaveAttribute("aria-pressed", "true");
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Attempt 4/4 · charged", {
      timeout: 5000,
    });
    await expect(announced).toHaveText("Invoice WP-1180: payment succeeded.");
    await expect(stage.getByText("Payment charged")).toBeVisible();
    await expect(timer).toHaveAccessibleName("Charged");
    await expect(retry).toHaveCount(0);
    await expect(attempts.nth(2)).toContainText("Attempt 3, +1d, succeeded");
    await expect(attempts.nth(3)).toContainText("Attempt 4, +3d, scheduled");

    // Reset puts the card back on its first wait.
    await reset.click();
    await expect(status).toContainText(
      /^Attempt 2\/4 · waiting · next in 00:4\d$/,
    );
    await expect(attempts.nth(1)).toContainText("Attempt 2, +2h, next");
    await expect(retry).toHaveText("Retry now");
    await expect(reset).toBeDisabled();
  });

  test("receipt-drawer: Enter opens a card where it stands, arrows walk the cards, the search filters them, and the front closes the drawer", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/receipt-drawer");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const front = stage.getByRole("button", { name: /^Fieldline expenses/ });
    const body = stage.getByRole("region", { name: "Fieldline expenses" });
    const search = stage.getByRole("searchbox", { name: "Search receipts" });
    const cards = stage.locator("li > button[aria-expanded]");
    const cafe = stage.getByRole("button", { name: /^Coldbrook Cafe Sep 2 / });
    const transit = stage.getByRole("button", { name: /^Basin Transit/ });

    await expect(status).toContainText("Drawer open · 5 of 5 · none open");
    await expect(front).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
    await expect(cards).toHaveCount(5);
    await expect(cafe).toHaveAttribute("aria-expanded", "false");
    await expect(announced).toBeEmpty();

    // Enter on a card opens it where it stands, to a measured height.
    await cafe.focus();
    await page.keyboard.press("Enter");
    await expect(cafe).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText(
      "Drawer open · 5 of 5 · Coldbrook Cafe open",
    );
    await expect(announced).toHaveText("Coldbrook Cafe open");
    const detail = stage.getByRole("region", { name: "Coldbrook Cafe" });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Flat white × 2");
    await expect(detail).toContainText("Client breakfast");
    await expect
      .poll(() => billingHeightOf(detail), { timeout: 5000 })
      .toBeGreaterThan(40);

    // Down moves to the next card and Up back; Escape on the open card closes
    // it and keeps the focus there.
    await page.keyboard.press("ArrowDown");
    await expect(transit).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(cafe).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(cafe).toHaveAttribute("aria-expanded", "false");
    await expect(cafe).toBeFocused();
    await expect(status).toContainText("Drawer open · 5 of 5 · none open");
    await expect(detail).toHaveCount(0);

    // Typing filters by merchant, note or line: "cold" keeps both cafe visits.
    await search.fill("cold");
    await expect(status).toContainText(
      'Drawer open · 2 match "cold" · none open',
    );
    await expect(announced).toHaveText("2 of 5 receipts shown");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Coldbrook Cafe");
    await expect(cards.last()).toContainText("Coldbrook Cafe");
    await expect(front).toContainText("2/ 5");

    await search.fill("zzz");
    await expect(status).toContainText(
      'Drawer open · 0 match "zzz" · none open',
    );
    await expect(stage.getByText("No receipts match.")).toBeVisible();
    await expect(cards).toHaveCount(0);

    // Escape in a non-empty search clears it, and the cards come back.
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(status).toContainText("Drawer open · 5 of 5 · none open");
    await expect(cards).toHaveCount(5);
    await expect(announced).toBeEmpty();

    // The front closes the drawer: the region goes inert and its height closes.
    await front.click();
    await expect(front).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("Drawer closed · 5 filed");
    await expect(body).toHaveCount(0);
    const closed = stage.locator("[role='region'][inert]");
    await expect(closed).toHaveCount(1);
    await expect
      .poll(() => billingHeightOf(closed), { timeout: 5000 })
      .toBeLessThan(1);

    // Space on the front pulls it open again.
    await front.focus();
    await page.keyboard.press(" ");
    await expect(front).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Drawer open · 5 of 5 · none open");
    await expect(body).toBeVisible();
    await expect
      .poll(() => billingHeightOf(body), { timeout: 5000 })
      .toBeGreaterThan(100);
  });

  test("tax-split: arrows switch the mode, Home and End jump, and the bar's end slides back to the marker when the tax moves inside", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/tax-split");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const modes = stage.getByRole("radiogroup", { name: "Studio plan mode" });
    const inclusive = modes.getByRole("radio", { name: "Inclusive" });
    const exclusive = modes.getByRole("radio", { name: "Exclusive" });
    const bar = stage.getByRole("img", { name: /^Studio plan: / });
    const barEnd = barEndOf(bar.locator("div.h-3 > span").nth(1));

    // Exclusive: the amount is the net, and the bar runs past the marker.
    await expect(status).toContainText(
      "exclusive · net $120.00 · tax $24.00 · total $144.00",
    );
    await expect(announced).toHaveText(
      "Studio plan exclusive: Net $120.00, Tax $24.00, Total $144.00",
    );
    await expect(bar).toHaveAccessibleName(
      "Studio plan: Net $120.00, Tax $24.00, Total $144.00",
    );
    await expect(exclusive).toHaveAttribute("aria-checked", "true");
    await expect(exclusive).toHaveAttribute("tabindex", "0");
    await expect(inclusive).toHaveAttribute("tabindex", "-1");
    await expect.poll(barEnd, { timeout: 5000 }).toBeGreaterThan(0.98);

    // Left from Exclusive lands on Inclusive and selects it: the tax comes out
    // of the amount, and the bar's end slides back to the marker.
    await exclusive.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(inclusive).toBeFocused();
    await expect(inclusive).toHaveAttribute("aria-checked", "true");
    await expect(exclusive).toHaveAttribute("aria-checked", "false");
    await expect(inclusive).toHaveAttribute("tabindex", "0");
    await expect(exclusive).toHaveAttribute("tabindex", "-1");
    await expect(status).toContainText(
      "inclusive · net $100.00 · tax $20.00 · total $120.00",
    );
    await expect(announced).toHaveText(
      "Studio plan inclusive: Net $100.00, Tax $20.00, Total $120.00",
    );
    await expect.poll(barEnd, { timeout: 5000 }).toBeLessThan(0.86);
    await expect.poll(barEnd, { timeout: 5000 }).toBeGreaterThan(0.8);

    // The group does not wrap; End and Home reach the two stops; Space keeps.
    await page.keyboard.press("ArrowLeft");
    await expect(inclusive).toBeFocused();
    await expect(inclusive).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("End");
    await expect(exclusive).toBeFocused();
    await expect(exclusive).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "exclusive · net $120.00 · tax $24.00 · total $144.00",
    );
    await page.keyboard.press("Home");
    await expect(inclusive).toBeFocused();
    await expect(inclusive).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press(" ");
    await expect(inclusive).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("inclusive · net $100.00");

    // A new amount keeps the mode: $1,080 inclusive carves $180 out of it.
    await stage.getByRole("button", { name: "$1,080.00" }).click();
    await expect(status).toContainText(
      "inclusive · net $900.00 · tax $180.00 · total $1,080.00",
    );
    await expect(bar).toHaveAccessibleName(
      "Studio plan: Net $900.00, Tax $180.00, Total $1,080.00",
    );
    await expect(stage.getByText("$900.00", { exact: true })).toHaveCount(1);

    // The pointer takes the other stop, and the bar overshoots the marker again.
    await exclusive.click();
    await expect(exclusive).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "exclusive · net $1,080.00 · tax $216.00 · total $1,296.00",
    );
    await expect(announced).toHaveText(
      "Studio plan exclusive: Net $1,080.00, Tax $216.00, Total $1,296.00",
    );
    await expect.poll(barEnd, { timeout: 5000 }).toBeGreaterThan(0.98);
  });

  test("proration-bar: keys move the split a day or a week, the ends reach the period's edges, and a click or a drag sets the day", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/proration-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const thumb = stage.getByRole("slider", {
      name: "Studio plan · Fieldline",
    });
    const earlier = stage.getByRole("button", { name: "A week earlier" });
    const later = stage.getByRole("button", { name: "A week later" });
    const track = stage.locator("div.touch-none");

    // Thirty days at $48: eleven used is $17.60, and the rest comes back.
    await expect(status).toContainText(
      "Change Sep 12 · 11 days used $17.60 · 19 days credit $30.40",
    );
    await expect(thumb).toHaveAttribute("aria-valuemin", "0");
    await expect(thumb).toHaveAttribute("aria-valuemax", "30");
    await expect(thumb).toHaveAttribute("aria-valuenow", "11");
    await expect(thumb).toHaveAttribute(
      "aria-valuetext",
      "Change on Sep 12: 11 days used, $17.60; 19 days credited, $30.40",
    );
    await expect(stage.getByText("30 days · $48.00")).toBeVisible();

    await thumb.focus();
    await page.keyboard.press("ArrowRight");
    await expect(thumb).toHaveAttribute("aria-valuenow", "12");
    await expect(status).toContainText(
      "Change Sep 13 · 12 days used $19.20 · 18 days credit $28.80",
    );
    await page.keyboard.press("PageUp");
    await expect(thumb).toHaveAttribute("aria-valuenow", "19");
    await expect(status).toContainText(
      "Change Sep 20 · 19 days used $30.40 · 11 days credit $17.60",
    );

    // End is the last day, and the split does not step past it.
    await page.keyboard.press("End");
    await expect(thumb).toHaveAttribute("aria-valuenow", "30");
    await expect(thumb).toHaveAttribute(
      "aria-valuetext",
      "Change on Oct 1: 30 days used, $48.00; 0 days credited, $0.00",
    );
    await expect(status).toContainText(
      "Change Oct 1 · 30 days used $48.00 · 0 days credit $0.00",
    );
    await expect(later).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await expect(thumb).toHaveAttribute("aria-valuenow", "30");

    await page.keyboard.press("Home");
    await expect(thumb).toHaveAttribute("aria-valuenow", "0");
    await expect(thumb).toHaveAttribute(
      "aria-valuetext",
      "Change on Sep 1: 0 days used, $0.00; 30 days credited, $48.00",
    );
    await expect(earlier).toBeDisabled();
    await page.keyboard.press("PageDown");
    await expect(thumb).toHaveAttribute("aria-valuenow", "0");

    // The host's nudge goes through the same value.
    await later.click();
    await expect(thumb).toHaveAttribute("aria-valuenow", "7");
    await expect(status).toContainText(
      "Change Sep 8 · 7 days used $11.20 · 23 days credit $36.80",
    );
    await expect(earlier).toBeEnabled();

    // A plain click on the track sets the day it hit: the middle is the 15th.
    const box = await track.boundingBox();
    if (!box) throw new Error("the period has no track to click");
    await track.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(thumb).toHaveAttribute("aria-valuenow", "15");
    await expect(status).toContainText(
      "Change Sep 16 · 15 days used $24.00 · 15 days credit $24.00",
    );

    // Dragging the thumb follows the hand once it has moved 4px: released at
    // four fifths of the track, the split is the 24th.
    const grip = await thumb.boundingBox();
    if (!grip) throw new Error("the split has no thumb to drag");
    const startX = grip.x + grip.width / 2;
    const startY = grip.y + grip.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 12, startY, { steps: 3 });
    await page.mouse.move(box.x + box.width * 0.8, startY, { steps: 10 });
    await page.mouse.up();
    await expect(thumb).toHaveAttribute("aria-valuenow", "24");
    await expect(thumb).toHaveAttribute(
      "aria-valuetext",
      "Change on Sep 25: 24 days used, $38.40; 6 days credited, $9.60",
    );
    await expect(status).toContainText(
      "Change Sep 25 · 24 days used $38.40 · 6 days credit $9.60",
    );
  });

  test("dunning-steps: Run drains the first ring and stamps the step, Pause holds the ring where it is, Resume finishes the next", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/dunning-steps");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const steps = stage
      .getByRole("list", { name: "Invoice 2041 · reminders" })
      .getByRole("listitem");
    const current = stage.locator("li[aria-current='step']");
    // The draining ring is the second circle in the next step's badge.
    const ringOffset = ringOffsetOf(current.locator("circle").nth(1));
    const pause = stage.getByRole("button", { name: /^(Pause|Resume)$/ });
    const run = stage.getByRole("button", { name: "Run" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("idle · 0 of 4 sent");
    await expect(steps).toHaveCount(4);
    await expect(current).toContainText("Friendly reminder");
    await expect(current).toContainText("Next");
    await expect(steps.nth(1)).toContainText("Upcoming");
    await expect(pause).toHaveAttribute("aria-pressed", "false");
    await expect(reset).toBeDisabled();
    await expect(announced).toBeEmpty();

    // Run: the first ring drains across 3.2 seconds and the step is stamped.
    await run.click();
    await expect(status).toContainText(
      "running · 0 of 4 sent · next Friendly reminder",
    );
    await expect(run).toBeDisabled();
    await expect(status).toContainText(
      "running · 1 of 4 sent · next Second notice",
      { timeout: 6000 },
    );
    await expect(announced).toHaveText("Friendly reminder sent");
    await expect(steps.first()).toContainText("Sent");
    await expect(current).toContainText("Second notice");

    // Enter on Pause freezes the rail: the ring reads the same offset a second
    // later, and the next step says so in a word.
    await pause.focus();
    await page.keyboard.press("Enter");
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await expect(pause).toHaveText("Resume");
    await expect(status).toContainText("paused · 1 of 4 sent");
    await expect(announced).toHaveText("Invoice 2041 · reminders paused");
    await expect(current).toContainText("Paused");
    const held = await ringOffset();
    expect(Number.isFinite(held)).toBe(true);
    await page.waitForTimeout(1000);
    expect(await ringOffset()).toBe(held);

    // Enter again resumes from the remainder: the ring moves on, and the
    // second notice goes out.
    await page.keyboard.press("Enter");
    await expect(pause).toHaveAttribute("aria-pressed", "false");
    await expect(pause).toHaveText("Pause");
    await expect(status).toContainText(
      "running · 1 of 4 sent · next Second notice",
    );
    await expect(announced).toHaveText("Invoice 2041 · reminders resumed");
    await expect.poll(ringOffset, { timeout: 3000 }).toBeGreaterThan(held);
    await expect(status).toContainText(
      "running · 2 of 4 sent · next Final notice",
      { timeout: 6000 },
    );
    await expect(announced).toHaveText("Second notice sent");
    await expect(steps.nth(1)).toContainText("Sent");
    await expect(current).toContainText("Final notice");

    // Reset stops the clock and puts every step back.
    await reset.click();
    await expect(status).toContainText("idle · 0 of 4 sent");
    await expect(current).toContainText("Friendly reminder");
    await expect(steps.first()).toContainText("Next");
    await expect(run).toBeEnabled();
    await expect(reset).toBeDisabled();
  });

  test("credit-note: Enter flies the applicable credit into the invoice, Remove flies it back, and a smaller note leaves a balance", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/credit-note");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Credit note remaining" });
    const action = stage.getByRole("button", {
      name: /^(Apply credit|Remove credit)/,
    });
    // The chip is aria-hidden decoration, so it is read off the page.
    const chip = stage.locator("span.z-10");

    await expect(status).toContainText("Applied $0.00 · invoice due $64.00");
    await expect(action).toHaveText("Apply credit · $64.00");
    await expect(meter).toHaveAttribute("aria-valuemax", "86");
    await expect(meter).toHaveAttribute("aria-valuenow", "86");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$0.00 applied, $86.00 remaining of $86.00",
    );
    await expect(announced).toBeEmpty();
    await expect(chip).toHaveCount(0);

    // Enter lifts a chip with the lesser of the credit and the balance; the
    // button holds disabled until it lands, and only then do the figures roll.
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText(
      "Applied $64.00 · invoice due $0.00 · $22.00 carries",
    );
    await expect(action).toBeDisabled();
    await expect(chip).toHaveText("−$64.00");
    await expect(announced).toHaveText("Applied $64.00, invoice total $0.00", {
      timeout: 5000,
    });
    await expect(chip).toHaveCount(0);
    await expect(action).toBeEnabled();
    await expect(action).toHaveText("Remove credit");
    await expect(meter).toHaveAttribute("aria-valuenow", "22");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$64.00 applied, $22.00 remaining of $86.00",
    );
    await expect(stage.getByText("−$64.00", { exact: true })).toHaveCount(1);

    // Enter again sends the chip back up, and the figures roll back.
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Applied $0.00 · invoice due $64.00");
    await expect(chip).toHaveText("+$64.00");
    await expect(announced).toHaveText("Credit removed, invoice total $64.00", {
      timeout: 5000,
    });
    await expect(chip).toHaveCount(0);
    await expect(action).toHaveText("Apply credit · $64.00");
    await expect(meter).toHaveAttribute("aria-valuenow", "86");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$0.00 applied, $86.00 remaining of $86.00",
    );

    // A smaller note: $40 against $64 applies whole and leaves $24 due.
    await stage.getByRole("button", { name: "Credit $40.00" }).click();
    await expect(action).toHaveText("Apply credit · $40.00");
    await expect(meter).toHaveAttribute("aria-valuemax", "40");
    await expect(meter).toHaveAttribute("aria-valuenow", "40");
    await action.click();
    await expect(status).toContainText("Applied $40.00 · invoice due $24.00");
    await expect(status).not.toContainText("carries");
    await expect(announced).toHaveText("Applied $40.00, invoice total $24.00", {
      timeout: 5000,
    });
    await expect(action).toHaveText("Remove credit");
    await expect(meter).toHaveAttribute("aria-valuenow", "0");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$40.00 applied, $0.00 remaining of $40.00",
    );
    await expect(stage.getByText("$24.00", { exact: true })).toHaveCount(1);
  });
});

/**
 * A verdict in the identity family holds for about a second — a review, a
 * scan, a prompt — and `expect` backs its own polling off to a second, so a
 * read that waits for such a moment polls on a tight cadence, and reads that
 * share one moment are issued together rather than one after the other.
 */
const tight = { intervals: [100], timeout: 4000 };
const textOf = (locator: Locator) => async (): Promise<string> =>
  (await locator.textContent()) ?? "";
const attributeOf =
  (locator: Locator, name: string) => async (): Promise<string | null> =>
    locator.getAttribute(name);

/**
 * The identity family is a series of verdicts the component never reaches on
 * its own: a review that comes back approved or rejected, a scan read as
 * blurred, a code that matched or did not, a device the host chose to trust.
 * Every test drives the mechanic through the keyboard where the component
 * publishes one, lets the demo's timers hand down the verdict, and reads the
 * outcome off the demo's status line and the ARIA the component publishes
 * about itself — the step that is current, the ring's value, the alert that
 * names the failure, the focus that was handed on.
 */
test.describe("identity", () => {
  test("kyc-steps: Enter submits the open step, approval stamps it and hands focus down, a rejection reopens it with the reason", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/kyc-steps");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const steps = stage
      .getByRole("list", { name: "Coldbrook Bank · open an account" })
      .getByRole("listitem");
    // Only the open step renders a control, so this is always that step's.
    const action = steps.getByRole("button");
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("step 1 of 3 · Identity document");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(0)).toHaveAttribute(
      "aria-label",
      "Identity document, step 1 of 3, open",
    );
    await expect(steps.nth(1)).toHaveAttribute(
      "aria-label",
      "Selfie, step 2 of 3, locked",
    );
    await expect(steps.nth(1)).not.toHaveAttribute("aria-current", "step");
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText("Submit");
    await expect(reset).toBeDisabled();
    await expect(announced).toBeEmpty();

    // Enter hands the step to the host: the button turns busy, keeps a name.
    await action.focus();
    await page.keyboard.press("Enter");
    // The review lasts 1.3s, so these read the one moment together.
    await Promise.all([
      expect(status).toContainText("step 1 of 3 · in review"),
      expect(action).toHaveText("In review"),
      expect(action).toHaveAttribute("aria-busy", "true"),
      expect(announced).toHaveText("Identity document in review."),
      expect(steps.nth(0)).toHaveAttribute(
        "aria-label",
        "Identity document, step 1 of 3, in review",
      ),
    ]);

    // Approval stamps the node, unlocks the selfie and hands focus to its
    // button rather than letting it fall to the body with the old one.
    await expect(status).toContainText("step 2 of 3 · Selfie", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Identity document approved. Selfie is next.",
    );
    await expect(steps.nth(0)).toHaveAttribute(
      "aria-label",
      "Identity document, step 1 of 3, approved",
    );
    await expect(steps.nth(0)).not.toHaveAttribute("aria-current", "step");
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(1)).toHaveAttribute(
      "aria-label",
      "Selfie, step 2 of 3, open",
    );
    await expect(action).toHaveCount(1);
    await expect(action).toBeFocused();

    // The first selfie comes back rejected: the reason is an alert, and the
    // same button now reads Resubmit.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("step 2 of 3 · in review");
    await expect(status).toContainText("step 2 of 3 · rejected", {
      timeout: 5000,
    });
    await expect(stage.getByRole("alert")).toHaveText(
      "Face was partly out of frame. Take it again.",
    );
    await expect(steps.nth(1)).toHaveAttribute(
      "aria-label",
      "Selfie, step 2 of 3, rejected",
    );
    await expect(action).toHaveText("Resubmit");
    await expect(action).toBeFocused();

    // Resubmitting approves; the third step opens and the alert is gone.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("step 3 of 3 · Proof of address", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Selfie approved. Proof of address is next.",
    );
    await expect(stage.getByRole("alert")).toHaveCount(0);
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
    await expect(action).toHaveText("Submit");

    await action.click();
    await expect(status).toContainText("verified · 3 of 3", { timeout: 5000 });
    await expect(announced).toHaveText("All steps approved.");
    await expect(steps.nth(2)).toHaveAttribute(
      "aria-label",
      "Proof of address, step 3 of 3, approved",
    );
    await expect(action).toHaveCount(0);

    await reset.click();
    await expect(status).toContainText("step 1 of 3 · Identity document");
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(action).toHaveText("Submit");
  });

  test("doc-scan: Enter captures, the brackets lock on and the bar sweeps, the first read is blurred and the retry is captured", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/doc-scan");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const frame = stage.getByRole("img", { name: /^Coldbrook ID, / });
    const action = stage.getByRole("button", {
      name: /^(Capture|Scanning|Retry|Captured)$/,
    });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("ready · hold the card in frame");
    await expect(frame).toHaveAccessibleName(
      "Coldbrook ID, hold the card in frame",
    );
    await expect(action).toHaveText("Capture");
    await expect(announced).toHaveText("Hold the card in frame");
    await expect(reset).toBeDisabled();

    // Enter starts finding: the same button turns busy and reads Scanning.
    await action.focus();
    await page.keyboard.press("Enter");
    // The brackets take half a second to lock on, so these read that one
    // moment together.
    await Promise.all([
      expect(status).toContainText("finding edges"),
      expect(action).toHaveText("Scanning"),
      expect(action).toHaveAttribute("aria-busy", "true"),
      expect(frame).toHaveAccessibleName("Coldbrook ID, finding edges"),
      expect(announced).toHaveText("Finding edges"),
    ]);

    // The brackets settle and the bar sweeps for 1.4s; then the host reads
    // the first scan as blurred, which is an alert, and the button offers
    // Retry.
    await Promise.all([
      expect.poll(textOf(status), tight).toContain("scanning"),
      expect
        .poll(attributeOf(frame, "aria-label"), tight)
        .toBe("Coldbrook ID, hold still"),
      expect.poll(textOf(announced), tight).toBe("Hold still"),
    ]);
    await expect(status).toContainText("blurred · hold still", {
      timeout: 6000,
    });
    await expect(stage.getByRole("alert")).toHaveText(
      "Blurred. Hold the document still",
    );
    await expect(frame).toHaveAccessibleName(
      "Coldbrook ID, blurred. hold the document still",
    );
    await expect(action).toHaveText("Retry");
    await expect(action).not.toHaveAttribute("aria-busy", "true");
    await expect(announced).toBeEmpty();

    // Retry is the same button, still focused: Enter finds, scans, captures.
    await expect(action).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("finding edges");
    await expect(status).toContainText("captured · coldbrook id", {
      timeout: 8000,
    });
    await expect(frame).toHaveAccessibleName("Coldbrook ID, captured");
    await expect(action).toHaveText("Captured");
    await expect(action).toHaveAttribute("aria-disabled", "true");
    await expect(announced).toHaveText("Captured");
    await expect(stage.getByRole("alert")).toHaveCount(0);

    // A captured frame does not capture again.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("captured · coldbrook id");

    await reset.click();
    await expect(status).toContainText("ready · hold the card in frame");
    await expect(action).toHaveText("Capture");
  });

  test("selfie-ring: Enter starts the prompts and the ring fills one segment each, a lost face drains it, Try again runs through to passed", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/selfie-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The caption is the component's own status region, ahead of the demo's.
    const caption = stage.locator("[role='status']").first();
    const ring = stage.getByRole("progressbar", {
      name: "Basinworks Exchange · confirm withdrawal",
    });
    const action = stage.getByRole("button", {
      name: /^(Start check|Checking|Passed|Try again)$/,
    });
    const lose = stage.getByRole("button", { name: "Lose the face" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("ready · 0 of 4");
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expect(ring).toHaveAttribute("aria-valuemax", "4");
    await expect(ring).toHaveAttribute(
      "aria-valuetext",
      "0 of 4, ready when you are",
    );
    await expect(caption).toHaveText("Ready when you are");
    await expect(action).toHaveText("Start check");
    await expect(lose).toBeDisabled();
    await expect(reset).toBeDisabled();

    await action.focus();
    await page.keyboard.press("Enter");
    // A prompt holds for 1.1s, so these read the one moment together.
    await Promise.all([
      expect(status).toContainText("Centre your face · 1 of 4"),
      expect(action).toHaveText("Checking"),
      expect(action).toHaveAttribute("aria-busy", "true"),
      expect(ring).toHaveAttribute("aria-valuenow", "0"),
      expect(ring).toHaveAttribute(
        "aria-valuetext",
        "0 of 4, centre your face",
      ),
      expect(caption).toHaveText("Centre your face"),
    ]);

    // The host advances one prompt per beat; the ring counts the ones done.
    await Promise.all([
      expect.poll(textOf(status), tight).toContain("Turn left · 2 of 4"),
      expect.poll(attributeOf(ring, "aria-valuenow"), tight).toBe("1"),
      expect
        .poll(attributeOf(ring, "aria-valuetext"), tight)
        .toBe("1 of 4, turn left"),
    ]);

    // Losing the face drains the ring to nothing and raises an alert.
    await lose.click();
    await expect(status).toContainText("failed · face lost");
    await expect(stage.getByRole("alert")).toHaveText("Face lost");
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expect(ring).toHaveAttribute("aria-valuetext", "0 of 4, face lost");
    await expect(action).toHaveText("Try again");
    await expect(action).not.toHaveAttribute("aria-busy", "true");
    await expect(lose).toBeDisabled();

    // Try again starts from the first prompt and runs through to passed.
    await action.click();
    await Promise.all([
      expect(status).toContainText("Centre your face · 1 of 4"),
      expect(ring).toHaveAttribute("aria-valuenow", "0"),
    ]);
    await expect
      .poll(textOf(status), { ...tight, timeout: 6000 })
      .toContain("Blink · 4 of 4");
    await expect(status).toContainText("passed · 4 of 4", { timeout: 4000 });
    await expect(ring).toHaveAttribute("aria-valuenow", "4");
    await expect(ring).toHaveAttribute("aria-valuetext", "4 of 4, all clear");
    await expect(caption).toHaveText("All clear");
    await expect(action).toHaveText("Passed");
    await expect(action).toHaveAttribute("aria-disabled", "true");

    await reset.click();
    await expect(status).toContainText("ready · 0 of 4");
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expect(action).toHaveText("Start check");
  });

  test("otp-cells: typed digits advance the row and Backspace steps back, a wrong code is refused and cleared, the pasted code verifies", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/otp-cells");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const group = stage.getByRole("group", {
      name: "Waylight Pay · confirm sign-in",
    });
    const cell = (n: number): Locator =>
      group.getByRole("textbox", { name: `Digit ${n} of 6` });
    const paste = stage.getByRole("button", { name: "Paste code" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("code · 0 of 6");
    await expect(group.getByRole("textbox")).toHaveCount(6);
    // Tab enters the row at the first empty cell.
    await expect(cell(1)).toHaveAttribute("tabindex", "0");
    await expect(cell(2)).toHaveAttribute("tabindex", "-1");
    await expect(announced).toBeEmpty();

    // Each digit lands and moves the focus on; Backspace on an empty cell
    // clears the one before it and steps back; Home and End jump.
    await cell(1).focus();
    await page.keyboard.type("4821");
    await expect(status).toContainText("code · 4 of 6");
    await expect(cell(5)).toBeFocused();
    await expect(cell(5)).toHaveAttribute("tabindex", "0");
    await expect(cell(4)).toHaveValue("1");
    await page.keyboard.press("Backspace");
    await expect(status).toContainText("code · 3 of 6");
    await expect(cell(4)).toBeFocused();
    await expect(cell(4)).toHaveValue("");
    await page.keyboard.press("Home");
    await expect(cell(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(cell(4)).toBeFocused();

    // A wrong code fills the row and asks for verification once the last
    // digit has landed; refused, the row clears and focus returns to the
    // first cell with the reason as an alert.
    await page.keyboard.type("199");
    // Verification holds for 1.2s, so these read the one moment together.
    await Promise.all([
      expect.poll(textOf(status), tight).toContain("verifying"),
      expect.poll(attributeOf(group, "aria-busy"), tight).toBe("true"),
      expect.poll(textOf(announced), tight).toBe("Verifying"),
      expect(cell(6)).toHaveValue("9"),
    ]);
    await expect(status).toContainText("rejected · try again", {
      timeout: 5000,
    });
    await expect(stage.getByRole("alert")).toHaveText(
      "That code did not match.",
    );
    await expect(cell(1)).toHaveAttribute("aria-invalid", "true");
    await expect(group).not.toHaveAttribute("aria-busy", "true");
    await expect(cell(1)).toBeFocused();
    await expect(cell(6)).toHaveValue("");
    await expect(cell(1)).toHaveValue("");
    await expect(announced).toBeEmpty();

    // The sent code arrives in one commit and verifies.
    await paste.click();
    await Promise.all([
      expect(cell(1)).toHaveValue("4"),
      expect(cell(6)).toHaveValue("0"),
      expect.poll(textOf(status), tight).toContain("verifying"),
    ]);
    await expect(status).toContainText("verified · signed in", {
      timeout: 5000,
    });
    await expect(announced).toHaveText("Verified");
    await expect(stage.getByRole("alert")).toHaveCount(0);
    await expect(cell(1)).not.toHaveAttribute("aria-invalid", "true");
    await expect(cell(6)).toHaveJSProperty("readOnly", true);
    await expect(paste).toBeDisabled();

    await reset.click();
    await expect(status).toContainText("code · 0 of 6");
    await expect(cell(6)).toHaveValue("");
  });

  test("device-trust: Enter asks for approval and the seal stamps when the host trusts, hover lifts its edge, Enter again peels it away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/device-trust");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const card = stage.getByRole("group", {
      name: "Coldbrook Bank · this device",
    });
    const action = card.getByRole("button", {
      name: /^(Trust this device|Approving|Revoke trust)$/,
    });
    // The seal is aria-hidden art, so it is read off the page; its ring of
    // type is the text it carries.
    const seal = card.locator("span.drop-shadow-sm");
    const lift = async (): Promise<number> =>
      seal.evaluate((element) => {
        const match = /rotateY\(([-\d.]+)deg\)/.exec(element.style.transform);
        return match ? Number(match[1]) : 0;
      });

    await expect(status).toContainText("untrusted · asks every time");
    await expect(card).toContainText("Fieldline Air 13");
    await expect(card).toContainText("Asks for a code every time");
    await expect(action).toHaveText("Trust this device");
    await expect(seal).toHaveCount(0);
    await expect(announced).toBeEmpty();

    await action.focus();
    await page.keyboard.press("Enter");
    // Approval takes 1.2s, so these read the one moment together.
    await Promise.all([
      expect(status).toContainText("approving"),
      expect(action).toHaveText("Approving"),
      expect(action).toHaveAttribute("aria-busy", "true"),
      expect(card).toContainText("Waiting for approval"),
      expect(announced).toHaveText("Approving"),
    ]);

    // The host approves: the seal stamps and the footer remembers the device.
    await expect(status).toContainText("trusted · 30 days", { timeout: 5000 });
    await expect(action).toHaveText("Revoke trust");
    await expect(action).not.toHaveAttribute("aria-busy", "true");
    await expect(seal).toContainText("TRUSTED · DEVICE");
    await expect(card).toContainText("Remembered for 30 days");
    await expect(announced).toHaveText("Trusted for 30 days");

    // Hovering Revoke previews the peel: the seal's edge lifts, and settles
    // back when the pointer leaves.
    await action.hover();
    await expect.poll(lift, { timeout: 3000 }).toBe(18);
    await page.mouse.move(0, 0);
    await expect.poll(lift, { timeout: 3000 }).toBe(0);

    // Enter on Revoke peels the seal away, and the footer swaps back.
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("revoked · asks every time");
    await expect(action).toHaveText("Trust this device");
    await expect(card).toContainText("Asks for a code every time");
    await expect(announced).toHaveText("Trust revoked");
    await expect(seal).toHaveCount(0);
  });

  test("risk-hold: the ring drains and the window closing sends the payment on its own, a fresh hold is frozen by Enter on Escalate and cleared by Release", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/risk-hold");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const card = stage.getByRole("group", { name: "Waylight Pay" });
    const timer = card.getByRole("timer", { name: "Review window" });
    // The draining ring is the second circle in the window.
    const ringOffset = ringOffsetOf(timer.locator("circle").nth(1));
    const release = card.getByRole("button", { name: "Release" });
    const escalate = card.getByRole("button", {
      name: /^(Escalate|Escalated)$/,
    });
    const holdAgain = stage.getByRole("button", { name: "Hold again" });

    await expect(status).toContainText("Held · review 8s");
    await expect(card).toContainText("Held for review");
    await expect(announced).toHaveText(
      "Held for review. Releases in 8 seconds unless escalated.",
    );
    await expect(escalate).toHaveText("Escalate");
    await expect(escalate).not.toHaveAttribute("aria-disabled", "true");
    await expect(holdAgain).toBeDisabled();

    // The readout ticks from the motion value, and the ring drains with it.
    // The window is eight seconds from the page's own load, so this reads
    // whatever second it is on and waits for the next.
    await expect(timer).toHaveText(/^0:0[5-8]$/);
    const readout = (await timer.textContent()) ?? "";
    const fresh = await ringOffset();
    await expect(timer).not.toHaveText(readout, { timeout: 4000 });
    expect(await ringOffset()).toBeGreaterThan(fresh);

    // The window closing sends the payment with nobody pressing anything:
    // the notice leaves, the chip turns to Sent, and the cause is the timer.
    await expect(status).toContainText("Released on timer · sent", {
      timeout: 15000,
    });
    await expect(announced).toHaveText(
      "Released when the review window closed. Payment sent.",
    );
    await expect(card).toContainText("Sent");
    await expect(timer).toHaveCount(0);
    await expect(release).toHaveCount(0);
    await expect(holdAgain).toBeEnabled();

    // A fresh hold gets a full ring: a resumed one would read a remainder, a
    // fresh one reads the whole window, on the second it opens or the next.
    await holdAgain.click();
    await Promise.all([
      expect(status).toContainText("Held · review 8s"),
      expect(timer).toHaveText(/^0:0[78]$/),
      expect(announced).toHaveText(
        "Held for review. Releases in 8 seconds unless escalated.",
      ),
    ]);
    await expect(card).toContainText("1,240.00");
    await expect(card).toContainText("to Fernworks Ltd");

    // Enter on Escalate freezes the window: the ring reads the same a second
    // later, the control becomes an inert label, and the chip turns.
    await escalate.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Escalated · awaiting review");
    await expect(escalate).toHaveText("Escalated");
    await expect(escalate).toHaveAttribute("aria-disabled", "true");
    await expect(card).toContainText("Escalated for review");
    await expect(announced).toHaveText("Escalated for manual review.");
    const held = await ringOffset();
    const frozen = (await timer.textContent()) ?? "";
    await page.waitForTimeout(1000);
    expect(await ringOffset()).toBe(held);
    await expect(timer).toHaveText(frozen);
    // The label stays a label: pressing it again changes nothing.
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Escalated · awaiting review");

    // A human still clears it: Release slides the notice away and sends.
    await release.focus();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Released by reviewer · sent");
    await expect(announced).toHaveText("Released by reviewer. Payment sent.");
    await expect(card).toContainText("Sent");
    await expect(timer).toHaveCount(0);
  });

  test("two-factor: a wrong code is refused and cleared, the seeded code verifies, and ArrowRight switches to the device route that approves", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/two-factor");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const tabs = stage.getByRole("tablist", { name: "Verification method" });
    const codeTab = tabs.getByRole("tab", { name: "Enter code" });
    const deviceTab = tabs.getByRole("tab", { name: "Approve on device" });
    const input = stage.getByRole("textbox", { name: "6-digit code" });
    const panel = stage.getByRole("tabpanel");
    // The header's stamp; the announcement says "Verified." with a stop.
    const stamp = stage.getByText("Verified", { exact: true });
    const approve = stage.getByRole("button", { name: "Approve on phone" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText("Code · waiting");
    await expect(codeTab).toHaveAttribute("aria-selected", "true");
    await expect(deviceTab).toHaveAttribute("aria-selected", "false");
    await expect(panel).toHaveAccessibleName("Enter code");
    await expect(panel).toContainText("From your authenticator app.");
    await expect(input).toHaveValue("");
    await expect(stamp).toHaveCount(0);
    await expect(approve).toBeDisabled();
    await expect(reset).toBeDisabled();
    await expect(announced).toBeEmpty();

    // The sixth digit submits. A wrong code is checked, then refused: the
    // field clears, the alert names it, and the input is marked invalid.
    await input.focus();
    await page.keyboard.type("482911");
    await expect(status).toContainText("code · checking");
    await expect(status).toContainText("Code · did not match", {
      timeout: 4000,
    });
    await expect(stage.getByRole("alert")).toHaveText(
      "That code did not match.",
    );
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveValue("");
    await expect(panel).toContainText("That code did not match.");
    await expect(stamp).toHaveCount(0);

    // The seeded code goes through, and the header takes the stamp.
    await page.keyboard.type("482913");
    await expect(status).toContainText("code · checking");
    await expect(status).toContainText("Verified · via code", {
      timeout: 4000,
    });
    await expect(announced).toHaveText("Verified.");
    await expect(stamp).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(panel).toContainText("Code accepted.");
    await expect(stage.getByRole("alert")).toHaveCount(0);

    // Reset, then ArrowRight both moves and selects the device route.
    await reset.click();
    await expect(status).toContainText("Code · waiting");
    await expect(stamp).toHaveCount(0);
    await expect(input).toHaveValue("");
    await codeTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(deviceTab).toBeFocused();
    await expect(deviceTab).toHaveAttribute("aria-selected", "true");
    await expect(codeTab).toHaveAttribute("aria-selected", "false");
    await expect(status).toContainText("Device · waiting for phone");
    await expect(panel).toHaveAccessibleName("Approve on device");
    await expect(panel).toContainText("Waiting for Coldbrook phone");
    await expect(announced).toHaveText(
      "Waiting for approval on Coldbrook phone.",
    );
    await expect(input).toHaveCount(0);
    await expect(approve).toBeEnabled();

    // The phone approves: the same stamp lands, by the other route.
    await approve.click();
    await expect(status).toContainText("device · checking");
    await expect(status).toContainText("Verified · via device", {
      timeout: 4000,
    });
    await expect(panel).toContainText("Approved on Coldbrook phone");
    await expect(stamp).toBeVisible();
    await expect(announced).toHaveText("Verified.");
    await expect(approve).toBeDisabled();
  });

  test("session-list: Enter signs one session out and hands focus to the next row, the footer cascades the rest away, Restore brings them back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/session-list");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const list = stage.getByRole("list", { name: "Basinworks Exchange" });
    const rows = list.getByRole("listitem");
    const coldbrook = list.getByRole("button", {
      name: "Sign out Coldbrook phone",
    });
    const fieldline = list.getByRole("button", {
      name: "Sign out Fieldline tablet",
    });
    const gaugeworks = list.getByRole("button", {
      name: "Sign out Gaugeworks laptop",
    });
    const footer = stage.getByRole("button", {
      name: "Sign out all other sessions",
    });
    const restore = stage.getByRole("button", { name: "Restore" });

    await expect(status).toHaveText("4 sessions · 3 other");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Waylight laptop");
    await expect(rows.first()).toContainText("This device");
    // The live row has no control of its own.
    await expect(list.getByRole("button")).toHaveCount(3);
    await expect(
      list.getByRole("button", { name: "Sign out Waylight laptop" }),
    ).toHaveCount(0);
    await expect(restore).toBeDisabled();
    await expect(announced).toBeEmpty();

    // Enter on a row's button signs it out; focus lands on the next row's
    // button before the row leaves, and the count rolls.
    await coldbrook.focus();
    await page.keyboard.press("Enter");
    await expect(fieldline).toBeFocused();
    await expect(status).toHaveText(
      "3 sessions · 2 other · signed out Coldbrook phone",
    );
    await expect(announced).toHaveText("Signed out Coldbrook phone");
    await expect(rows).toHaveCount(3);
    await expect(coldbrook).toHaveCount(0);
    await expect(rows.nth(1)).toContainText("Fieldline tablet");
    await expect(restore).toBeEnabled();

    // The footer takes every other session, top to bottom, then leaves.
    await footer.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("1 session · 0 other · signed out all");
    await expect(announced).toHaveText("Signed out 2 sessions");
    await expect(rows).toHaveCount(1);
    await expect(fieldline).toHaveCount(0);
    await expect(gaugeworks).toHaveCount(0);
    await expect(footer).toHaveCount(0);
    await expect(stage.getByText("No other sessions.")).toBeVisible();
    await expect(rows.first()).toContainText("This device");

    await restore.click();
    await expect(status).toHaveText("4 sessions · 3 other");
    await expect(rows).toHaveCount(4);
    await expect(list.getByRole("button")).toHaveCount(3);
    await expect(footer).toBeVisible();
    await expect(restore).toBeDisabled();
  });

  test("liveness-dots: Enter catches the dot at each stop, a stop left alone is missed and fails the check, Try again runs a clean loop", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/liveness-dots");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const check = stage.getByRole("group", { name: "Basinworks Exchange" });
    const begin = check.getByRole("button", { name: "Begin check" });
    const retry = check.getByRole("button", { name: "Try again" });
    const dot = check.getByRole("button", {
      name: /^Dot, stop \d of 6\. Press to catch it\.$/,
    });
    // The closed loop through every stop; the caught rings are circles.
    const loop = check.locator("path.stroke-success");

    await expect(status).toHaveText("Idle");
    await expect(check).toContainText("0 / 6");
    await expect(dot).toHaveCount(0);
    await expect(announced).toBeEmpty();

    // Begin from the keyboard — the pointer stays out of the stage, where
    // touching the dot would count as a catch — and the dot takes focus.
    await begin.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Running · 0 of 6");
    await expect(dot).toHaveAccessibleName(
      "Dot, stop 1 of 6. Press to catch it.",
    );
    await expect(dot).toBeFocused();
    await expect(begin).toHaveCount(0);

    // Space catches: the stop is stamped and the dot moves on, keeping focus.
    // The next window closes about two seconds later, so these read the one
    // moment together.
    await page.keyboard.press(" ");
    await Promise.all([
      expect(status).toHaveText("Running · 1 of 6"),
      expect(announced).toHaveText("Caught 1 of 6"),
      expect(dot).toHaveAccessibleName("Dot, stop 2 of 6. Press to catch it."),
      expect(dot).toBeFocused(),
      expect(check).toContainText("1 / 6"),
    ]);

    // Left alone for the window, the second stop is missed.
    await expect(announced).toHaveText("Missed 2 of 6", { timeout: 5000 });
    await Promise.all([
      expect(status).toHaveText("Running · 2 of 6"),
      expect(dot).toHaveAccessibleName("Dot, stop 3 of 6. Press to catch it."),
    ]);

    // Enter catches the rest; one miss ends in failed, focus on Try again.
    for (const stop of [3, 4, 5, 6]) {
      await page.keyboard.press("Enter");
      await expect(announced).toHaveText(
        stop === 6 ? "Check failed. 5 of 6 caught." : `Caught ${stop} of 6`,
      );
    }
    await expect(status).toHaveText("Failed · 5 of 6");
    await expect(check).toContainText("5 of 6 caught. Try again.");
    await expect(check).toContainText("5 / 6");
    await expect(dot).toHaveCount(0);
    await expect(retry).toBeFocused();
    await expect(loop).toHaveCount(0);

    // Try again restarts from the first stop; six catches close the loop.
    await page.keyboard.press("Enter");
    await Promise.all([
      expect(status).toHaveText("Running · 0 of 6"),
      expect(check).toContainText("0 / 6"),
      expect(dot).toBeFocused(),
    ]);
    for (const stop of [1, 2, 3, 4, 5, 6]) {
      await expect(dot).toHaveAccessibleName(
        `Dot, stop ${stop} of 6. Press to catch it.`,
      );
      await page.keyboard.press("Enter");
    }
    await expect(status).toHaveText("Passed · 6 of 6");
    await expect(announced).toHaveText("Liveness confirmed");
    await expect(check).toContainText("Liveness confirmed.");
    await expect(check).toContainText("6 / 6");
    await expect(loop).toHaveCount(1);
    await expect(dot).toHaveCount(0);
  });

  test("verified-seal: the checks stamp the seal, focus opens what was checked, Enter pins it, Escape closes it, Revoke lifts it away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/verified-seal");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const seal = stage.getByRole("button", {
      name: "Verified. Show what was checked",
    });
    const details = stage.getByRole("region", {
      name: "Verification details",
    });
    const run = stage.getByRole("button", { name: "Run checks" });
    const revoke = stage.getByRole("button", { name: "Revoke" });

    await expect(status).toHaveText("Unverified");
    await expect(stage.getByText("Marta Ferreira")).toBeVisible();
    await expect(seal).toHaveCount(0);
    await expect(details).toHaveCount(0);
    await expect(revoke).toBeDisabled();
    await expect(announced).toBeEmpty();

    // The host's checks resolve to verified: the seal stamps beside the
    // name, closed, and the profile is announced once.
    await run.click();
    await Promise.all([
      expect(status).toHaveText("Checking"),
      expect(run).toBeDisabled(),
    ]);
    await expect(status).toHaveText("Verified · 3 checks", { timeout: 4000 });
    await expect(seal).toHaveAttribute("aria-expanded", "false");
    await expect(announced).toHaveText("Marta Ferreira is verified.");
    await expect(details).toHaveCount(0);
    await expect(revoke).toBeEnabled();

    // Focus opens the strip without pinning it.
    await seal.focus();
    await expect(seal).toHaveAttribute("aria-expanded", "true");
    await expect(details).toBeVisible();
    await expect(details).toContainText("Verified 3 Apr 2026");
    await expect(details.getByRole("listitem")).toHaveCount(3);
    await expect(details.getByRole("listitem").nth(0)).toContainText(
      "Identity",
    );
    await expect(details.getByRole("listitem").nth(2)).toContainText(
      "Payout account",
    );
    await expect(status).toHaveText("Verified · 3 checks");

    // Enter pins it open; Escape closes it and keeps focus on the seal.
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Verified · details open");
    await expect(seal).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(status).toHaveText("Verified · 3 checks");
    await expect(seal).toHaveAttribute("aria-expanded", "false");
    await expect(details).toHaveCount(0);
    await expect(seal).toBeFocused();

    // Hover reads it too, and leaving closes it.
    await seal.hover();
    await expect(seal).toHaveAttribute("aria-expanded", "true");
    await expect(details).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(seal).toHaveAttribute("aria-expanded", "false");
    await expect(details).toHaveCount(0);

    // Revoke lifts the seal away, with the strip it would have opened.
    await revoke.click();
    await expect(status).toHaveText("Unverified");
    await expect(announced).toHaveText("Verification removed.");
    await expect(seal).toHaveCount(0);
    await expect(details).toHaveCount(0);
    await expect(run).toBeEnabled();
  });
});

/**
 * The credit family is about borrowing: what a loan costs, how far through it
 * you are, a score, a limit, two offers side by side, a schedule of shares, an
 * overdraft, a plan for clearing debts, a standing order and a grace period.
 * Every test drives the mechanic through the keyboard where the component
 * publishes one, and reads the outcome off the demo's status line and the ARIA
 * the component publishes about itself. Every figure asserted here was run
 * once by hand through the same amortisation the components use.
 */
test.describe("credit", () => {
  test("loan-slider: keys step the amount, a click on the track sets it, the term chips rove, and every figure follows", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/loan-slider");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slider = stage.getByRole("slider", { name: "Loan amount" });
    const terms = stage.getByRole("radiogroup", { name: "Term" });
    const chip = (months: number): Locator =>
      terms.getByRole("radio", { name: `${months} mo`, exact: true });

    await expect(status).toContainText(
      "12,500.00 · 36 mo | 402.75 / mo | interest 1,999.12",
    );
    await expect(slider).toHaveAttribute("aria-valuemin", "1000");
    await expect(slider).toHaveAttribute("aria-valuemax", "25000");
    await expect(slider).toHaveAttribute("aria-valuenow", "12500");
    await expect(slider).toHaveAttribute("aria-valuetext", "12,500.00");
    await expect(chip(36)).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText(
      "12,500.00 over 36 months at 9.9 percent: 402.75 a month, 1,999.12 interest, 14,499.12 repaid",
    );

    // An arrow is one step of 250; a Page key is ten of them.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "12750");
    await expect(status).toContainText(
      "12,750.00 · 36 mo | 410.81 / mo | interest 2,039.10",
    );
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "15250");
    await expect(status).toContainText(
      "15,250.00 · 36 mo | 491.36 / mo | interest 2,438.92",
    );

    // End is the dearest loan on offer and the thumb does not step past it;
    // Home is the cheapest.
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "25000");
    await expect(status).toContainText(
      "25,000.00 · 36 mo | 805.51 / mo | interest 3,998.23",
    );
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "25000");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "1000");
    await expect(status).toContainText(
      "1,000.00 · 36 mo | 32.22 / mo | interest 159.93",
    );
    await expect(announced).toHaveText(
      "1,000.00 over 36 months at 9.9 percent: 32.22 a month, 159.93 interest, 1,159.93 repaid",
    );

    // A plain click on the middle of the track is halfway between the ends,
    // and 13,000 is already on a step.
    const box = await slider.boundingBox();
    if (!box) throw new Error("the loan slider has no track to click");
    await slider.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(slider).toHaveAttribute("aria-valuenow", "13000");
    await expect(status).toContainText(
      "13,000.00 · 36 mo | 418.86 / mo | interest 2,079.08",
    );

    // The term chips rove: an arrow both moves and picks, and a longer term
    // is a smaller month and more interest — the point of the rail.
    await chip(36).focus();
    await page.keyboard.press("ArrowRight");
    await expect(chip(48)).toBeFocused();
    await expect(chip(48)).toHaveAttribute("aria-checked", "true");
    await expect(chip(36)).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "13,000.00 · 48 mo | 329.09 / mo | interest 2,796.30",
    );
    await page.keyboard.press("End");
    await expect(chip(60)).toBeFocused();
    await expect(status).toContainText(
      "13,000.00 · 60 mo | 275.57 / mo | interest 3,534.34",
    );
    await page.keyboard.press("ArrowRight");
    await expect(chip(60)).toBeFocused();
    await expect(chip(60)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Home");
    await expect(chip(12)).toBeFocused();
    await expect(chip(12)).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "13,000.00 · 12 mo | 1,142.30 / mo | interest 707.62",
    );
    await expect(announced).toHaveText(
      "13,000.00 over 12 months at 9.9 percent: 1,142.30 a month, 707.62 interest, 13,707.62 repaid",
    );

    // The pointer picks a chip the same way.
    await chip(24).click();
    await expect(chip(24)).toHaveAttribute("aria-checked", "true");
    await expect(chip(12)).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "13,000.00 · 24 mo | 599.28 / mo | interest 1,382.82",
    );
  });

  test("repayment-arc: a payment fills the arc and counts the centre, the due date moves on only once the fill has settled, and Reset takes it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/repayment-arc");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", {
      name: "Coldbrook Bank vehicle loan",
    });
    const pay = stage.getByRole("button", { name: "Make payment" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText(
      "14 of 36 paid | principal 6,530.96 · interest 1,296.24 | next 12 Dec",
    );
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "20127.08");
    await expect(meter).toHaveAttribute("aria-valuenow", "7827.2");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "7,827.20 of 20,127.08 repaid, 39 percent: 6,530.96 principal, 1,296.24 interest. 14 of 36 instalments made, next due 12 Dec",
    );
    await expect(stage.getByText("Due 12 Dec")).toBeVisible();
    // The arc is seeded at its shares, so the centre reads the paid figure
    // at once rather than sweeping up from nothing.
    await expect(stage.getByText("7,827.20", { exact: true })).toBeVisible();
    await expect(stage.getByText("559.09", { exact: true })).toBeVisible();
    await expect(reset).toBeDisabled();

    // The next instalment lands: the meter and the demo's line move at once,
    // the counted figures settle, and the date swaps only when they have.
    await pay.click();
    await expect(status).toContainText(
      "15 of 36 paid | principal 7,019.32 · interest 1,366.97 | next 12 Jan",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "8386.29");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "8,386.29 of 20,127.08 repaid, 42 percent: 7,019.32 principal, 1,366.97 interest. 15 of 36 instalments made, next due 12 Jan",
    );
    await expect(stage.getByText("Due 12 Jan")).toBeVisible({ timeout: 5000 });
    await expect(stage.getByText("Due 12 Dec")).toHaveCount(0);
    await expect(stage.getByText("8,386.29", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(stage.getByText("7,019.32", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(stage.getByText("1,366.97", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(reset).toBeEnabled();

    await pay.click();
    await expect(status).toContainText(
      "16 of 36 paid | principal 7,510.69 · interest 1,434.68 | next 12 Feb",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "8945.37");
    await expect(stage.getByText("Due 12 Feb")).toBeVisible({ timeout: 5000 });
    await expect(stage.getByText("Due 12 Jan")).toHaveCount(0);

    // Reset retracts the fill to the opening fourteen, date and all.
    await reset.click();
    await expect(status).toContainText(
      "14 of 36 paid | principal 6,530.96 · interest 1,296.24 | next 12 Dec",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "7827.2");
    await expect(stage.getByText("Due 12 Dec")).toBeVisible({ timeout: 5000 });
    await expect(stage.getByText("7,827.20", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(reset).toBeDisabled();
    await expect(pay).toBeEnabled();
  });

  test("credit-dial: the needle sweeps up on mount, each reading settles into its band with its move announced once, and Reset drops the chip", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/credit-dial");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Basin score" });
    const next = stage.getByRole("button", { name: "Next reading" });
    const reset = stage.getByRole("button", { name: "Reset" });

    // The meter reports the score at once; the band, the chip and the demo's
    // line wait for the needle to land.
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "1000");
    await expect(meter).toHaveAttribute("aria-valuenow", "612");
    await expect(meter).toHaveAttribute("aria-valuetext", "612 of 1000, Good");
    await expect(status).toContainText("612 · Good", { timeout: 5000 });
    await expect(status).not.toContainText("sweeping");
    await expect(announced).toHaveText("612 of 1000, Good");
    await expect(stage.getByText("Good", { exact: true })).toBeVisible();
    await expect(stage.getByText("612", { exact: true })).toBeVisible();
    await expect(reset).toBeDisabled();

    // A higher reading: the chip carries its sign in text, the status the word.
    await next.click();
    await expect(meter).toHaveAttribute("aria-valuenow", "668");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "668 of 1000, Good, up 56 since the last reading",
    );
    await expect(status).toContainText("668 · Good | up 56", { timeout: 5000 });
    await expect(announced).toHaveText(
      "668 of 1000, Good, up 56 since the last reading",
    );
    await expect(stage.getByText("+56", { exact: true })).toBeVisible();
    await expect(stage.getByText("668", { exact: true })).toBeVisible();
    await expect(reset).toBeEnabled();

    // A fall gets the same physics and the same words in the other direction.
    await next.click();
    await expect(meter).toHaveAttribute("aria-valuenow", "655");
    await expect(status).toContainText("655 · Good | down 13", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "655 of 1000, Good, down 13 since the last reading",
    );
    await expect(stage.getByText("−13", { exact: true })).toBeVisible();
    await expect(stage.getByText("+56", { exact: true })).toHaveCount(0);
    await expect(stage.getByText("655", { exact: true })).toBeVisible();

    // Reset is the first reading again, with nothing to compare it to.
    await reset.click();
    await expect(meter).toHaveAttribute("aria-valuenow", "612");
    await expect(meter).toHaveAttribute("aria-valuetext", "612 of 1000, Good");
    await expect(status).toContainText("612 · Good", { timeout: 5000 });
    await expect(status).not.toContainText("down");
    await expect(announced).toHaveText("612 of 1000, Good");
    await expect(stage.getByText("−13", { exact: true })).toHaveCount(0);
    await expect(next).toBeEnabled();
    await expect(reset).toBeDisabled();
  });

  test("limit-raise: keys step the ask, a request goes under review and is approved into a higher limit, a bigger ask is declined, and Reset returns", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/limit-raise");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Basin card" });
    const ask = stage.getByRole("spinbutton", { name: "Raise to" });
    const lower = stage.getByRole("button", { name: "Lower the ask" });
    const raise = stage.getByRole("button", { name: "Raise the ask" });
    const request = stage.getByRole("button", { name: /^Request(ed)?$/ });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toContainText(
      "1,260.00 available of 4,000.00 | asking 4,500.00",
    );
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "4000");
    await expect(meter).toHaveAttribute("aria-valuenow", "2740");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2,740.00 of 4,000.00 used, 1,260.00 available",
    );
    await expect(ask).toHaveAttribute("aria-valuemin", "4500");
    await expect(ask).toHaveAttribute("aria-valuemax", "10000");
    await expect(ask).toHaveAttribute("aria-valuenow", "4500");
    await expect(ask).toHaveAttribute("aria-valuetext", "4,500.00");
    await expect(lower).toBeDisabled();
    await expect(reset).toBeDisabled();
    await expect(announced).toBeEmpty();

    // Arrows step, Page keys move five, the ends clamp.
    await ask.focus();
    await page.keyboard.press("ArrowUp");
    await expect(ask).toHaveAttribute("aria-valuenow", "5000");
    await expect(status).toContainText("asking 5,000.00");
    await expect(lower).toBeEnabled();
    await page.keyboard.press("PageUp");
    await expect(ask).toHaveAttribute("aria-valuenow", "7500");
    await page.keyboard.press("End");
    await expect(ask).toHaveAttribute("aria-valuenow", "10000");
    await expect(raise).toBeDisabled();
    await page.keyboard.press("ArrowUp");
    await expect(ask).toHaveAttribute("aria-valuenow", "10000");
    await page.keyboard.press("Home");
    await expect(ask).toHaveAttribute("aria-valuenow", "4500");
    await expect(lower).toBeDisabled();

    // The + button is the same step; three presses ask for 6,000.
    await raise.click();
    await raise.click();
    await raise.click();
    await expect(ask).toHaveAttribute("aria-valuetext", "6,000.00");
    await expect(status).toContainText(
      "1,260.00 available of 4,000.00 | asking 6,000.00",
    );

    // Requesting freezes the stepper and says so in words.
    await request.click();
    await expect(status).toContainText("under review · 6,000.00");
    await expect(request).toHaveText("Requested");
    await expect(request).toBeDisabled();
    await expect(ask).toHaveAttribute("aria-disabled", "true");
    await expect(announced).toHaveText("raise to 6,000.00 under review");
    await expect(
      stage.getByText("Under review", { exact: true }),
    ).toBeVisible();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2,740.00 of 4,000.00 used, 1,260.00 available, raise to 6,000.00 under review",
    );

    // The issuer approves after its beat: the limit is the ask, the ask
    // starts again one step above it, and the chip lands.
    await expect(status).toContainText("approved · limit 6,000.00", {
      timeout: 6000,
    });
    await expect(meter).toHaveAttribute("aria-valuemax", "6000");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2,740.00 of 6,000.00 used, 3,260.00 available, raise approved",
    );
    await expect(announced).toHaveText("raise approved");
    await expect(stage.getByText("Approved", { exact: true })).toBeVisible();
    await expect(ask).toHaveAttribute("aria-valuemin", "6500");
    await expect(ask).toHaveAttribute("aria-valuenow", "6500");
    await expect(request).toHaveText("Request");
    await expect(request).toBeEnabled();
    await expect(stage.getByText("6,000.00", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(reset).toBeEnabled();

    // A new ask is a new question — the verdict clears — and one past the
    // issuer's rule is declined, in words and in the meter.
    await ask.focus();
    await page.keyboard.press("PageUp");
    await expect(ask).toHaveAttribute("aria-valuenow", "9000");
    await expect(status).toContainText(
      "3,260.00 available of 6,000.00 | asking 9,000.00",
    );
    await expect(announced).toBeEmpty();
    await expect(stage.getByText("Approved", { exact: true })).toHaveCount(0);
    await request.click();
    await expect(status).toContainText("under review · 9,000.00");
    await expect(status).toContainText("declined · 9,000.00", {
      timeout: 6000,
    });
    await expect(announced).toHaveText("raise to 9,000.00 declined");
    await expect(stage.getByText("Declined", { exact: true })).toBeVisible();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2,740.00 of 6,000.00 used, 3,260.00 available, raise to 9,000.00 declined",
    );
    await expect(meter).toHaveAttribute("aria-valuemax", "6000");
    await expect(request).toBeEnabled();

    await reset.click();
    await expect(status).toContainText(
      "1,260.00 available of 4,000.00 | asking 4,500.00",
    );
    await expect(meter).toHaveAttribute("aria-valuemax", "4000");
    await expect(ask).toHaveAttribute("aria-valuenow", "4500");
    await expect(announced).toBeEmpty();
    await expect(stage.getByText("Declined", { exact: true })).toHaveCount(0);
    await expect(reset).toBeDisabled();
  });

  test("apr-compare: Space picks a card, arrows move the pick without wrapping, the amount re-costs both, and fresh quotes move the lower-cost tag", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/apr-compare");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const group = stage.getByRole("radiogroup", { name: "Fieldline Loans" });
    const coldbrook = group.getByRole("radio", { name: /^Coldbrook Bank/ });
    const waylight = group.getByRole("radio", { name: /^Waylight Pay/ });
    const five = stage.getByRole("button", { name: "5,000.00", exact: true });
    const ten = stage.getByRole("button", { name: "10,000.00", exact: true });

    // Each card reads itself once, in words; the cheaper one says so.
    await expect(status).toContainText("10,000.00 | nothing picked");
    await expect(coldbrook).toHaveAttribute("aria-checked", "false");
    await expect(waylight).toHaveAttribute("aria-checked", "false");
    await expect(coldbrook).toHaveAccessibleName(
      "Coldbrook Bank, 8.4 percent APR over 60 months, 204.68 a month, 12,281.02 total",
    );
    await expect(waylight).toHaveAccessibleName(
      "Waylight Pay, 9.9 percent APR over 48 months, 253.15 a month, 12,151.00 total, lower cost",
    );
    await expect(announced).toBeEmpty();
    await expect(stage.getByText("Lower cost")).toHaveCount(1);
    await expect(ten).toHaveAttribute("aria-pressed", "true");

    // Space picks the card under focus.
    await coldbrook.focus();
    await page.keyboard.press(" ");
    await expect(coldbrook).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "10,000.00 | Coldbrook Bank 8.4% · 204.68 / mo | costs 130.02 more",
    );
    await expect(announced).toHaveText(
      "Coldbrook Bank picked: 204.68 a month, 12,281.02 in total, 130.02 more than Waylight Pay",
    );

    // An arrow moves the pick with focus and does not wrap past the end.
    await page.keyboard.press("ArrowRight");
    await expect(waylight).toBeFocused();
    await expect(waylight).toHaveAttribute("aria-checked", "true");
    await expect(coldbrook).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText(
      "10,000.00 | Waylight Pay 9.9% · 253.15 / mo | saves 130.02",
    );
    await expect(announced).toHaveText(
      "Waylight Pay picked: 253.15 a month, 12,151.00 in total, 130.02 less than Coldbrook Bank",
    );
    await page.keyboard.press("ArrowRight");
    await expect(waylight).toBeFocused();
    await expect(waylight).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Home");
    await expect(coldbrook).toBeFocused();
    await expect(coldbrook).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText(
      "Coldbrook Bank 8.4% · 204.68 / mo | costs 130.02 more",
    );

    // A smaller amount re-costs both cards against the same rates.
    await five.click();
    await expect(five).toHaveAttribute("aria-pressed", "true");
    await expect(ten).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText(
      "5,000.00 | Coldbrook Bank 8.4% · 102.34 / mo | costs 65.01 more",
    );
    await expect(coldbrook).toHaveAccessibleName(
      "Coldbrook Bank, 8.4 percent APR over 60 months, 102.34 a month, 6,140.51 total",
    );
    await expect(stage.getByText("Borrowing 5,000.00")).toBeVisible();

    // Fresh quotes turn the comparison over: the picked card is now the
    // cheaper one and the tag crosses to it.
    await stage.getByRole("button", { name: "New quotes" }).click();
    await expect(status).toContainText(
      "5,000.00 | Coldbrook Bank 7.9% · 101.14 / mo | saves 64.66",
    );
    await expect(coldbrook).toHaveAccessibleName(
      "Coldbrook Bank, 7.9 percent APR over 60 months, 101.14 a month, 6,068.57 total, lower cost",
    );
    await expect(waylight).toHaveAccessibleName(
      "Waylight Pay, 10.4 percent APR over 48 months, 127.78 a month, 6,133.23 total",
    );
    await expect(announced).toHaveText(
      "Coldbrook Bank picked: 101.14 a month, 6,068.57 in total, 64.66 less than Waylight Pay",
    );
    await expect(stage.getByText("Lower cost")).toHaveCount(1);
    await expect(coldbrook).toHaveAttribute("aria-checked", "true");
  });

  test("amortise-stack: arrows walk the periods, Page keys move a year, the ends clamp, and a click reads the bar under it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/amortise-stack");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const slider = stage.getByRole("slider", { name: "Coldbrook Bank loan" });

    // Until the cursor moves the demo prints the loan, not a split; the
    // slider already reads the period it opened on.
    await expect(status).toHaveText("Period 12 of 36 · $12,000.00 at 7.9%");
    await expect(slider).toHaveAttribute("aria-valuemin", "1");
    await expect(slider).toHaveAttribute("aria-valuemax", "36");
    await expect(slider).toHaveAttribute("aria-valuenow", "12");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Period 12 of 36: interest $56.81, principal $318.67, balance $8,310.51",
    );
    await expect(stage.getByText("$375.48 / mo")).toBeVisible();

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "13");
    await expect(status).toHaveText(
      "Period 13 of 36 · interest $54.71 · principal $320.77",
    );
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Period 13 of 36: interest $54.71, principal $320.77, balance $7,989.74",
    );

    // A Page key is a year on; the interest share has fallen by then.
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "25");
    await expect(status).toHaveText(
      "Period 25 of 36 · interest $28.43 · principal $347.05",
    );

    // End is the last payment, which clears the balance; nothing steps past.
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "36");
    await expect(status).toHaveText(
      "Period 36 of 36 · interest $2.46 · principal $373.03",
    );
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Period 36 of 36: interest $2.46, principal $373.03, balance $0.00",
    );
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "36");
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "36");

    // Home is the first payment, where interest is at its heaviest.
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await expect(status).toHaveText(
      "Period 1 of 36 · interest $79.00 · principal $296.48",
    );
    await page.keyboard.press("PageDown");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "13");

    // A click reads the bar under it: the nineteenth bar's middle is 18.5
    // thirty-sixths of the way across.
    const box = await slider.boundingBox();
    if (!box) throw new Error("the chart has no box to click");
    await slider.click({
      position: { x: (box.width * 18.5) / 36, y: box.height / 2 },
    });
    await expect(slider).toHaveAttribute("aria-valuenow", "19");
    await expect(status).toHaveText(
      "Period 19 of 36 · interest $41.83 · principal $333.65",
    );
    await expect(
      stage.getByText("Period 19 of 36", { exact: true }),
    ).toBeVisible();
    await expect(slider).toBeFocused();
  });

  test("overdraft-line: Next day draws the line on, keys scrub the days, below zero turns the reading and accrues the fee, a click lands on its day, and Reset retracts", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/overdraft-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slider = stage.getByRole("slider", {
      name: "Waylight Pay · Everyday",
    });
    const nextDay = stage.getByRole("button", { name: "Next day" });
    const reset = stage.getByRole("button", { name: "Reset" });

    await expect(status).toHaveText(
      "Day 1 of 14 · balance $412.20 · fee $0.00",
    );
    await expect(slider).toHaveAttribute("aria-valuemin", "1");
    await expect(slider).toHaveAttribute("aria-valuemax", "14");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Day 1 of 14: balance $412.20, fee accrued $0.00",
    );
    await expect(announced).toBeEmpty();
    await expect(reset).toBeDisabled();
    await expect(stage.getByText("Limit -$500.00")).toBeVisible();

    await nextDay.click();
    await expect(slider).toHaveAttribute("aria-valuenow", "2");
    await expect(status).toHaveText(
      "Day 2 of 14 · balance $318.65 · fee $0.00",
    );
    await expect(reset).toBeEnabled();

    // Three days on the balance dips below zero: the reading says so once,
    // and the fee starts to accrue on the overdrawn amount.
    await slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(slider).toHaveAttribute("aria-valuenow", "5");
    await expect(status).toHaveText(
      "Day 5 of 14 · balance -$52.30 · fee $0.03",
    );
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Day 5 of 14: balance -$52.30, overdrawn by $52.30, fee accrued $0.03",
    );
    await expect(announced).toHaveText("Below zero");
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(slider).toHaveAttribute("aria-valuenow", "8");
    await expect(status).toHaveText(
      "Day 8 of 14 · balance -$212.40 · fee $0.32",
    );

    // Pay lands: the balance climbs out, the fee stops growing, and the
    // crossing is no longer announced. End is the last day; nothing past it.
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "14");
    await expect(status).toHaveText(
      "Day 14 of 14 · balance $910.15 · fee $0.65",
    );
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "Day 14 of 14: balance $910.15, fee accrued $0.65",
    );
    await expect(announced).toBeEmpty();
    await expect(nextDay).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "14");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");

    // A click three-tenths of the way across is nearest the fifth day.
    const box = await slider.boundingBox();
    if (!box) throw new Error("the chart has no box to click");
    await slider.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
    await expect(slider).toHaveAttribute("aria-valuenow", "5");
    await expect(status).toHaveText(
      "Day 5 of 14 · balance -$52.30 · fee $0.03",
    );
    await expect(announced).toHaveText("Below zero");

    await reset.click();
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await expect(status).toHaveText(
      "Day 1 of 14 · balance $412.20 · fee $0.00",
    );
    await expect(announced).toBeEmpty();
    await expect(reset).toBeDisabled();
  });

  test("paydown-plan: an arrow switches the order and the rows re-rank, the range moves the extra and the debt-free date with it, and Space picks", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/paydown-plan");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const order = stage.getByRole("radiogroup", { name: "Order" });
    const smallest = order.getByRole("radio", { name: "Smallest first" });
    const rate = order.getByRole("radio", { name: "Highest rate first" });
    const extra = stage.getByLabel("Extra each month");
    const list = stage.getByRole("list", { name: "Paydown plan" });
    const rows = list.getByRole("listitem");

    await expect(status).toHaveText(
      "Highest rate first · extra $150 · debt-free Sep 2028",
    );
    await expect(rate).toHaveAttribute("aria-checked", "true");
    await expect(smallest).toHaveAttribute("aria-checked", "false");
    await expect(extra).toHaveValue("150");
    await expect(stage.getByText("$150.00", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(3);
    // The rank is the DOM order, and each row carries its own clearing month.
    await expect(rows.nth(0)).toContainText("Fernworks card");
    await expect(rows.nth(0)).toContainText("Sep 2027");
    await expect(rows.nth(1)).toContainText("Waylight Pay line");
    await expect(rows.nth(1)).toContainText("Nov 2027");
    await expect(rows.nth(2)).toContainText("Coldbrook Bank loan");
    await expect(rows.nth(2)).toContainText("Sep 2028");
    await expect(announced).toHaveText(
      "Debt-free Sep 2028, 24 months, $926.28 interest",
    );

    // An arrow both moves and picks: smallest first puts the line at the
    // top, and the same date costs more interest.
    await rate.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(smallest).toBeFocused();
    await expect(smallest).toHaveAttribute("aria-checked", "true");
    await expect(rate).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText(
      "Smallest first · extra $150 · debt-free Sep 2028",
    );
    await expect(announced).toHaveText(
      "Debt-free Sep 2028, 24 months, $969.52 interest",
    );
    await expect(rows.nth(0)).toContainText("Waylight Pay line");
    await expect(rows.nth(0)).toContainText("Feb 2027");
    await expect(rows.nth(1)).toContainText("Fernworks card");
    await expect(rows.nth(1)).toContainText("Nov 2027");
    await expect(rows.nth(2)).toContainText("Coldbrook Bank loan");
    await expect(rows.nth(2)).toContainText("Sep 2028");
    await page.keyboard.press("ArrowLeft");
    await expect(smallest).toBeFocused();
    await expect(smallest).toHaveAttribute("aria-checked", "true");

    // The range is native: an arrow is one step of 25, End and Home the ends.
    await extra.focus();
    await page.keyboard.press("ArrowRight");
    await expect(extra).toHaveValue("175");
    await expect(status).toHaveText(
      "Smallest first · extra $175 · debt-free Jul 2028",
    );
    await expect(announced).toHaveText(
      "Debt-free Jul 2028, 22 months, $900.43 interest",
    );
    await expect(stage.getByText("$175.00", { exact: true })).toBeVisible();
    await page.keyboard.press("End");
    await expect(extra).toHaveValue("500");
    await expect(status).toHaveText(
      "Smallest first · extra $500 · debt-free Oct 2027",
    );
    await expect(rows.nth(0)).toContainText("Nov 2026");
    await expect(rows.nth(1)).toContainText("Mar 2027");
    await expect(rows.nth(2)).toContainText("Oct 2027");
    await page.keyboard.press("Home");
    await expect(extra).toHaveValue("0");
    await expect(status).toHaveText(
      "Smallest first · extra $0 · debt-free Jan 2030",
    );
    await expect(announced).toHaveText(
      "Debt-free Jan 2030, 40 months, $2,121.24 interest",
    );

    // Space picks the stop under focus, and the rows travel back.
    await rate.focus();
    await page.keyboard.press(" ");
    await expect(rate).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText(
      "Highest rate first · extra $0 · debt-free Jan 2030",
    );
    await expect(rows.nth(0)).toContainText("Fernworks card");
    await expect(rows.nth(0)).toContainText("Jan 2030");
    await expect(rows.nth(1)).toContainText("Waylight Pay line");
    await expect(rows.nth(1)).toContainText("Dec 2028");
    await expect(rows.nth(2)).toContainText("Coldbrook Bank loan");
    await expect(rows.nth(2)).toContainText("Nov 2029");
  });

  test("autopay-toggle: Space switches autopay on and slides the payment into its dated place, Enter takes it out again, and the switch says what on means", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/autopay-toggle");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const toggle = stage.getByRole("switch", { name: "Fernworks card" });
    const list = stage.getByRole("list", { name: "Upcoming" });
    const rows = list.getByRole("listitem");

    await expect(status).toHaveText("Autopay off · pay by hand");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toHaveAccessibleDescription("Pay by hand");
    await expect(announced).toHaveText("Autopay off");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("3 Oct");
    await expect(rows.nth(0)).toContainText("Waylight Pay top-up");
    await expect(rows.nth(0)).toContainText("$50.00");
    await expect(rows.nth(1)).toContainText("22 Oct");
    await expect(rows.nth(1)).toContainText("Basinworks Freight invoice");
    await expect(rows.nth(1)).toContainText("$340.00");

    // Space switches it on: the payment takes its dated place between the
    // two others, and the description says what "on" means.
    await toggle.focus();
    await page.keyboard.press(" ");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Autopay on · next 15 Oct · $84.00");
    await expect(announced).toHaveText("Autopay on, next payment 15 Oct");
    await expect(toggle).toHaveAccessibleDescription("Pays $84.00 on 15 Oct");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("3 Oct");
    await expect(rows.nth(1)).toContainText("15 Oct");
    await expect(rows.nth(1)).toContainText("Fernworks card");
    await expect(rows.nth(1)).toContainText("auto");
    await expect(rows.nth(1)).toContainText("$84.00");
    await expect(rows.nth(2)).toContainText("22 Oct");

    // Enter switches it off: the row leaves and the list closes up.
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText("Autopay off · pay by hand");
    await expect(announced).toHaveText("Autopay off");
    await expect(rows).toHaveCount(2, { timeout: 5000 });
    await expect(list).not.toContainText("Fernworks card");
    await expect(toggle).toHaveAccessibleDescription("Pay by hand");

    // The pointer flips it the same way.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Fernworks card");
    await expect(status).toHaveText("Autopay on · next 15 Oct · $84.00");
  });

  test("grace-timer: Start drains the days, Pause holds them, Pay stops the drain and stamps the seal, Reset refills, and a run left alone warns and then expires", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/grace-timer");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Fernworks card" });
    const run = stage.getByRole("button", { name: /^(Start|Pause)$/ });
    const reset = stage.getByRole("button", { name: "Reset" });
    const pay = stage.getByRole("button", { name: /^(Pay \$412\.60|Paid)$/ });
    // The seal is decoration: its meaning is in the status line and the
    // button's replaced label, so it is found by its hidden text.
    const seal = stage
      .locator("[aria-hidden='true']")
      .filter({ hasText: /^Paid$/ });
    const daysLeft = async (): Promise<number> =>
      Number(await meter.getAttribute("aria-valuenow"));

    // Six of twenty-one days are already used; nothing drains until Start.
    await expect(status).toHaveText("Grace 15 days left · $412.60");
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "21");
    await expect(meter).toHaveAttribute("aria-valuenow", "15");
    await expect(meter).toHaveAttribute("aria-valuetext", "15 days left");
    await expect(run).toHaveText("Start");
    await expect(run).toHaveAttribute("aria-pressed", "false");
    await expect(pay).toHaveText("Pay $412.60");
    await expect(announced).toBeEmpty();
    await expect(seal).toHaveCount(0);
    await expect(stage.getByText("Statement $412.60")).toBeVisible();

    // At 0.7 s a day the first boundary is crossed within the second.
    await run.click();
    await expect(run).toHaveText("Pause");
    await expect(run).toHaveAttribute("aria-pressed", "true");
    await expect.poll(daysLeft, { timeout: 5000 }).toBeLessThan(15);

    // Pause holds the drain where it stands.
    await run.click();
    await expect(run).toHaveText("Start");
    await expect(run).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(200);
    const held = await daysLeft();
    expect(held).toBeLessThan(15);
    await page.waitForTimeout(800);
    await expect(meter).toHaveAttribute("aria-valuenow", String(held));
    await expect(status).toHaveText(`Grace ${held} days left · $412.60`);
    await expect(meter).toHaveAttribute("aria-valuetext", `${held} days left`);

    // Pay stops it for good: the seal stamps, the buttons close, the count
    // it stopped at is the count it reports.
    await pay.click();
    await expect(status).toHaveText(`Paid · stopped at ${held} days`);
    await expect(meter).toHaveAttribute("aria-valuenow", String(held));
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      `Paid with ${held} days left`,
    );
    await expect(announced).toHaveText(
      `Paid. Grace period stopped with ${held} days left.`,
    );
    await expect(pay).toHaveText("Paid");
    await expect(pay).toBeDisabled();
    await expect(run).toBeDisabled();
    await expect(seal).toBeVisible();

    // Reset refills the bar and lifts the seal.
    await reset.click();
    await expect(status).toHaveText("Grace 15 days left · $412.60");
    await expect(meter).toHaveAttribute("aria-valuenow", "15");
    await expect(seal).toHaveCount(0);
    await expect(pay).toHaveText("Pay $412.60");
    await expect(pay).toBeEnabled();
    await expect(run).toBeEnabled();
    await expect(announced).toBeEmpty();

    // Left running, the last five days are announced once, and at zero the
    // bar is empty, interest applies, and nothing can be paid or started.
    await run.click();
    await expect(announced).toHaveText("Last 5 days of the grace period.", {
      timeout: 15000,
    });
    await expect.poll(daysLeft, { timeout: 5000 }).toBeLessThanOrEqual(5);
    await expect(status).toHaveText("Expired · interest applies", {
      timeout: 10000,
    });
    await expect(meter).toHaveAttribute("aria-valuenow", "0");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "Grace period over, interest applies",
    );
    await expect(announced).toHaveText(
      "Grace period over. Interest now applies.",
    );
    await expect(pay).toBeDisabled();
    await expect(run).toHaveText("Start");
    await expect(run).toBeDisabled();
    await expect(
      stage.getByText("Interest now applies", { exact: true }),
    ).toBeVisible();
    await expect(reset).toBeEnabled();
  });
});

/**
 * The savings family puts money away, so its outcomes are the figure a coin
 * landed on, the cell a week lit, the month a marker parked at. Every test
 * drives the mechanic the component advertises — through the keyboard where
 * it publishes one — and reads the result off the demo's status line, the
 * ARIA the component publishes about itself, and the sentence it announces
 * when a coin, a pill or a chip actually arrives rather than when it left.
 */
test.describe("savings", () => {
  test("goal-pot: a quick-add drops a coin the level and the tag wait for, the goal is reached on the landing, and a reset drains the pot without one", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/goal-pot");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Camera body" });
    const add20 = stage.getByRole("button", { name: "Add $20.00" });
    const add50 = stage.getByRole("button", { name: "Add $50.00" });
    const add100 = stage.getByRole("button", { name: "Add $100.00" });
    // The tag is aria-hidden decoration beside the figure, and the quick-add
    // button prints the same "+$50.00", so the tag is found by its hiddenness.
    const tags = stage
      .locator("[aria-hidden='true']")
      .filter({ hasText: /^\+\$\d+\.\d\d$/ });
    const tag50 = tags.filter({ hasText: /^\+\$50\.00$/ });

    await expect(status).toHaveText(
      "Saved $640.00 of $1,200.00 · $560.00 to go",
    );
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "1200");
    await expect(meter).toHaveAttribute("aria-valuenow", "640");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$640.00 of $1,200.00 saved, $560.00 to go",
    );
    await expect(
      stage.getByText("$560.00 to go", { exact: true }),
    ).toBeVisible();
    await expect(announced).toBeEmpty();
    await expect(tags).toHaveCount(0);

    // Enter presses the quick-add: the meter and the announcement move from
    // the press, the tag only once the coin has landed on the surface.
    await add50.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Added $50.00 · $690.00 of $1,200.00");
    await expect(announced).toHaveText(
      "Added $50.00. $690.00 of $1,200.00 saved.",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "690");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$690.00 of $1,200.00 saved, $510.00 to go",
    );
    await expect(tag50).toBeVisible({ timeout: 5000 });
    await expect(
      stage.getByText("$510.00 to go", { exact: true }),
    ).toBeVisible();
    await expect(add50).toBeFocused();

    // Five hundreds stop ten short; each coin lands and the sentence follows.
    for (let press = 0; press < 5; press += 1) await add100.click();
    await expect(status).toHaveText("Added $100.00 · $1,190.00 of $1,200.00");
    await expect(meter).toHaveAttribute("aria-valuenow", "1190");
    await expect(stage.getByText("$10.00 to go", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Space on the twenty crosses the goal: the meter clamps to it, the
    // sentence turns, and the landing says so after the press did.
    await add20.focus();
    await page.keyboard.press(" ");
    await expect(status).toHaveText("Goal reached · $1,210.00 saved");
    await expect(meter).toHaveAttribute("aria-valuenow", "1200");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "Goal reached, $1,210.00 saved",
    );
    await expect(announced).toHaveText("Goal reached. $1,210.00 saved.", {
      timeout: 5000,
    });
    await expect(
      stage.getByText("Goal reached", { exact: true }),
    ).toBeVisible();

    // A withdrawal has no coin: the level drops at once and the tag leaves.
    await stage.getByRole("button", { name: "Reset pot" }).click();
    await expect(status).toHaveText(
      "Saved $640.00 of $1,200.00 · $560.00 to go",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "640");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$640.00 of $1,200.00 saved, $560.00 to go",
    );
    await expect(
      stage.getByText("$560.00 to go", { exact: true }),
    ).toBeVisible();
    await expect(tags).toHaveCount(0);
  });

  test("round-up: a new purchase lifts its change into the figure, a whole amount stays on the card, and the switch pauses the flight until it is back on", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/round-up");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const toggle = stage.getByRole("switch", { name: "Round up" });
    const figure = stage.getByRole("group", { name: "Round-ups" });
    const next = stage.getByRole("button", { name: "Next purchase" });
    const card = (merchant: string) =>
      stage.getByRole("region", { name: merchant });

    await expect(status).toHaveText("Round-ups $14.20");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(card("Coldbrook Coffee")).toContainText("$4.35");
    await expect(stage.getByText("$0.65 spare", { exact: true })).toBeVisible();
    await expect(figure).toContainText("$14.20");
    await expect(announced).toBeEmpty();

    // The next purchase's change flies; the total moves when it lands.
    await next.click();
    await expect(card("Fernworks Transit")).toContainText("$2.60");
    await expect(status).toHaveText("Round-ups $14.60 · last +$0.40", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Rounded up $0.40 from Fernworks Transit. Round-ups $14.60.",
    );
    await expect(figure).toContainText("$14.60");
    await expect(stage.getByText("$0.40 saved", { exact: true })).toBeVisible();
    await expect(stage.getByText("+$0.40", { exact: true })).toBeVisible();

    await next.click();
    await expect(card("Basin Grocers")).toContainText("$23.12");
    await expect(status).toHaveText("Round-ups $15.48 · last +$0.88", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Rounded up $0.88 from Basin Grocers. Round-ups $15.48.",
    );

    // A whole amount has no change: the chip says so and nothing flies.
    await next.click();
    await expect(card("Gaugeworks Parking")).toContainText("$6.00");
    await expect(
      stage.getByText("already whole", { exact: true }),
    ).toBeVisible();
    await expect(status).toHaveText("Round-ups $15.48 · last +$0.88");
    await expect(figure).toContainText("$15.48");

    // Space pauses the switch: the next purchase lands, its change does not.
    await toggle.focus();
    await page.keyboard.press(" ");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText("Round-ups paused · $15.48");
    await expect(announced).toHaveText("Round-up paused.");
    await next.click();
    await expect(card("Fieldline Books")).toContainText("$18.49");
    await expect(
      stage.getByText("$0.51 not rounded", { exact: true }),
    ).toBeVisible();
    await expect(status).toHaveText("Round-ups paused · $15.48");
    await expect(figure).toContainText("$15.48");
    await expect(announced).toHaveText("Round-up paused.");

    // Enter switches it back on: the purchase already on the card is not
    // rounded after the fact, the one after it flies.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(announced).toHaveText("Round-up on.");
    await expect(status).toHaveText("Round-ups $15.48 · last +$0.88");
    await expect(stage.getByText("$0.51 spare", { exact: true })).toBeVisible();
    await next.click();
    await expect(card("Waylight Fuel")).toContainText("$41.20");
    await expect(status).toHaveText("Round-ups $16.28 · last +$0.80", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Rounded up $0.80 from Waylight Fuel. Round-ups $16.28.",
    );
    await expect(figure).toContainText("$16.28");
  });

  test("interest-drip: Play counts the hours and drips the balance, Pause holds it and says so, the rate redraws the projection and the daily rate, and the figure raises its card on focus", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/interest-drip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const spoken = stage.locator("[aria-live='polite']").first();
    // The figure's name is its balance, which the first tick moves by a cent.
    const figure = stage.getByRole("button", { name: /^\$12,480\.\d\d$/ });
    const run = stage.getByRole("button", { name: /^(Play|Pause)$/ });
    const chart = stage.getByRole("img", { name: /^Projected / });
    const rateOf = (label: string) =>
      stage.getByRole("group", { name: "Rate" }).getByRole("button", {
        name: label,
      });
    const tipAt = (sentence: string) =>
      stage.getByText(sentence, { exact: true });

    await expect(status).toHaveText(
      "Day 0.00 · earned 0.0000 · 3.05% APY · paused",
    );
    await expect(run).toHaveText("Play");
    await expect(run).toHaveAttribute("aria-pressed", "false");
    await expect(figure).toHaveAccessibleName("$12,480.37");
    await expect(figure).toHaveAccessibleDescription(
      "$1.03 a day at 3.05% APY",
    );
    await expect(chart).toHaveAccessibleName(
      "Projected $12,861.02 after 365 days at 3.05% APY",
    );
    await expect(spoken).toBeEmpty();
    // The sentence exists once, as the description; the card is not up.
    await expect(tipAt("$1.03 a day at 3.05% APY")).toHaveCount(1);

    // Play: at 900 ms an hour, the first tick lands inside the second and
    // the count leaves zero with a fraction of a cent earned.
    await run.click();
    await expect(run).toHaveText("Pause");
    await expect(run).toHaveAttribute("aria-pressed", "true");
    await expect(status).toHaveText(
      /^Day 0\.(?!00)\d\d · earned 0\.(?!0000)\d{4} · 3\.05% APY$/,
      { timeout: 5000 },
    );

    // Pause holds the count where it stands and says so once.
    await run.click();
    await expect(run).toHaveText("Play");
    await expect(run).toHaveAttribute("aria-pressed", "false");
    await expect(status).toHaveText(/ · 3\.05% APY · paused$/);
    await expect(spoken).toHaveText(
      /^Paused\. Balance \$12,480\.\d\d, earned \$0\.\d\d over 0\.\d days\.$/,
    );
    const held = (await status.textContent()) ?? "";
    await page.waitForTimeout(1000);
    await expect(status).toHaveText(held);

    // The rate pair redraws the projection and the daily rate; the count
    // stays where the pause left it.
    await rateOf("4.10%").focus();
    await page.keyboard.press("Enter");
    await expect(rateOf("4.10%")).toHaveAttribute("aria-pressed", "true");
    await expect(rateOf("3.05%")).toHaveAttribute("aria-pressed", "false");
    await expect(status).toHaveText(/ · 4\.10% APY · paused$/);
    await expect(chart).toHaveAccessibleName(
      "Projected $12,992.07 after 365 days at 4.10% APY",
    );
    await expect(figure).toHaveAccessibleDescription(
      "$1.37 a day at 4.10% APY",
    );

    // Focus raises the rate card beside the description, Enter pins it,
    // Escape lets go of the pin, and leaving takes the card down.
    const tip = tipAt("$1.37 a day at 4.10% APY");
    await expect(tip).toHaveCount(1);
    await figure.focus();
    await expect(tip).toHaveCount(2);
    await expect(figure).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Enter");
    await expect(figure).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(figure).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Tab");
    await expect(figure).not.toBeFocused();
    await expect(tip).toHaveCount(1, { timeout: 5000 });
  });

  test("goal-timeline: arrows, page keys and the ends move the contribution and the marker's month with it, the floor parks it past the horizon, and a press on the track jumps", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/goal-timeline");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const slider = stage.getByRole("slider", { name: "House deposit" });
    const timeline = stage.getByRole("img");

    await expect(status).toHaveText("$400 a month · 29 months · Feb 2029");
    await expect(slider).toHaveAttribute("aria-valuemin", "50");
    await expect(slider).toHaveAttribute("aria-valuemax", "1000");
    await expect(slider).toHaveAttribute("aria-valuenow", "400");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "$400 a month, 29 months",
    );
    await expect(timeline).toHaveAccessibleName(
      "Goal reached in 29 months, Feb 2029",
    );
    await expect(stage.getByText("Feb 2029", { exact: true })).toBeVisible();
    await expect(stage.getByText("29 months", { exact: true })).toBeVisible();
    await expect(announced).toBeEmpty();

    // One step earlier by a month; the release announces where it settled.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "425");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "$425 a month, 28 months",
    );
    await expect(status).toHaveText("$425 a month · 28 months · Jan 2029");
    await expect(announced).toHaveText(
      "$425 a month. Goal reached in 28 months, Jan 2029.",
    );
    await expect(stage.getByText("Jan 2029", { exact: true })).toBeVisible();

    // Ten steps at once.
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveAttribute("aria-valuenow", "675");
    await expect(status).toHaveText("$675 a month · 18 months · Mar 2028");
    await expect(timeline).toHaveAccessibleName(
      "Goal reached in 18 months, Mar 2028",
    );

    // End is the ceiling, and the slider does not run past it.
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "1000");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "$1,000 a month, 12 months",
    );
    await expect(status).toHaveText("$1,000 a month · 12 months · Sep 2027");
    await expect(announced).toHaveText(
      "$1,000 a month. Goal reached in 12 months, Sep 2027.",
    );
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1000");

    // Home is the floor, which is past the horizon: the marker parks at the
    // end and the flag reads "after".
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "50");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      "$50 a month, beyond 36 months",
    );
    await expect(status).toHaveText("$50 a month · beyond 36 months");
    await expect(timeline).toHaveAccessibleName(
      "Not within 36 months at this rate",
    );
    await expect(announced).toHaveText(
      "$50 a month. Not within 36 months at this rate.",
    );
    await expect(
      stage.getByText("after Sep 2029", { exact: true }),
    ).toBeVisible();
    await expect(
      stage.getByText("Beyond 36 months", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("PageDown");
    await expect(slider).toHaveAttribute("aria-valuenow", "50");

    // A press on the track jumps to the value under it, focuses the thumb,
    // and settles there. It lands last so nothing is measured after it.
    const track = slider.locator("..");
    await track.click();
    await expect(slider).toHaveAttribute("aria-valuenow", "525");
    await expect(status).toHaveText("$525 a month · 23 months · Aug 2028");
    await expect(announced).toHaveText(
      "$525 a month. Goal reached in 23 months, Aug 2028.",
    );
    // The press hands focus to the thumb so the arrows can take over from
    // where the pointer left off — that is what the component's own
    // pointerdown asks for, and what a slider owes a hand that just used it.
    await expect(slider).toBeFocused();
  });

  test("pot-shuffle: Enter lifts a coin, arrows carry it along the row, Space drops it and both figures move, Escape walks it home, and two presses move it by pointer", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/pot-shuffle");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const row = stage.getByRole("list", { name: "Fernworks savings" });
    // A pot's name carries its balance, so each is read by its name alone.
    const pot = (name: string) =>
      row.getByRole("button", { name: new RegExp(`^${name}, `) });
    const holiday = pot("Holiday");
    const rainy = pot("Rainy day");
    const bike = pot("New bike");
    const gifts = pot("Gifts");

    await expect(status).toHaveText("4 pots · $2,540 total");
    await expect(row.getByRole("button")).toHaveCount(4);
    await expect(holiday).toHaveAccessibleName("Holiday, $1,240");
    await expect(bike).toHaveAccessibleName("New bike, $360");
    await expect(holiday).toHaveAttribute("aria-pressed", "false");
    await expect(holiday).toHaveAccessibleDescription(
      "Drag a pot onto another, or press one, to move $50.",
    );
    await expect(stage.getByText("$2,540 across 4")).toBeVisible();
    await expect(announced).toBeEmpty();

    // Enter lifts; the row walks under the coin; Space drops it two pots
    // along, and the figures move only when the coin has dropped in.
    await holiday.focus();
    await page.keyboard.press("Enter");
    await expect(holiday).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText(
      "Lifted $50 from Holiday. Choose a pot.",
    );
    await expect(holiday).toHaveAccessibleDescription(
      "Holding $50 — drop it on another pot, or press Escape.",
    );
    await page.keyboard.press("ArrowRight");
    await expect(rainy).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(bike).toBeFocused();
    await page.keyboard.press(" ");
    await expect(status).toHaveText("moved $50 · Holiday → New bike", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Moved $50 from Holiday to New bike. Holiday $1,190, New bike $410.",
    );
    await expect(holiday).toHaveAccessibleName("Holiday, $1,190");
    await expect(bike).toHaveAccessibleName("New bike, $410");
    await expect(holiday).toHaveAttribute("aria-pressed", "false");
    await expect(stage.getByText("$2,540 across 4")).toBeVisible();
    await expect(bike).toHaveAccessibleDescription(
      "Drag a pot onto another, or press one, to move $50.",
    );

    // Escape puts a lifted coin back and nothing moves.
    await page.keyboard.press(" ");
    await expect(bike).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText(
      "Lifted $50 from New bike. Choose a pot.",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(rainy).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(announced).toHaveText("Move cancelled.");
    await expect(bike).toHaveAttribute("aria-pressed", "false", {
      timeout: 5000,
    });
    await expect(status).toHaveText("moved $50 · Holiday → New bike");
    await expect(bike).toHaveAccessibleName("New bike, $410");
    await expect(rainy).toHaveAccessibleName("Rainy day, $800");

    // Two presses do the same by pointer: the first lifts, the second drops.
    await gifts.click();
    await expect(gifts).toHaveAttribute("aria-pressed", "true");
    await expect(announced).toHaveText("Lifted $50 from Gifts. Choose a pot.");
    await rainy.click();
    await expect(status).toHaveText("moved $50 · Gifts → Rainy day", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Moved $50 from Gifts to Rainy day. Gifts $90, Rainy day $850.",
    );
    await expect(gifts).toHaveAccessibleName("Gifts, $90");
    await expect(rainy).toHaveAccessibleName("Rainy day, $850");

    await stage.getByRole("button", { name: "Reset pots" }).click();
    await expect(status).toHaveText("4 pots · $2,540 total");
    await expect(holiday).toHaveAccessibleName("Holiday, $1,240");
    await expect(rainy).toHaveAccessibleName("Rainy day, $800");
    await expect(bike).toHaveAccessibleName("New bike, $360");
    await expect(gifts).toHaveAccessibleName("Gifts, $140");
  });

  test("streak-saver: Enter lights this week and rolls the run, the calendar carries the row left, a week left open ends the run, and the next save starts one", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/streak-saver");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const cells = stage
      .getByRole("list", { name: "Rainy day" })
      .getByRole("listitem");
    const save = stage.getByRole("button", {
      name: /^(Save \$25\.00 for this week|Saved this week)$/,
    });
    const nextWeek = stage.getByRole("button", { name: "Next week" });

    await expect(status).toHaveText(
      "6 in a row · This week open · $225.00 put away",
    );
    await expect(announced).toHaveText(
      "6 weeks in a row, this week not yet saved",
    );
    await expect(cells).toHaveCount(12);
    // Each cell reads as a sentence, oldest first, the open week last.
    await expect(cells.first()).toHaveText("Week of Jun 15, saved");
    await expect(cells.nth(4)).toHaveText("Week of Jul 13, missed");
    await expect(cells.last()).toHaveText(
      "Week of Aug 31, this week, not yet saved",
    );
    await expect(save).toHaveAccessibleName("Save $25.00 for this week");
    await expect(save).not.toHaveAttribute("aria-disabled");
    await expect(stage.getByText("Best 6 · $225.00 put away")).toBeVisible();
    await expect(stage.getByText("Save to keep the run")).toBeVisible();

    // Enter saves this week: the cell lights, the run rolls to seven, and
    // the button turns aria-disabled under the focus it keeps.
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText(
      "7 in a row · This week saved · $250.00 put away",
    );
    await expect(announced).toHaveText("7 weeks in a row, this week saved");
    await expect(cells.last()).toHaveText("Week of Aug 31, saved");
    await expect(save).toHaveAccessibleName("Saved this week");
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).toBeFocused();
    await expect(stage.getByText("Best 7 · $250.00 put away")).toBeVisible();
    await expect(stage.getByText("Next week keeps the run")).toBeVisible();
    // A second press saves nothing twice.
    await page.keyboard.press("Enter");
    await expect(status).toHaveText(
      "7 in a row · This week saved · $250.00 put away",
    );

    // Next week: the oldest cell leaves, a new open one arrives, and the run
    // holds because an open week is at risk, not broken.
    await nextWeek.click();
    await expect(cells).toHaveCount(12, { timeout: 5000 });
    await expect(cells.first()).toHaveText("Week of Jun 22, saved");
    await expect(cells.last()).toHaveText(
      "Week of Sep 7, this week, not yet saved",
    );
    await expect(status).toHaveText(
      "7 in a row · This week open · $225.00 put away",
    );
    await expect(announced).toHaveText(
      "7 weeks in a row, this week not yet saved",
    );
    await expect(save).toHaveAccessibleName("Save $25.00 for this week");
    await expect(save).not.toHaveAttribute("aria-disabled");

    // Left open across another week, that week is missed and the run ends.
    await nextWeek.click();
    await expect(cells).toHaveCount(12, { timeout: 5000 });
    await expect(cells.nth(10)).toHaveText("Week of Sep 7, missed");
    await expect(cells.last()).toHaveText(
      "Week of Sep 14, this week, not yet saved",
    );
    await expect(status).toHaveText(
      "Streak ended · 0 in a row · This week open · $200.00 put away",
    );
    await expect(announced).toHaveText(
      "0 weeks in a row, this week not yet saved",
    );
    await expect(stage.getByText("Best 7 · $200.00 put away")).toBeVisible();
    await expect(stage.getByText("Save to start a run")).toBeVisible();

    // A save starts a run of one, and the sentence knows it is singular.
    await save.click();
    await expect(status).toHaveText(
      "1 in a row · This week saved · $225.00 put away",
    );
    await expect(announced).toHaveText("1 week in a row, this week saved");
    await expect(cells.last()).toHaveText("Week of Sep 14, saved");

    await stage.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(status).toHaveText(
      "6 in a row · This week open · $225.00 put away",
    );
    await expect(cells).toHaveCount(12, { timeout: 5000 });
    await expect(cells.first()).toHaveText("Week of Jun 15, saved");
    await expect(cells.last()).toHaveText(
      "Week of Aug 31, this week, not yet saved",
    );
  });

  test("auto-sweep: Enter lifts the leftover out of spending, savings settles when the pill lands, the button empties, and a new month refills it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/auto-sweep");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const card = stage.getByRole("group", { name: "Month-end sweep" });
    const sweep = card.getByRole("button", {
      name: /^(Sweep \$[\d,.]+ into savings|Nothing to sweep)$/,
    });
    // The definition list: the spending figure, the floor, the savings
    // figure, and the note under it. Each figure reads as one sr-only string
    // ahead of its rolling columns.
    const figures = card.locator("dd");
    const spending = figures.nth(0);
    const savings = figures.nth(2);
    const note = figures.nth(3);

    await expect(status).toHaveText("Leftover $84.20 · Savings $3,410.00");
    await expect(sweep).toHaveAccessibleName("Sweep $84.20 into savings");
    await expect(sweep).not.toHaveAttribute("aria-disabled");
    await expect(spending).toContainText("$1,084.20");
    await expect(figures.nth(1)).toHaveText("Keep $1,000.00");
    await expect(savings).toContainText("$3,410.00");
    await expect(note).toHaveText("Leftover $84.20");
    await expect(card).toContainText("Month end · 30 Sep");
    await expect(card).toContainText("Above the floor, ready to go");
    await expect(announced).toBeEmpty();

    // Enter sweeps: spending empties from the press, and the demo's line
    // reads "Sweeping" until the pill lands, when it reads "Swept".
    await sweep.focus();
    await page.keyboard.press("Enter");
    await expect(spending).toContainText("$1,000.00");
    await expect(status).toHaveText(
      /^(Sweeping \$84\.20|Swept \$84\.20 · Savings \$3,494\.20)$/,
    );
    await expect(status).toHaveText("Swept $84.20 · Savings $3,494.20", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Swept $84.20 into savings. Savings $3,494.20.",
    );
    await expect(savings).toContainText("$3,494.20");
    await expect(note).toHaveText("Nothing left over");
    await expect(sweep).toHaveAccessibleName("Nothing to sweep");
    await expect(sweep).toHaveAttribute("aria-disabled", "true");
    await expect(sweep).toBeFocused();
    await expect(card).toContainText("Spending sits at the floor");
    // With nothing to sweep, a press is not a sweep.
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Swept $84.20 · Savings $3,494.20");

    // A new month pays in above the floor and the button fills again.
    await stage.getByRole("button", { name: "Next month" }).click();
    await expect(card).toContainText("Month end · 31 Oct");
    await expect(status).toHaveText("Leftover $132.60 · Savings $3,494.20");
    await expect(sweep).toHaveAccessibleName("Sweep $132.60 into savings");
    await expect(sweep).not.toHaveAttribute("aria-disabled");
    await expect(spending).toContainText("$1,132.60");
    await expect(note).toHaveText("Leftover $132.60");

    // The pointer sweeps the same way.
    await sweep.click();
    await expect(status).toHaveText("Swept $132.60 · Savings $3,626.80", {
      timeout: 5000,
    });
    await expect(announced).toHaveText(
      "Swept $132.60 into savings. Savings $3,626.80.",
    );
    await expect(spending).toContainText("$1,000.00");
    await expect(savings).toContainText("$3,626.80");

    // Reset lowers savings with nothing in the air, so the figure follows.
    await stage.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(status).toHaveText("Leftover $84.20 · Savings $3,410.00");
    await expect(sweep).toHaveAccessibleName("Sweep $84.20 into savings");
    await expect(card).toContainText("Month end · 30 Sep");
    await expect(spending).toContainText("$1,084.20");
    await expect(savings).toContainText("$3,410.00");
  });

  test("goal-card: Enter drops a coin the ring waits for, Details unfolds a measured panel that is inert while shut, the last press closes the ring, and a reset shrinks it without a coin", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/goal-card");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Winter tyres" });
    const add = stage.getByRole("button", {
      name: /^(Add \$30\.00|Goal reached)$/,
    });
    const details = stage.getByRole("button", { name: "Details" });
    // The panel is inert while closed, which keeps it out of role queries,
    // so it is found by its element and read by its attributes.
    const panel = stage.locator("section[aria-labelledby]");
    const rows = panel.locator("dd");
    // The fold is the clipped box two levels up whose height is animated.
    const fold = panel.locator("..").locator("..");
    const foldHeight = (): Promise<number> =>
      fold.evaluate((node) => node.getBoundingClientRect().height);

    await expect(status).toHaveText(
      "Saved $360.00 of $600.00 · 60% · Details closed",
    );
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", "600");
    await expect(meter).toHaveAttribute("aria-valuenow", "360");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$360.00 of $600.00 saved, 60 percent",
    );
    await expect(add).toHaveAccessibleName("Add $30.00");
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(details).toHaveAttribute(
      "aria-controls",
      (await panel.getAttribute("id")) ?? "",
    );
    await expect(panel).toHaveAttribute("inert", "");
    await expect.poll(foldHeight).toBe(0);
    await expect(stage.getByText("of $600.00 · $240.00 to go")).toBeVisible();
    await expect(announced).toBeEmpty();

    // Enter adds thirty: the announcement is from the press, the meter and
    // the header figure from the landing.
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Added $30.00 · 65% · Details closed");
    await expect(announced).toHaveText("Added $30.00. 65 percent saved.");
    await expect(meter).toHaveAttribute("aria-valuenow", "390", {
      timeout: 5000,
    });
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$390.00 of $600.00 saved, 65 percent",
    );
    await expect(stage.getByText("of $600.00 · $210.00 to go")).toBeVisible();
    await expect(add).toBeFocused();

    // Details unfolds to the panel's own measured height and lifts inert.
    await details.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(status).toHaveText("Added $30.00 · 65% · Details open");
    await expect(panel).not.toHaveAttribute("inert");
    await expect.poll(foldHeight, { timeout: 5000 }).toBeGreaterThan(40);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toHaveText("$600.00");
    await expect(rows.nth(1)).toHaveText("$390.00");
    await expect(rows.nth(2)).toHaveText("$210.00");
    await expect(rows.nth(3)).toHaveText("7 at $30.00 a week");
    await expect(panel).toContainText("By 30 Nov");

    // Seven more close the ring: the last press lands on the goal, the
    // button turns to "Goal reached" and the landing says so.
    for (let press = 0; press < 7; press += 1) await add.click();
    await expect(status).toHaveText("Goal reached · $600.00 saved");
    await expect(add).toHaveAccessibleName("Goal reached");
    await expect(add).toHaveAttribute("aria-disabled", "true");
    await expect(meter).toHaveAttribute("aria-valuenow", "600", {
      timeout: 5000,
    });
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "Goal reached, $600.00 saved",
    );
    await expect(announced).toHaveText("Goal reached.");
    await expect(rows.nth(1)).toHaveText("$600.00");
    await expect(rows.nth(2)).toHaveText("$0.00");
    await expect(rows.nth(3)).toHaveText("0 at $30.00 a week");
    await expect(stage.getByText("of $600.00 · reached")).toBeVisible();

    // Reset lowers the value: the ring shrinks at once, no coin, and the
    // panel folds back to nothing and goes inert.
    await stage.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(status).toHaveText(
      "Saved $360.00 of $600.00 · 60% · Details closed",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "360");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "$360.00 of $600.00 saved, 60 percent",
    );
    await expect(add).toHaveAccessibleName("Add $30.00");
    await expect(add).not.toHaveAttribute("aria-disabled");
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveAttribute("inert", "");
    await expect.poll(foldHeight, { timeout: 5000 }).toBe(0);
  });

  test("rate-ladder: arrows climb and descend the rungs and pick as they go, Home and End reach the ends, and every pick re-dates the maturity and re-prices the interest", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/rate-ladder");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component's own readout is a status line reading the same
    // sentence as the chosen rung, ahead of its rolling digits.
    const readout = stage.locator("[role='status']").first();
    const ladder = stage.getByRole("radiogroup", { name: "Term deposits" });
    const rung = (months: number) =>
      ladder.getByRole("radio", { name: new RegExp(`^${months} months, `) });

    await expect(status).toHaveText(
      "12 months · 4.30% · Matures Sep 8, 2027 · Earns $215.00",
    );
    await expect(readout).toContainText(
      "12 months, 4.30 percent, matures Sep 8, 2027, earns $215.00",
    );
    await expect(ladder.getByRole("radio")).toHaveCount(5);
    // The longest term is the top rung: the DOM order is the ladder's.
    await expect(ladder.getByRole("radio").first()).toHaveAccessibleName(
      /^36 months, /,
    );
    await expect(rung(12)).toHaveAttribute("aria-checked", "true");
    await expect(rung(12)).toHaveAccessibleName(
      "12 months, 4.30 percent, matures Sep 8, 2027",
    );
    await expect(stage.getByText("Sep 8, 2027", { exact: true })).toBeVisible();

    // Up is a longer term, and the arrow picks as it moves.
    await rung(12).focus();
    await page.keyboard.press("ArrowUp");
    await expect(rung(24)).toBeFocused();
    await expect(rung(24)).toHaveAttribute("aria-checked", "true");
    await expect(rung(12)).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText(
      "24 months · 4.55% · Matures Sep 8, 2028 · Earns $455.00",
    );
    await expect(readout).toContainText(
      "24 months, 4.55 percent, matures Sep 8, 2028, earns $455.00",
    );
    await expect(stage.getByText("Sep 8, 2028", { exact: true })).toBeVisible();

    // End is the top, and the ladder does not wrap past it.
    await page.keyboard.press("End");
    await expect(rung(36)).toBeFocused();
    await expect(rung(36)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText(
      "36 months · 4.70% · Matures Sep 8, 2029 · Earns $705.00",
    );
    await page.keyboard.press("ArrowRight");
    await expect(rung(36)).toBeFocused();
    await expect(rung(36)).toHaveAttribute("aria-checked", "true");

    // Home is the bottom, and Down does not fall off it.
    await page.keyboard.press("Home");
    await expect(rung(3)).toBeFocused();
    await expect(rung(3)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText(
      "3 months · 3.60% · Matures Dec 8, 2026 · Earns $45.00",
    );
    await expect(stage.getByText("Dec 8, 2026", { exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(rung(3)).toBeFocused();
    await expect(rung(3)).toHaveAttribute("aria-checked", "true");

    // Right is the same step as Up.
    await page.keyboard.press("ArrowRight");
    await expect(rung(6)).toBeFocused();
    await expect(rung(6)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText(
      "6 months · 3.95% · Matures Mar 8, 2027 · Earns $98.75",
    );
    await expect(readout).toContainText(
      "6 months, 3.95 percent, matures Mar 8, 2027, earns $98.75",
    );

    // The pointer picks a rung directly.
    await rung(12).click();
    await expect(rung(12)).toHaveAttribute("aria-checked", "true");
    await expect(rung(6)).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText(
      "12 months · 4.30% · Matures Sep 8, 2027 · Earns $215.00",
    );
  });

  test("nest-egg: arrows walk the rate chips and bend the curve under the cursor, the plot is a slider whose keys scrub the year, and a press reads the nearest year", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/nest-egg");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const settled = stage.locator("[role='status']").first();
    const chips = stage.getByRole("radiogroup", { name: "Annual rate" });
    const chip = (rate: number) =>
      chips.getByRole("radio", { name: `${rate}%`, exact: true });
    const plot = stage.getByRole("slider", { name: "Nest egg" });

    await expect(status).toHaveText("Year 20 · 5% · $88,988 · Growth $38,488");
    await expect(settled).toHaveText(
      "Year 20, $88,988, contributed $50,500, growth $38,488",
    );
    await expect(chips.getByRole("radio")).toHaveCount(4);
    await expect(chip(5)).toHaveAttribute("aria-checked", "true");
    await expect(plot).toHaveAttribute("aria-valuemin", "0");
    await expect(plot).toHaveAttribute("aria-valuemax", "30");
    await expect(plot).toHaveAttribute("aria-valuenow", "20");
    await expect(plot).toHaveAttribute(
      "aria-valuetext",
      "Year 20, $88,988, contributed $50,500, growth $38,488",
    );
    await expect(stage.getByText("Year 20", { exact: true })).toBeVisible();

    // An arrow both moves and picks a rate; the year under the cursor is
    // re-priced and the split with it.
    await chip(5).focus();
    await page.keyboard.press("ArrowRight");
    await expect(chip(7)).toBeFocused();
    await expect(chip(7)).toHaveAttribute("aria-checked", "true");
    await expect(chip(5)).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText("Year 20 · 7% · $114,282 · Growth $63,782");
    await expect(settled).toHaveText(
      "Year 20, $114,282, contributed $50,500, growth $63,782",
    );
    await expect(plot).toHaveAttribute(
      "aria-valuetext",
      "Year 20, $114,282, contributed $50,500, growth $63,782",
    );
    await page.keyboard.press("End");
    await expect(chip(9)).toBeFocused();
    await expect(chip(9)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Year 20 · 9% · $148,600 · Growth $98,100");
    await page.keyboard.press("ArrowRight");
    await expect(chip(9)).toBeFocused();
    await expect(chip(9)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Home");
    await expect(chip(3)).toBeFocused();
    await expect(chip(3)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Year 20 · 3% · $70,212 · Growth $19,712");
    await chip(5).click();
    await expect(chip(5)).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Year 20 · 5% · $88,988 · Growth $38,488");

    // The plot is a slider: an arrow is a year, a page key five, the ends
    // the ends, and the settled sentence follows every key.
    await plot.focus();
    await page.keyboard.press("ArrowRight");
    await expect(plot).toHaveAttribute("aria-valuenow", "21");
    await expect(status).toHaveText("Year 21 · 5% · $95,997 · Growth $43,097");
    await expect(settled).toHaveText(
      "Year 21, $95,997, contributed $52,900, growth $43,097",
    );
    await expect(stage.getByText("Year 21", { exact: true })).toBeVisible();
    await page.keyboard.press("PageUp");
    await expect(plot).toHaveAttribute("aria-valuenow", "26");
    await expect(status).toHaveText("Year 26 · 5% · $136,800 · Growth $71,900");
    await page.keyboard.press("End");
    await expect(plot).toHaveAttribute("aria-valuenow", "30");
    await expect(status).toHaveText(
      "Year 30 · 5% · $177,621 · Growth $103,121",
    );
    await page.keyboard.press("ArrowUp");
    await expect(plot).toHaveAttribute("aria-valuenow", "30");
    await page.keyboard.press("Home");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");
    await expect(status).toHaveText("Year 0 · 5% · $2,500 · Growth $0");
    await expect(settled).toHaveText(
      "Year 0, $2,500, contributed $2,500, growth $0",
    );
    await page.keyboard.press("PageDown");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");

    // A press on the plot's middle reads the nearest year, fifteen, and
    // focuses the slider. It lands last so nothing is measured after it.
    await plot.click();
    await expect(plot).toHaveAttribute("aria-valuenow", "15");
    await expect(status).toHaveText("Year 15 · 5% · $58,742 · Growth $20,242");
    await expect(settled).toHaveText(
      "Year 15, $58,742, contributed $38,500, growth $20,242",
    );
    await expect(plot).toBeFocused();
  });
});

/**
 * A phase that only lives for a beat — the "swinging" a dial reports between
 * a print and its settle — is not something a poll can prove it saw. The
 * trail is recorded in the page instead, by an observer installed before the
 * press, and read back once the reading has settled.
 */
const recordMarketsTrail = async (target: Locator): Promise<void> => {
  await target.evaluate((element) => {
    const trail: string[] = [];
    const read = () => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (trail[trail.length - 1] !== text) trail.push(text);
    };
    read();
    new MutationObserver(read).observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    (window as unknown as { __marketsTrail: string[] }).__marketsTrail = trail;
  });
};

/** Everything the recorded node has said so far, oldest first. */
const marketsTrailOf = (page: Page) => async (): Promise<string[]> =>
  page.evaluate(
    () =>
      (window as unknown as { __marketsTrail?: string[] }).__marketsTrail ?? [],
  );

/**
 * Where a turned element is pointing, in degrees, read off the transform its
 * motion value is driving. Folded into (-180, 180], the same fold the wheel
 * uses to take the shorter way round, so a target past a half turn compares.
 */
const marketsTurnOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    const matrix = new DOMMatrix(transform);
    return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  });

/** The same fold, applied to a target angle so both sides agree on the range. */
const foldTurn = (degrees: number): number =>
  (((degrees % 360) + 540) % 360) - 180;

/** A poll target: the opacity a tint or a trace has tweened to. */
const marketsOpacityOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => Number(getComputedStyle(element).opacity));

/** A poll target: the horizontal translate a tape is currently at. */
const marketsXOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    return new DOMMatrix(transform).e;
  });

/**
 * The markets family is a tape read ten ways: a board that re-seats its rows,
 * a line that grows, a star that lets a row go, a threshold a print crosses,
 * a grid that warms, a needle that swings, a wheel that finds its detent, a
 * clock that lands, headlines that pass, and two lines with a gap between
 * them. Every demo's tape is seeded, so each test drives the mechanic the
 * component advertises — through the keyboard wherever it publishes one —
 * parks anything that ticks before an exact reading, and reads the outcome
 * off the demo's status line and the ARIA the component publishes about
 * itself.
 */
test.describe("markets", () => {
  test("mover-list: a tick re-seats the rows that moved, and the radio pair turns the board over from the keyboard", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/mover-list");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component's live region is a plain polite span, not a status.
    const leader = stage.locator("[aria-live='polite']");
    const rows = stage
      .getByRole("list", { name: "Basinworks movers" })
      .getByRole("listitem");
    const gainers = stage.getByRole("radio", { name: "Gainers" });
    const losers = stage.getByRole("radio", { name: "Losers" });
    const tick = stage.getByRole("button", { name: "Tick" });

    await expect(status).toHaveText("Leading BSN +2.41% · 0 ticks · 0 resorts");
    await expect(rows).toHaveCount(5);
    // Each row is one sentence: rank, name, price and the move in words.
    await expect(rows.nth(0)).toHaveAttribute(
      "aria-label",
      "1, Basin BSN, $24.18, up 2.41 percent",
    );
    await expect(rows.nth(3)).toHaveAttribute(
      "aria-label",
      "4, Waylight WAY, $31.06, down 0.45 percent",
    );
    await expect(rows.nth(4)).toHaveAttribute(
      "aria-label",
      "5, Fernwork FRN, $8.42, down 1.06 percent",
    );
    await expect(gainers).toHaveAttribute("aria-checked", "true");
    await expect(leader).toHaveText("Leading: Basin BSN, up 2.41 percent");

    // The first tick prints FRN and WAY, and the two swap seats.
    await tick.click();
    await expect(status).toHaveText("Leading BSN +2.41% · 1 ticks · 1 resorts");
    await expect(rows.nth(3)).toHaveAttribute(
      "aria-label",
      "4, Fernwork FRN, $8.50, down 0.12 percent",
    );
    await expect(rows.nth(4)).toHaveAttribute(
      "aria-label",
      "5, Waylight WAY, $31.09, down 0.35 percent",
    );
    await expect(rows.nth(0)).toHaveAttribute(
      "aria-label",
      "1, Basin BSN, $24.18, up 2.41 percent",
    );

    // The radio pair roves: Right both moves and picks, and the board turns
    // over so the laggard leads.
    await gainers.focus();
    await page.keyboard.press("ArrowRight");
    await expect(losers).toBeFocused();
    await expect(losers).toHaveAttribute("aria-checked", "true");
    await expect(gainers).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText("Falling WAY -0.35% · 1 ticks · 2 resorts");
    await expect(rows.nth(0)).toHaveAttribute(
      "aria-label",
      "1, Waylight WAY, $31.09, down 0.35 percent",
    );
    await expect(rows.nth(4)).toHaveAttribute(
      "aria-label",
      "5, Basin BSN, $24.18, up 2.41 percent",
    );
    // The live region waits for the tape to be quiet, then names the leader.
    await expect(leader).toHaveText(
      "Falling most: Waylight WAY, down 0.35 percent",
      { timeout: 4000 },
    );

    // The pair does not wrap past its end.
    await page.keyboard.press("ArrowRight");
    await expect(losers).toBeFocused();
    await expect(losers).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(gainers).toBeFocused();
    await expect(gainers).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Leading BSN +2.41% · 1 ticks · 3 resorts");
    await expect(rows.nth(0)).toHaveAttribute(
      "aria-label",
      "1, Basin BSN, $24.18, up 2.41 percent",
    );

    // The second tick prints BSN and CBK; every seat holds, so no resort.
    await tick.click();
    await expect(status).toHaveText("Leading BSN +3.05% · 2 ticks · 3 resorts");
    await expect(rows.nth(0)).toHaveAttribute(
      "aria-label",
      "1, Basin BSN, $24.33, up 3.05 percent",
    );
    await expect(rows.nth(2)).toHaveAttribute(
      "aria-label",
      "3, Coldbrook CBK, $12.85, up 0.78 percent",
    );
    await expect(leader).toHaveText("Leading: Basin BSN, up 3.05 percent", {
      timeout: 4000,
    });

    // The pointer picks the same way the keys do.
    await losers.click();
    await expect(losers).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Falling WAY -0.35% · 2 ticks · 4 resorts");
  });

  test("price-sparkline: the plot is a slider the arrows walk, Escape returns the reading to the latest print, and a tick extends the line", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/price-sparkline");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[aria-live='polite']");
    const plot = stage.getByRole("slider", { name: "BSN/USD" });

    await expect(status).toHaveText("BSN $24.29 · 12 points · reading last");
    await expect(plot).toHaveAttribute("aria-orientation", "horizontal");
    await expect(plot).toHaveAttribute("aria-valuemin", "0");
    await expect(plot).toHaveAttribute("aria-valuemax", "11");
    await expect(plot).toHaveAttribute("aria-valuenow", "11");
    await expect(plot).toHaveAttribute("aria-valuetext", "11:20, $24.29");
    await expect(announced).toHaveText("BSN/USD $24.29 at 11:20");
    await expect(stage.getByText("12 / 48")).toBeVisible();

    // Left walks one print back; the header and the demo read the same point.
    await plot.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(plot).toHaveAttribute("aria-valuenow", "10");
    await expect(plot).toHaveAttribute("aria-valuetext", "11:10, $24.25");
    await expect(status).toHaveText("BSN $24.29 · 12 points · reading 11:10");
    await page.keyboard.press("ArrowLeft");
    await expect(plot).toHaveAttribute("aria-valuetext", "11:00, $24.20");

    // Home is the open, and the reading does not walk off its start.
    await page.keyboard.press("Home");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");
    await expect(plot).toHaveAttribute("aria-valuetext", "09:30, $24.06");
    await expect(status).toHaveText("BSN $24.29 · 12 points · reading 09:30");
    await page.keyboard.press("ArrowLeft");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");

    // End is the latest print, still held as a reading; Escape lets it go.
    await page.keyboard.press("End");
    await expect(plot).toHaveAttribute("aria-valuenow", "11");
    await expect(status).toHaveText("BSN $24.29 · 12 points · reading 11:20");
    await page.keyboard.press("Escape");
    await expect(status).toHaveText("BSN $24.29 · 12 points · reading last");
    await expect(plot).toHaveAttribute("aria-valuenow", "11");
    await expect(plot).toHaveAttribute("aria-valuetext", "11:20, $24.29");

    // A tick appends one print: the slider's range grows and the reading
    // follows the newest point, announced once the tape is quiet.
    await stage.getByRole("button", { name: "Tick" }).click();
    await expect(status).toHaveText("BSN $24.34 · 13 points · reading last");
    await expect(plot).toHaveAttribute("aria-valuemax", "12");
    await expect(plot).toHaveAttribute("aria-valuenow", "12");
    await expect(plot).toHaveAttribute("aria-valuetext", "11:30, $24.34");
    await expect(announced).toHaveText("BSN/USD $24.34 at 11:30", {
      timeout: 4000,
    });
    await expect(stage.getByText("13 / 48")).toBeVisible();

    // The pointer reads the same tape: the left inset is the open, and
    // leaving the plot returns the reading to the latest print.
    const box = await plot.boundingBox();
    if (!box) throw new Error("The plot has no box to hover.");
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await expect(status).toHaveText("BSN $24.34 · 13 points · reading 09:30");
    await expect(plot).toHaveAttribute("aria-valuetext", "09:30, $24.06");
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    await expect(status).toHaveText("BSN $24.34 · 13 points · reading last");
  });

  test("watchlist-row: the star is a switch, a second press within the beat cancels the leave, and an unstarred row slides out of the list", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/watchlist-row");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const list = stage.getByRole("list", { name: "Basinworks watchlist" });
    const rows = list.getByRole("listitem");
    // Read by their text rather than their role: a leaving row goes
    // aria-hidden for its slide, and its notice is the point of the read.
    const frnRow = list.locator("li").filter({ hasText: "Fernwork" });
    const cbkRow = list.locator("li").filter({ hasText: "Coldbrook" });
    const watchFrn = stage.getByRole("switch", { name: "Watch FRN" });
    const watchCbk = stage.getByRole("switch", { name: "Watch CBK" });
    const tick = stage.getByRole("button", { name: "Tick" });

    await expect(status).toHaveText(
      "3 watched · last tick none · none removed",
    );
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(
      "Basin BSN, $24.18, up 2.41 percent",
    );
    await expect(rows.nth(1)).toContainText(
      "Fernwork FRN, $8.42, down 1.06 percent",
    );
    await expect(rows.nth(2)).toContainText(
      "Coldbrook CBK, $12.90, up 1.18 percent",
    );
    await expect(watchCbk).toHaveAttribute("aria-checked", "true");

    // Two prints: the second lands on CBK and the row's sentence re-reads.
    await tick.click();
    await expect(status).toHaveText(
      "3 watched · last tick BSN $24.18 · none removed",
    );
    await tick.click();
    await expect(status).toHaveText(
      "3 watched · last tick CBK $12.95 · none removed",
    );
    await expect(cbkRow).toContainText(
      "Coldbrook CBK, $12.95, up 1.57 percent",
    );

    // Enter unstars FRN and the row says so; a second Enter inside the beat
    // takes it back, and a second later the row is still here.
    await watchFrn.focus();
    await page.keyboard.press("Enter");
    await expect(watchFrn).toHaveAttribute("aria-checked", "false");
    await expect(frnRow.locator("[role='status']")).toHaveText(
      "FRN leaves the watchlist",
    );
    await page.keyboard.press("Enter");
    await expect(watchFrn).toHaveAttribute("aria-checked", "true");
    await expect(frnRow.locator("[role='status']")).toHaveText("Watching FRN");
    await page.waitForTimeout(1000);
    await expect(rows).toHaveCount(3);
    await expect(status).toHaveText(
      "3 watched · last tick CBK $12.95 · none removed",
    );

    // Space unstars CBK; after the beat the row slides out, collapses, and
    // the demo drops it from the list.
    await watchCbk.focus();
    await page.keyboard.press(" ");
    await expect(watchCbk).toHaveAttribute("aria-checked", "false");
    await expect(cbkRow.locator("[role='status']")).toHaveText(
      "CBK leaves the watchlist",
    );
    await expect(status).toHaveText(
      "2 watched · last tick CBK $12.95 · removed CBK",
      { timeout: 4000 },
    );
    await expect(rows).toHaveCount(2);
    await expect(watchCbk).toHaveCount(0);
    await expect(cbkRow).toHaveCount(0);

    // Reset restores the row, starred, at its open.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toHaveText(
      "3 watched · last tick none · none removed",
    );
    await expect(rows).toHaveCount(3);
    await expect(watchCbk).toHaveAttribute("aria-checked", "true");
    await expect(cbkRow).toContainText(
      "Coldbrook CBK, $12.90, up 1.18 percent",
    );
  });

  test("price-alert: keys step the threshold, a print landing on the other side counts one crossing, and moving the line re-arms it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/price-alert");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[aria-live='polite']");
    const badge = stage.getByRole("slider", { name: "BSN/USD alert" });
    const tick = stage.getByRole("button", { name: "Tick" });

    await expect(status).toHaveText(
      "Alert $24.40 · BSN $24.09 · waiting above · 0 crossings",
    );
    await expect(badge).toHaveAttribute("aria-orientation", "vertical");
    await expect(badge).toHaveAttribute("aria-valuemin", "22.8");
    await expect(badge).toHaveAttribute("aria-valuemax", "25.6");
    await expect(badge).toHaveAttribute("aria-valuenow", "24.4");
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$24.40, waiting for a rise",
    );
    await expect(announced).toBeEmpty();

    // Arrows step a cent, the ends jump to the bounds, and the armed
    // direction follows which side of the line the last print sits on.
    await badge.focus();
    await page.keyboard.press("ArrowDown");
    await expect(badge).toHaveAttribute("aria-valuenow", "24.39");
    await expect(status).toHaveText(
      "Alert $24.39 · BSN $24.09 · waiting above · 0 crossings",
    );
    await page.keyboard.press("ArrowUp");
    await expect(badge).toHaveAttribute("aria-valuenow", "24.4");
    await page.keyboard.press("Home");
    await expect(badge).toHaveAttribute("aria-valuenow", "22.8");
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$22.80, waiting for a fall",
    );
    await expect(status).toHaveText(
      "Alert $22.80 · BSN $24.09 · waiting below · 0 crossings",
    );
    await page.keyboard.press("ArrowDown");
    await expect(badge).toHaveAttribute("aria-valuenow", "22.8");
    await page.keyboard.press("End");
    await expect(badge).toHaveAttribute("aria-valuenow", "25.6");
    await expect(status).toHaveText(
      "Alert $25.60 · BSN $24.09 · waiting above · 0 crossings",
    );

    // Fifteen page steps park the line a cent above the last print, so the
    // next print (24.13) lands on the other side of it.
    for (let step = 0; step < 15; step += 1) {
      await page.keyboard.press("PageDown");
    }
    await expect(badge).toHaveAttribute("aria-valuenow", "24.1");
    await expect(status).toHaveText(
      "Alert $24.10 · BSN $24.09 · waiting above · 0 crossings",
    );
    await tick.click();
    await expect(status).toHaveText(
      "Alert $24.10 · BSN $24.13 · waiting below · 1 crossings",
    );
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$24.10, crossed, now above",
    );
    await expect(announced).toHaveText("Crossed $24.10, price now above");

    // Moving the line re-arms it without a crossing: four cents up puts it
    // a cent above the print again, waiting for a rise. The press on Tick
    // took the focus, so the badge is handed it back first.
    await badge.focus();
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press("ArrowUp");
    }
    await expect(badge).toHaveAttribute("aria-valuenow", "24.14");
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$24.14, waiting for a rise",
    );
    await expect(status).toHaveText(
      "Alert $24.14 · BSN $24.13 · waiting above · 1 crossings",
    );
    await expect(announced).toBeEmpty();

    // The next print (24.15) crosses it; the one after (24.17) stays on
    // the same side and is not a second alert.
    await tick.click();
    await expect(status).toHaveText(
      "Alert $24.14 · BSN $24.15 · waiting below · 2 crossings",
    );
    await expect(announced).toHaveText("Crossed $24.14, price now above");
    await tick.click();
    await expect(status).toHaveText(
      "Alert $24.14 · BSN $24.17 · waiting below · 2 crossings",
    );
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$24.14, crossed, now above",
    );

    // A plain press on the plot puts the line under the hand: its middle
    // is the middle of the range. A drag then tracks the pointer down, and
    // neither counts as a crossing.
    const plot = badge.locator("xpath=..");
    const box = await plot.boundingBox();
    if (!box) throw new Error("The plot has no box to press.");
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    await page.mouse.click(midX, midY);
    await expect(badge).toHaveAttribute("aria-valuenow", "24.2");
    await expect(status).toHaveText(
      "Alert $24.20 · BSN $24.17 · waiting above · 2 crossings",
    );
    await page.mouse.move(midX, midY);
    await page.mouse.down();
    await page.mouse.move(midX, midY + 20, { steps: 4 });
    await page.mouse.up();
    await expect(badge).toHaveAttribute("aria-valuenow", "23.8");
    await expect(badge).toHaveAttribute(
      "aria-valuetext",
      "$23.80, waiting for a fall",
    );
    await expect(status).toHaveText(
      "Alert $23.80 · BSN $24.17 · waiting below · 2 crossings",
    );
  });

  test("heat-tiles: arrows rove the board, Enter opens a tile in place with its figures, Escape closes it, and a tick re-tints every tile", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/heat-tiles");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component names the open tile before the demo's line.
    const notice = stage.locator("[role='status']").first();
    const tiles = stage
      .getByRole("group", { name: "Basinworks board" })
      .getByRole("button");
    const bsn = tiles.nth(0);
    const frn = tiles.nth(1);
    const tdw = tiles.nth(5);
    const msb = tiles.nth(7);

    await expect(status).toHaveText(
      "8 tiles · 0 ticks · warmest BSN +3.30% · none open",
    );
    await expect(tiles).toHaveCount(8);
    await expect(bsn).toHaveAccessibleName("Basin BSN, up 3.30 percent");
    await expect(frn).toHaveAccessibleName("Fernwork FRN, down 1.06 percent");
    await expect(bsn).toHaveAttribute("tabindex", "0");
    await expect(frn).toHaveAttribute("tabindex", "-1");
    await expect(notice).toBeEmpty();
    // The tint is a fraction of the move over the saturation point.
    await expect
      .poll(marketsOpacityOf(frn.locator("span.bg-danger")), { timeout: 4000 })
      .toBeCloseTo(0.212, 2);

    // Right roves to the next tile and Enter opens it: it spans two columns
    // and its name gains the price, the low and the high.
    await bsn.focus();
    await page.keyboard.press("ArrowRight");
    await expect(frn).toBeFocused();
    await expect(frn).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Enter");
    await expect(frn).toHaveAttribute("aria-expanded", "true");
    await expect(frn).toHaveAccessibleName(
      "Fernwork FRN, down 1.06 percent, $8.42, low $8.23, high $8.46",
    );
    await expect(status).toHaveText(
      "8 tiles · 0 ticks · warmest BSN +3.30% · open FRN",
    );
    await expect(notice).toHaveText("Fernwork FRN open");
    await expect(frn).toContainText("Fernwork");
    await expect(frn).toContainText("$8.42");
    await expect
      .poll(
        async () => {
          const wide = await frn.boundingBox();
          const small = await bsn.boundingBox();
          return wide && small ? wide.width / small.width : 0;
        },
        { timeout: 4000 },
      )
      .toBeGreaterThan(1.9);

    // Down moves a row; Escape closes the open tile and leaves focus where
    // it stands.
    await page.keyboard.press("ArrowDown");
    await expect(tdw).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(frn).toHaveAttribute("aria-expanded", "false");
    await expect(tdw).toBeFocused();
    await expect(status).toHaveText(
      "8 tiles · 0 ticks · warmest BSN +3.30% · none open",
    );
    await expect(notice).toHaveText("Closed");
    await expect(frn).toHaveAccessibleName("Fernwork FRN, down 1.06 percent");

    // End jumps to the last tile and Space opens it.
    await page.keyboard.press("End");
    await expect(msb).toBeFocused();
    await page.keyboard.press(" ");
    await expect(msb).toHaveAttribute("aria-expanded", "true");
    await expect(status).toHaveText(
      "8 tiles · 0 ticks · warmest BSN +3.30% · open MSB",
    );

    // A tick prints every asset: the open tile's figures re-read, the
    // warmest changes hands, and the tints tween to the new moves.
    await stage.getByRole("button", { name: "Tick" }).click();
    await expect(status).toHaveText(
      "8 tiles · 1 ticks · warmest KLN +4.40% · open MSB",
    );
    await expect(msb).toHaveAccessibleName(
      "Mossbank MSB, down 1.70 percent, $9.85, low $9.74, high $9.87",
    );
    await expect(bsn).toHaveAccessibleName("Basin BSN, up 3.05 percent");
    await expect(frn).toHaveAccessibleName("Fernwork FRN, down 1.53 percent");
    await expect
      .poll(marketsOpacityOf(frn.locator("span.bg-danger")), { timeout: 4000 })
      .toBeCloseTo(0.306, 2);
    await expect
      .poll(marketsOpacityOf(tiles.nth(6).locator("span.bg-success")), {
        timeout: 4000,
      })
      .toBeCloseTo(0.6, 2);

    // Pressing the open tile again closes it.
    await msb.click();
    await expect(msb).toHaveAttribute("aria-expanded", "false");
    await expect(status).toHaveText(
      "8 tiles · 1 ticks · warmest KLN +4.40% · none open",
    );
    await expect(notice).toHaveText("Closed");
  });

  test("index-dial: each print swings the needle through a swinging beat to a settled reading the meter and the status agree on", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/index-dial");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component announces the settled reading before the demo's line.
    const settled = stage.locator("[role='status']").first();
    const meter = stage.getByRole("meter", { name: "Basin 40" });
    const needle = stage.locator("line[stroke='var(--ink)']");
    const nextPrint = stage.getByRole("button", { name: "Next print" });
    const reset = stage.getByRole("button", { name: "Reset" });

    // The mount swing settles on the first print.
    await expect(status).toHaveText("Basin 40 4,182.35 · +0.61% · settled");
    await expect(meter).toHaveAttribute("aria-valuemin", "-3");
    await expect(meter).toHaveAttribute("aria-valuemax", "3");
    await expect(meter).toHaveAttribute("aria-valuenow", "0.61");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "Basin 40 at 4,182.35, up 0.61 percent on the previous close",
    );
    await expect(settled).toHaveText(
      "Basin 40 at 4,182.35, up 0.61 percent on the previous close",
    );
    await expect(stage.getByText("Prev close 4,156.80 · +25.55")).toBeVisible();
    await expect(reset).toBeDisabled();
    // The needle's angle is the move over the range, across a half turn.
    await expect
      .poll(marketsTurnOf(needle), { timeout: 4000 })
      .toBeCloseTo(18.4, 0);

    // A print swings the needle: the demo reads "swinging" until the spring
    // completes, and the settle is announced once.
    await recordMarketsTrail(status);
    await nextPrint.click();
    await expect(status).toHaveText("Basin 40 4,171.02 · +0.34% · settled", {
      timeout: 4000,
    });
    await expect
      .poll(marketsTrailOf(page))
      .toContain("Basin 40 4,171.02 · +0.34% · swinging");
    await expect(meter).toHaveAttribute("aria-valuenow", "0.34");
    await expect(settled).toHaveText(
      "Basin 40 at 4,171.02, up 0.34 percent on the previous close",
    );

    // A fall swings it the other way, and the sign is in the words.
    await nextPrint.click();
    await expect(status).toHaveText("Basin 40 4,139.44 · -0.42% · settled", {
      timeout: 4000,
    });
    await expect(meter).toHaveAttribute("aria-valuenow", "-0.42");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "Basin 40 at 4,139.44, down 0.42 percent on the previous close",
    );
    await expect(stage.getByText("Prev close 4,156.80 · -17.36")).toBeVisible();
    await expect
      .poll(marketsTurnOf(needle), { timeout: 4000 })
      .toBeCloseTo(-12.5, 0);

    // The script runs out, the button retires, and Reset returns the open.
    await nextPrint.click();
    await expect(status).toHaveText("Basin 40 4,160.91 · +0.10% · settled", {
      timeout: 4000,
    });
    await nextPrint.click();
    await expect(status).toHaveText("Basin 40 4,197.63 · +0.98% · settled", {
      timeout: 4000,
    });
    await expect(nextPrint).toBeDisabled();
    await reset.click();
    await expect(status).toHaveText("Basin 40 4,182.35 · +0.61% · settled", {
      timeout: 4000,
    });
    await expect(reset).toBeDisabled();
  });

  test("sector-wheel: arrows pick the sector and spin its wedge under the notch, the movers follow, and a tick re-proportions the ring", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/sector-wheel");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const announced = stage.locator("[role='status']").first();
    const group = stage.getByRole("radiogroup", {
      name: "Basinworks Exchange",
    });
    const energy = group.getByRole("radio", { name: /^Energy,/ });
    const tech = group.getByRole("radio", { name: /^Tech,/ });
    const health = group.getByRole("radio", { name: /^Health,/ });
    const goods = group.getByRole("radio", { name: /^Goods,/ });
    const materials = group.getByRole("radio", { name: /^Materials,/ });
    // The ring is the turned box around the wheel's own SVG.
    const ring = stage
      .locator("svg[viewBox='0 0 200 200']")
      .locator("xpath=..");
    const turn = marketsTurnOf(ring);

    await expect(status).toHaveText("Tech +1.84% · top FRN +3.20%");
    await expect(group.getByRole("radio")).toHaveCount(6);
    await expect(tech).toHaveAttribute("aria-checked", "true");
    await expect(tech).toHaveAccessibleName("Tech, up 1.84 percent");
    await expect(announced).toHaveText(
      "Tech, up 1.84 percent. Top mover FRN, up 3.20 percent.",
    );
    const techMovers = stage.getByRole("list", { name: "Tech movers" });
    await expect(techMovers.getByRole("listitem")).toHaveCount(3);
    await expect(techMovers.getByRole("listitem").nth(0)).toContainText(
      "up 3.20 percent, +3.20%",
    );
    // Tech's wedge sits under the notch: the ring has turned its centre up.
    await expect.poll(turn, { timeout: 4000 }).toBeCloseTo(foldTurn(-121.3), 0);

    // Right both moves and picks; the ring finds the next detent.
    await tech.focus();
    await page.keyboard.press("ArrowRight");
    await expect(health).toBeFocused();
    await expect(health).toHaveAttribute("aria-checked", "true");
    await expect(tech).toHaveAttribute("aria-checked", "false");
    await expect(status).toHaveText("Health +0.42% · top CBK +0.88%");
    await expect(announced).toHaveText(
      "Health, up 0.42 percent. Top mover CBK, up 0.88 percent.",
    );
    await expect(
      stage.getByRole("list", { name: "Health movers" }),
    ).toBeVisible();
    await expect(techMovers).toHaveCount(0);
    await expect
      .poll(turn, { timeout: 4000 })
      .toBeCloseTo(foldTurn(-192.17), 0);

    // End and Home jump the ends; Up at the first stays.
    await page.keyboard.press("End");
    await expect(materials).toBeFocused();
    await expect(status).toHaveText("Materials -0.95% · top SLT -1.64%");
    await expect
      .poll(turn, { timeout: 4000 })
      .toBeCloseTo(foldTurn(-328.48), 0);
    await page.keyboard.press("Home");
    await expect(energy).toBeFocused();
    await expect(energy).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Energy -1.12% · top BSN -1.90%");
    await expect(announced).toHaveText(
      "Energy, down 1.12 percent. Top mover BSN, down 1.90 percent.",
    );
    await expect.poll(turn, { timeout: 4000 }).toBeCloseTo(foldTurn(-35.22), 0);
    await page.keyboard.press("ArrowUp");
    await expect(energy).toBeFocused();
    await expect(energy).toHaveAttribute("aria-checked", "true");

    // A tick reshapes the wedges: the chosen sector stays under the notch,
    // so the ring glides to its new centre, and its chip re-reads.
    await stage.getByRole("button", { name: "Next tick" }).click();
    await expect(status).toHaveText("Energy +2.40% · top BSN +3.10%");
    await expect(energy).toHaveAccessibleName("Energy, up 2.40 percent");
    await expect(announced).toHaveText(
      "Energy, up 2.40 percent. Top mover BSN, up 3.10 percent.",
    );
    await expect.poll(turn, { timeout: 4000 }).toBeCloseTo(foldTurn(-55.83), 0);

    // The pointer picks a chip the same way.
    await goods.click();
    await expect(goods).toHaveAttribute("aria-checked", "true");
    await expect(status).toHaveText("Goods +0.15% · top FLD +0.30%");
    await expect
      .poll(turn, { timeout: 4000 })
      .toBeCloseTo(foldTurn(-260.86), 0);
  });

  test("earnings-countdown: the clock starts and pauses, a skip re-seeds the last minute, and landing the results rolls in a beat", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/earnings-countdown");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component's milestones come before the demo's line.
    const milestone = stage.locator("[role='status']").first();
    const card = stage.getByRole("group", { name: "Fernworks Q3" });
    const timer = card.getByRole("timer");
    const clock = stage.getByRole("button", {
      name: /Start clock|Pause clock/,
    });
    const skip = stage.getByRole("button", { name: "Skip to last minute" });
    const land = stage.getByRole("button", { name: "Land results" });
    const unreported = card.getByRole("img", { name: "Not yet reported" });

    await expect(status).toHaveText(
      "Fernworks Q3 · 2d 14h 06m 12s · clock paused",
    );
    await expect(timer).toHaveAttribute("aria-live", "off");
    await expect(timer).toHaveAttribute(
      "aria-label",
      "2 days 14 hours 6 minutes 12 seconds until Fernworks Q3 results",
    );
    await expect(unreported).toHaveCount(2);
    await expect(milestone).toBeEmpty();
    await expect(card.getByText("Beat", { exact: true })).toHaveCount(0);

    // Starting the clock is a milestone; a second later the label has lost
    // a second; pausing holds it there.
    await clock.click();
    await expect(clock).toHaveText("Pause clock");
    await expect(status).toHaveText(
      "Fernworks Q3 · 2d 14h 06m 12s · clock running",
    );
    await expect(milestone).toHaveText("Clock running");
    await expect(timer).toHaveAttribute(
      "aria-label",
      "2 days 14 hours 6 minutes 11 seconds until Fernworks Q3 results",
      { timeout: 4000 },
    );
    await clock.click();
    await expect(clock).toHaveText("Start clock");
    await expect(status).toHaveText(
      "Fernworks Q3 · 2d 14h 06m 12s · clock paused",
    );
    const held = await timer.getAttribute("aria-label");
    await page.waitForTimeout(1000);
    await expect(timer).toHaveAttribute("aria-label", held ?? "");

    // A skip re-seeds the clock at the last minute; started, it counts.
    await skip.click();
    await expect(status).toHaveText(
      "Fernworks Q3 · 0d 00h 01m 00s · clock paused",
    );
    await expect(timer).toHaveAttribute(
      "aria-label",
      "0 days 0 hours 1 minutes 0 seconds until Fernworks Q3 results",
    );
    await expect(skip).toBeDisabled();
    await clock.click();
    await expect(timer).toHaveAttribute(
      "aria-label",
      "0 days 0 hours 0 minutes 59 seconds until Fernworks Q3 results",
      { timeout: 4000 },
    );

    // Results land: the readout becomes "Reported", the dashes give way to
    // the figures, the verdict is a beat, and the buttons retire.
    await land.click();
    await expect(status).toHaveText(
      "Fernworks Q3 · 0d 00h 01m 00s · landed beat",
    );
    await expect(timer).toHaveAttribute(
      "aria-label",
      "Fernworks Q3 results reported",
    );
    await expect(card.getByText("Reported", { exact: true })).toBeVisible();
    await expect(card.getByText("Beat", { exact: true })).toBeVisible();
    await expect(unreported).toHaveCount(0);
    await expect(card).toContainText("$1.24");
    await expect(card).toContainText("$1.91B");
    await expect(milestone).toHaveText(
      "Results landed: beat. Earnings per share $1.24 against $1.20 estimated.",
    );
    await expect(clock).toBeDisabled();
    await expect(land).toBeDisabled();

    // Reset remounts the card at its seed.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toHaveText(
      "Fernworks Q3 · 2d 14h 06m 12s · clock paused",
    );
    await expect(timer).toHaveAttribute(
      "aria-label",
      "2 days 14 hours 6 minutes 12 seconds until Fernworks Q3 results",
    );
    await expect(unreported).toHaveCount(2);
    await expect(card.getByText("Beat", { exact: true })).toHaveCount(0);
    await expect(clock).toBeEnabled();
  });

  test("news-ticker: the tape's own toggle stops it, focus holds it and Tab walks the headlines, and a push arrives with one announcement", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/news-ticker");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component announces arrivals before the demo's line.
    const announced = stage.locator("[role='status']").first();
    const feed = stage.getByRole("region", {
      name: "Basinworks Exchange desk feed",
    });
    const pauseTape = feed.getByRole("button", { name: "Pause tape" });
    // Only the first copy of the ring is in the tree; the loop copies are
    // aria-hidden and inert, so the role query reads each headline once.
    const headlines = feed.getByRole("list").getByRole("button");
    // The tape is the translated track around the ring's copies.
    const tape = feed.locator("ul").first().locator("xpath=..");
    const push = stage.getByRole("button", { name: "Push headline" });

    await expect(status).toHaveText(
      "4 headlines · running · latest 09:40 Basin Wire",
    );
    await expect(pauseTape).toHaveAttribute("aria-pressed", "false");
    await expect(headlines).toHaveCount(4);
    await expect(headlines.nth(0)).toHaveAccessibleName(
      "Basin 40 opens firmer as energy leads. Basin Wire, 09:31, up",
    );
    await expect(headlines.nth(3)).toHaveAccessibleName(
      "Saltmoor Metals slips on a softer order book. Basin Wire, 09:40, down",
    );
    await expect(announced).toBeEmpty();
    // The tape is moving.
    const before = await marketsXOf(tape)();
    await expect.poll(marketsXOf(tape), { timeout: 4000 }).not.toBe(before);

    // The tape's own toggle stops it, and the demo's Play starts it again.
    await pauseTape.click();
    await expect(pauseTape).toHaveAttribute("aria-pressed", "true");
    await expect(status).toHaveText(
      "4 headlines · stopped · latest 09:40 Basin Wire",
    );
    const play = stage.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeVisible();
    // Friction eases it to rest rather than freezing it: within a couple of
    // seconds two reads a beat apart agree.
    await expect
      .poll(
        async () => {
          const at = await marketsXOf(tape)();
          await page.waitForTimeout(250);
          return (await marketsXOf(tape)()) === at;
        },
        { timeout: 6000 },
      )
      .toBe(true);
    await play.click();
    await expect(pauseTape).toHaveAttribute("aria-pressed", "false");
    await expect(status).toHaveText(
      "4 headlines · running · latest 09:40 Basin Wire",
    );

    // Tab from the toggle reaches the first headline, which holds the tape
    // and glides into the viewport; a second Tab walks on; leaving lets go.
    await pauseTape.focus();
    await page.keyboard.press("Tab");
    await expect(headlines.nth(0)).toBeFocused();
    await expect(status).toHaveText(
      "4 headlines · held · latest 09:40 Basin Wire",
    );
    await page.keyboard.press("Tab");
    await expect(headlines.nth(1)).toBeFocused();
    await expect(status).toHaveText(
      "4 headlines · held · latest 09:40 Basin Wire",
    );
    // The glide brings the headline's start to the viewport's left margin —
    // or to its edge, since every desk headline is wider than the viewport
    // and the tape parks it as far in as it goes rather than past its start.
    const viewport = tape.locator("xpath=..");
    await expect
      .poll(
        async () => {
          const item = await headlines.nth(1).boundingBox();
          const frame = await viewport.boundingBox();
          if (!item || !frame) return false;
          const inset = item.x - frame.x;
          return inset >= -0.5 && inset <= 12.5;
        },
        { timeout: 4000 },
      )
      .toBe(true);
    await push.focus();
    await expect(status).toHaveText(
      "4 headlines · running · latest 09:40 Basin Wire",
    );

    // A push delivers the next headline: it joins the tree once, and is
    // announced once.
    await push.click();
    await expect(status).toHaveText(
      "5 headlines · running · latest 09:42 Basin Wire",
    );
    await expect(announced).toHaveText(
      "New: Waylight Pay clears its first settlement window, Basin Wire",
    );
    await expect(headlines).toHaveCount(5);
    await expect(
      feed.getByRole("button", {
        name: "Waylight Pay clears its first settlement window. Basin Wire, 09:42, up",
      }),
    ).toHaveCount(1);
    await push.click();
    await expect(status).toHaveText(
      "6 headlines · running · latest 09:45 Fernline Desk",
    );
    await expect(announced).toHaveText(
      "New: Gauge Systems trims its capacity plan, Fernline Desk",
    );
    await expect(headlines).toHaveCount(6);

    // Reset restores the opening four.
    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toHaveText(
      "4 headlines · running · latest 09:40 Basin Wire",
    );
    await expect(headlines).toHaveCount(4);
  });

  test("compare-lines: the plate is a keyboard cursor that reads both series and the gap, Escape clears it, and a legend toggle fades one line without moving the other", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/compare-lines");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The component reads the cursor before the demo's line.
    const readout = stage.locator("[role='status']").first();
    const plate = stage.getByRole("group", {
      name: "Basin BSN against Fernwork FRN",
    });
    const bsnToggle = stage.getByRole("button", { name: /Basin BSN$/ });
    const frnToggle = stage.getByRole("button", { name: /Fernwork FRN$/ });
    const baseline = plate.locator("line[stroke-dasharray='3 3']");
    const frnTrace = plate.locator("svg > g").nth(1);

    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · hover for the gap",
    );
    await expect(plate).toHaveAccessibleDescription(
      "Basin BSN up 8.41 percent and Fernwork FRN up 3.11 percent over 24 sessions.",
    );
    await expect(bsnToggle).toHaveAccessibleName("Hide Basin BSN");
    await expect(bsnToggle).toHaveAttribute("aria-pressed", "true");
    await expect(frnToggle).toHaveAccessibleName("Hide Fernwork FRN");
    await expect(frnToggle).toHaveAttribute("aria-pressed", "true");
    await expect(readout).toBeEmpty();
    const zeroLine = await baseline.getAttribute("y1");

    // Left from no cursor starts at the last session and steps back; the
    // chip prints both closes and the gap is in the words.
    await plate.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap +5.42 pts at Day 23",
    );
    await expect(readout).toHaveText(
      "Day 23: Basin BSN up 8.74 percent, Fernwork FRN up 3.32 percent, gap +5.42 points.",
    );
    await expect(stage.getByText("$45.78")).toBeVisible();
    await expect(stage.getByText("$18.96")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap +6.94 pts at Day 22",
    );

    // Home is the start, where both are flat; it does not walk off the edge.
    await page.keyboard.press("Home");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap 0.00 pts at Day 1",
    );
    await expect(readout).toHaveText(
      "Day 1: Basin BSN flat, Fernwork FRN flat, gap 0.00 points.",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap 0.00 pts at Day 1",
    );
    await page.keyboard.press("ArrowRight");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap +0.21 pts at Day 2",
    );
    await page.keyboard.press("End");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap +5.30 pts at Day 24",
    );
    await expect(readout).toHaveText(
      "Day 24: Basin BSN up 8.41 percent, Fernwork FRN up 3.11 percent, gap +5.30 points.",
    );
    await page.keyboard.press("Escape");
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · hover for the gap",
    );
    await expect(readout).toBeEmpty();

    // Hiding FRN fades its trace and leaves the baseline where it was: the
    // domain is fixed across both series. The readout then has no gap.
    await frnToggle.click();
    await expect(frnToggle).toHaveAttribute("aria-pressed", "false");
    await expect(frnToggle).toHaveAccessibleName("Show Fernwork FRN");
    await expect.poll(marketsOpacityOf(frnTrace), { timeout: 4000 }).toBe(0);
    await expect(baseline).toHaveAttribute("y1", zeroLine ?? "");
    await plate.focus();
    await page.keyboard.press("End");
    await expect(readout).toHaveText("Day 24: Basin BSN up 8.41 percent.");
    await frnToggle.click();
    await expect(frnToggle).toHaveAttribute("aria-pressed", "true");
    await expect(frnToggle).toHaveAccessibleName("Hide Fernwork FRN");
    await expect.poll(marketsOpacityOf(frnTrace), { timeout: 4000 }).toBe(1);
    // The press took focus off the plate, which clears the cursor.
    await expect(readout).toBeEmpty();

    // The pointer reads the nearest sample: the left edge is the start, and
    // leaving the plate clears it.
    const box = await plate.boundingBox();
    if (!box) throw new Error("The plate has no box to hover.");
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · gap 0.00 pts at Day 1",
    );
    await page.mouse.move(box.x + box.width / 2, box.y - 80);
    await expect(status).toHaveText(
      "BSN +8.41% · FRN +3.11% · hover for the gap",
    );
  });
});
