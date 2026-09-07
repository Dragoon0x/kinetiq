// Device-level probes for the practical wing: twenty instruments whose worth
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

test.describe("fields", () => {
  test("mask-field: typed digits wear the mask and the slots count down", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/mask-field");
    const stage = stageOf(page);
    const status = demoStatus(stage);

    const phone = stage.getByLabel("Mobile number");
    // Typed a character at a time: the separators must arrive on their own.
    await phone.pressSequentially("555010");
    await expect(phone).toHaveValue("(555) 010-");
    await expect(status).toContainText("Phone 555010 · 4 slots left");

    await phone.pressSequentially("9999");
    await expect(phone).toHaveValue("(555) 010-9999");
    await expect(status).toContainText("Phone 5550109999 · 0 slots left");

    // A paste fills every slot at once and reduces to the same raw value.
    const card = stage.getByLabel("Card number");
    await card.fill("4242 4242 4242 4242");
    await expect(card).toHaveValue("4242 4242 4242 4242");
    await expect(status).toContainText("Card 4242424242424242 · 0 slots left");
  });

  test("typeahead-field: Tab takes the completion and routes to it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/typeahead-field");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const field = stage.getByRole("combobox");

    await expect(status).toContainText("no destination yet");

    await field.pressSequentially("brig");
    const list = stage.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(1);
    await expect(field).toHaveAttribute("aria-expanded", "true");

    // Enter takes the marked suggestion: the destination, spelled its own way.
    await field.press("Enter");
    await expect(field).toHaveValue("Brightwater");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("Routing to Brightwater");

    // Tab is the path the demo advertises, and must accept the same
    // suggestion. It does not: it commits the typed prefix plus the remainder,
    // so the destination keeps whatever casing was typed at it.
    await field.fill("");
    await field.pressSequentially("brig");
    await expect(list.getByRole("option")).toHaveCount(1);
    await field.press("Tab");
    // Tab accepted rather than escaped: the caret is still in the field.
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Brightwater");
    await expect(status).toContainText("Routing to Brightwater");
  });

  test("strength-field: each rule ticks itself off as the password strengthens", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/strength-field");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const field = stage.getByLabel("Choose a password");
    const meter = stage.getByRole("meter", { name: "Password strength" });

    await expect(status).toContainText("Strength 0 of 4 · 0 rules met");

    await field.fill("fernworks");
    await expect(status).toContainText("Strength 1 of 4 · 1 rules met");

    await field.fill("fernworks24");
    await expect(status).toContainText("Strength 2 of 4 · 2 rules met");

    await field.fill("Fernworks24!");
    await expect(status).toContainText("Strength 4 of 4 · 4 rules met");
    await expect(meter).toHaveAttribute("aria-valuenow", "4");
    await expect(meter).toHaveAttribute("aria-valuetext", "Strong, 4 of 4");
    await expect(stage.getByText("Strong", { exact: true })).toBeVisible();
  });

  test("catch-zone: the hidden input lands a file, and refuses the wrong type", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/catch-zone");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const input = stage.locator('input[type="file"]');

    await expect(status).toContainText("0 files · 0 B");

    await input.setInputFiles({
      name: "invoice-4417.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(1234, 0x20),
    });
    await expect(stage.getByText("invoice-4417.pdf")).toBeVisible();
    await expect(
      stage.getByRole("button", { name: "Remove invoice-4417.pdf" }),
    ).toBeVisible();
    await expect(status).toContainText("1 file · 1.2 KB");

    // Not an accepted type: a reason, and the ledger is untouched.
    await input.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("no"),
    });
    await expect(stage.getByRole("alert")).toContainText(
      "notes.txt is not an accepted type.",
    );
    await expect(status).toContainText("1 file · 1.2 KB");
  });

  test("signature-pad: a pointer stroke is recorded and Clear rewinds it away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/signature-pad");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const pad = stage.locator("svg.touch-none");

    await expect(status).toContainText("0 strokes · unsigned");

    // The pad sits below the fold at 1280×720; a stroke drawn off-screen
    // never reaches it.
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const midY = box.y + box.height / 2;
    await page.mouse.move(box.x + 30, midY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(box.x + 30 + i * 14, midY + (i % 2 ? -10 : 10), {
        steps: 4,
      });
    }
    await page.mouse.up();

    await expect(status).toContainText("1 stroke · signature on file");
    // One ink group is on the pad.
    await expect(pad.locator("g")).toHaveCount(1);

    await stage.getByRole("button", { name: "Clear" }).click();
    await expect(status).toContainText("0 strokes · unsigned");
    await expect(pad.locator("g")).toHaveCount(0, { timeout: 5000 });
  });

  test("pin-pad: a wrong code is refused and 2468 unlocks the door", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/pin-pad");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The pad keeps its own caption; the demo's line is the one below it.
    const caption = stage.locator("[role='status']").first();

    await expect(caption).toHaveText("0 of 4 entered");
    await expect(status).toContainText("Waylight entry locked");

    // The keys carry the keyboard path: focus one, then type.
    await stage.getByRole("button", { name: "1", exact: true }).focus();
    await page.keyboard.type("1357", { delay: 40 });
    await expect(caption).toHaveText("Incorrect code", { timeout: 5000 });
    await expect(status).toContainText("Waylight entry wrong code");

    // The refused row empties itself and the demo falls back to locked.
    await expect(status).toContainText("Waylight entry locked", {
      timeout: 8000,
    });
    await expect(caption).toHaveText("0 of 4 entered");

    await page.keyboard.type("2468", { delay: 40 });
    await expect(caption).toHaveText("Unlocked", { timeout: 5000 });
    await expect(status).toContainText("Waylight entry unlocked");
  });

  test("hue-ring: ArrowRight steps the hue and the hex follows", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/hue-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const ring = stage.getByRole("slider", { name: "Fernworks accent hue" });

    await expect(ring).toHaveAttribute("aria-valuenow", "262");
    const before = await ring.getAttribute("aria-valuetext");

    await ring.press("ArrowRight");
    await expect(ring).toHaveAttribute("aria-valuenow", "263");
    await expect(status).toContainText("263°");
    const after = await ring.getAttribute("aria-valuetext");
    expect(after).not.toBe(before);

    // The demo's readout is the ring's own hex, not a second opinion.
    const hex = (after ?? "").split(", ")[1] ?? "";
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    await expect(status).toContainText(hex);

    // Shift takes ten degrees at a time.
    await ring.press("Shift+ArrowRight");
    await expect(ring).toHaveAttribute("aria-valuenow", "273");
    await expect(status).toContainText("273°");
  });

  test("time-dial: Enter advances hour to minute to a set window", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/time-dial");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const dial = stage.getByRole("slider");

    await expect(dial).toHaveAttribute(
      "aria-label",
      "Fieldline dispatch start hour",
    );
    await expect(status).toContainText("opens 08:15 · picking hour");

    await dial.press("ArrowRight");
    await expect(status).toContainText("opens 09:15 · picking hour");

    await dial.press("Enter");
    await expect(dial).toHaveAttribute(
      "aria-label",
      "Fieldline dispatch start minute",
    );
    await expect(status).toContainText("picking minute");

    // The same arrow now steps the minute scale, in its own 5-minute grain.
    await dial.press("ArrowRight");
    await expect(status).toContainText("opens 09:20 · picking minute");

    await dial.press("Enter");
    await expect(status).toContainText("opens 09:20 · window set");
  });

  test("almanac-picker: a click opens the range and the keyboard closes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/almanac-picker");
    const stage = stageOf(page);
    const status = demoStatus(stage);

    await expect(status).toContainText("14 May to 18 May · 4 nights");

    await stage.getByRole("gridcell", { name: "May 5, 2026" }).click();
    await expect(status).toContainText("5 May to open · 0 nights");

    const close = stage.getByRole("gridcell", { name: "May 9, 2026" });
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
    await expect(close).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(status).toContainText("5 May to 9 May · 4 nights");
    await expect(close).toHaveAttribute("aria-selected", "true");
  });

  test("slide-confirm: the keyboard slides the track to the end and confirms", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/slide-confirm");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const track = stage.getByRole("slider", { name: "Slide to pay 48.00" });

    await expect(status).toContainText("Coldbrook checkout idle");

    const percent = async () =>
      Number(await track.getAttribute("aria-valuenow"));

    await track.focus();
    // Ten percent a press, against a spring that is still catching up — so this
    // runs the track rather than assuming a fixed press count.
    for (let i = 0; i < 20 && (await percent()) < 95; i += 1) {
      await track.press("ArrowRight");
      await page.waitForTimeout(70);
    }
    expect(await percent()).toBeGreaterThanOrEqual(85);

    await track.press("Enter");
    await expect(track).toHaveAttribute("aria-valuetext", "Paid 48.00");
    await expect(status).toContainText("Coldbrook checkout paid");
  });
});

