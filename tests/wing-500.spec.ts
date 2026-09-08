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
