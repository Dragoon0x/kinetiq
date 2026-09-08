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