test.describe("choosers", () => {
  test("choice-cards: arrows change the plan and the rail re-prices it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/choice-cards");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const plans = stage.getByRole("radiogroup", { name: "Waylight plan" });

    await expect(status).toContainText("Studio · monthly · $29");

    await plans.getByRole("radio", { name: "Studio" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(plans.getByRole("radio", { name: "Fleet" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("Fleet · monthly · $120");

    await stage
      .getByRole("radiogroup", { name: "Billing period" })
      .getByRole("radio", { name: "Yearly" })
      .click();
    await expect(status).toContainText("Fleet · yearly · $1150");
  });

  test("size-tiles: a size is taken and a sold-out one refuses", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/size-tiles");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const tiles = stage.getByRole("radiogroup", {
      name: "Fernworks field jacket",
    });

    await expect(status).toContainText("Size M · 2 of 6 out of stock");

    const large = tiles.getByRole("radio", { name: "L", exact: true });
    await large.click();
    await expect(large).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Size L · 2 of 6 out of stock");

    const soldOut = tiles.getByRole("radio", { name: "S", exact: true });
    await expect(soldOut).toHaveAttribute("aria-disabled", "true");
    // aria-disabled, not disabled — the tile still takes a real click, and the
    // refusal has to come from the component rather than from the browser.
    await soldOut.click({ force: true });
    await expect(soldOut).toHaveAttribute("aria-checked", "false");
    await expect(large).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Size L · 2 of 6 out of stock");
  });

  test("filter-ledge: a chip narrows the count and Clear all empties the ledge", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/filter-ledge");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const chips = stage.getByRole("group", {
      name: "Basinworks listing filters",
    });
    const pets = chips.getByRole("button", { name: /Pet friendly/ });
    const waterfront = chips.getByRole("button", { name: /Waterfront/ });

    await expect(waterfront).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Waterfront · 96 listings");

    await pets.click();
    await expect(pets).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText(
      "Waterfront, Pet friendly · 51 listings",
    );

    await stage.getByRole("button", { name: "Clear all" }).click();
    await expect(status).toContainText("No filters · 248 listings");
    await expect(pets).toHaveAttribute("aria-pressed", "false");
    await expect(waterfront).toHaveAttribute("aria-pressed", "false");
  });

  test("cadence-pick: the rail switches cadence and Custom unfolds the stepper", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/cadence-pick");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rail = stage.getByRole("radiogroup", {
      name: "Gaugeworks report cadence",
    });
    const stepper = stage.getByRole("spinbutton", {
      name: "Interval in days",
    });
    // The stepper lives in a panel that is measured, not given room: a shut
    // drawer is zero tall, so the panel's own height is the reveal — and while
    // it is shut the spinbutton is out of the accessibility tree entirely.
    const panel = stage.locator('[role="spinbutton"]');
    const panelHeight = () =>
      panel.evaluate(
        (el) =>
          el.closest("div.overflow-hidden")?.getBoundingClientRect().height ??
          -1,
      );

    await expect(status).toContainText("weekly · next run Wednesday 07:00");
    expect(await panelHeight()).toBeLessThan(1);
    await expect(stepper).toHaveCount(0);

    await rail.getByRole("radio", { name: "Weekly" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(status).toContainText("daily · next run tomorrow 07:00");

    await page.keyboard.press("End");
    await expect(rail.getByRole("radio", { name: "Custom" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("custom · next run in 3 days, 07:00");
    await expect.poll(panelHeight, { timeout: 5000 }).toBeGreaterThan(20);
    await expect(stepper).toHaveCount(1);
    await expect(stepper).toHaveAttribute("aria-valuenow", "3");

    await stepper.focus();
    await page.keyboard.press("ArrowUp");
    await expect(stepper).toHaveAttribute("aria-valuenow", "4");
    await expect(status).toContainText("custom · next run in 4 days, 07:00");

    await stage.getByRole("button", { name: "Longer interval" }).click();
    await expect(stepper).toHaveAttribute("aria-valuenow", "5");
    await expect(status).toContainText("custom · next run in 5 days, 07:00");
  });

  test("likert-scale: arrows move the point and select it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/likert-scale");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const kit = stage.getByRole("radiogroup", { name: /kit list matched/ });

    await expect(status).toContainText("kit 4/5");
    await expect(status).toContainText("brief —/7");

    await kit.getByRole("radio", { name: "4 of 5" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(kit.getByRole("radio", { name: "5, Agree" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("kit 5/5");

    await page.keyboard.press("ArrowLeft");
    await expect(kit.getByRole("radio", { name: "4 of 5" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("kit 4/5");

    await page.keyboard.press("Home");
    await expect(status).toContainText("kit 1/5");
    // The second scale is untouched by any of that.
    await expect(status).toContainText("brief —/7");
  });

  test("priority-flag: ArrowUp climbs the mast and wraps at the top", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/priority-flag");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const flags = stage.getByRole("radiogroup", { name: "Priority" });

    await expect(status).toContainText("Medium · first response 24h");

    await flags.getByRole("radio", { name: "Medium" }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(flags.getByRole("radio", { name: "High" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("High · first response 8h");

    await page.keyboard.press("ArrowUp");
    await expect(flags.getByRole("radio", { name: "Urgent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("Urgent · first response 2h");

    // Past the top the ladder wraps to the bottom rung.
    await page.keyboard.press("ArrowUp");
    await expect(flags.getByRole("radio", { name: "Low" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(status).toContainText("Low · first response 72h");
  });

  test("slot-grid: a free slot is booked and a taken one refuses", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/slot-grid");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const grid = stage.getByRole("grid", { name: "Basinworks viewings" });

    await expect(status).toContainText("Pick a viewing slot");

    await grid.getByRole("button", { name: "Wed 15 10:00" }).click();
    await expect(status).toContainText("Viewing Wed 15 · 10:00");

    const taken = grid.getByRole("button", {
      name: "Tue 14 10:00, unavailable",
    });
    await expect(taken).toHaveAttribute("aria-disabled", "true");
    // aria-disabled, not disabled: the cell must refuse the click itself.
    await taken.click({ force: true });
    await expect(status).toContainText("Viewing Wed 15 · 10:00");

    // The keyboard walks the same grid, and refuses on the same terms.
    await grid.getByRole("button", { name: "Wed 15 10:00" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(taken).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Viewing Wed 15 · 10:00");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(
      grid.getByRole("button", { name: "Thu 16 10:00" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Viewing Thu 16 · 10:00");
  });

  test("vote-pair: an upvote lands and a second press withdraws it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/vote-pair");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const up = stage.getByRole("button", {
      name: "Upvote this answer from Reeve",
    });

    await expect(status).toContainText("Reeve 41");
    await expect(up).toHaveAttribute("aria-pressed", "false");

    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Reeve 42");
    // The neighbour is untouched.
    await expect(status).toContainText("Okonjo 12");

    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "false");
    await expect(status).toContainText("Reeve 41");
  });

  test("access-matrix: the row master cascades every cell in its row", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/access-matrix");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const grid = stage.getByRole("grid", {
      name: "Gaugeworks workspace roles",
    });
    const master = grid.getByRole("checkbox", {
      name: "All actions for Viewer",
    });
    const actions = ["Read", "Comment", "Edit", "Export", "Admin"];

    await expect(status).toContainText("9 of 15 permissions granted");
    // One of five held, so the master reports mixed rather than a switch state.
    await expect(master).toHaveAttribute("aria-checked", "mixed");

    await master.click();
    await expect(master).toHaveAttribute("aria-checked", "true");
    for (const action of actions) {
      await expect(
        grid.getByRole("switch", { name: `${action} for Viewer` }),
      ).toHaveAttribute("aria-checked", "true");
    }
    await expect(status).toContainText("13 of 15 permissions granted");

    await master.click();
    await expect(master).toHaveAttribute("aria-checked", "false");
    for (const action of actions) {
      await expect(
        grid.getByRole("switch", { name: `${action} for Viewer` }),
      ).toHaveAttribute("aria-checked", "false");
    }
    await expect(status).toContainText("8 of 15 permissions granted");
    // Another role's row is untouched by the cascade.
    await expect(
      grid.getByRole("switch", { name: "Edit for Editor" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("avatar-pick: arrows walk the ring from face to face", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/avatar-pick");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const faces = stage.getByRole("radiogroup", { name: "Choose a face" });

    await expect(status).toContainText("Waylight profile · Kestrel");

    await faces.getByRole("radio", { name: "Kestrel" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(faces.getByRole("radio", { name: "Fern" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(faces.getByRole("radio", { name: "Kestrel" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(status).toContainText("Waylight profile · Fern");

    await page.keyboard.press("ArrowRight");
    await expect(status).toContainText("Waylight profile · Ember");

    await page.keyboard.press("ArrowLeft");
    await expect(status).toContainText("Waylight profile · Fern");
  });
});
