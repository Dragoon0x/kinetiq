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

/**
 * Most of these demos put their content in one scrolling frame and let a device
 * watch it. The frame is the only `overflow-y-auto` box inside the stage.
 */
const frameOf = (stage: Locator): Locator =>
  stage.locator("div.overflow-y-auto").first();

/** Scroll a frame to an absolute offset, the way a wheel would. */
const scrollFrameTo = async (frame: Locator, top: number): Promise<void> => {
  await frame.evaluate((element, y) => {
    element.scrollTo({ top: y, behavior: "auto" });
  }, top);
};

/** A poll target: how far a frame has been scrolled. */
const scrollTopOf = (frame: Locator) => async (): Promise<number> =>
  frame.evaluate((element) => element.scrollTop);

test.describe("wayfinding", () => {
  test("spy-index: scrolling the frame moves the marker down the index", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/spy-index");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const index = stage.getByRole("navigation", { name: "Batch note" });
    const frame = frameOf(stage);
    const scope = index.getByRole("link", { name: "Scope" });
    const tolerances = index.getByRole("link", { name: "Tolerances" });

    await expect(status).toContainText("Reading Scope");
    await expect(scope).toHaveAttribute("aria-current", "location");

    // Put Tolerances' top just above the reading line (offset 24), which is
    // exactly the geometry the index reads the active section from.
    await frame.evaluate((element) => {
      const target = element.querySelector("#waylight-tolerances");
      if (!(target instanceof HTMLElement)) throw new Error("no section");
      const delta =
        target.getBoundingClientRect().top -
        element.getBoundingClientRect().top;
      element.scrollTo({ top: element.scrollTop + delta - 20 });
    });

    await expect(status).toContainText("Reading Tolerances");
    await expect(tolerances).toHaveAttribute("aria-current", "location");
    await expect(scope).not.toHaveAttribute("aria-current", "location");

    // The rail is a live reading, not a latch: scrolling home hands it back.
    await scrollFrameTo(frame, 0);
    await expect(status).toContainText("Reading Scope");
    await expect(scope).toHaveAttribute("aria-current", "location");
  });

  test("tab-bar: a click and an arrow both move the bar, and the badge counts", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/tab-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const bar = stage.getByRole("tablist", { name: "Coldbrook" });
    const inbox = bar.getByRole("tab", { name: "Inbox, 3 new" });

    await expect(status).toContainText("Tab home · inbox 3");
    await expect(bar.getByRole("tab", { name: "Home" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await inbox.click();
    await expect(inbox).toHaveAttribute("aria-selected", "true");
    await expect(status).toContainText("Tab inbox");

    // Activation follows focus, so the arrow both moves and selects.
    await page.keyboard.press("ArrowRight");
    const wallet = bar.getByRole("tab", { name: "Wallet" });
    await expect(wallet).toBeFocused();
    await expect(wallet).toHaveAttribute("aria-selected", "true");
    await expect(status).toContainText("Tab wallet");

    await page.keyboard.press("Home");
    await expect(status).toContainText("Tab home");

    // A statement lands: the badge is part of the tab's own name.
    await stage.getByRole("button", { name: "Deliver a statement" }).click();
    await expect(bar.getByRole("tab", { name: "Inbox, 4 new" })).toBeVisible();
    await expect(status).toContainText("inbox 4");
  });

  test("fold-sidebar: folding to the rail keeps the item that was open", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/fold-sidebar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const nav = stage.getByRole("navigation", { name: "Gaugeworks console" });
    const alerts = nav.getByRole("button", { name: "Alerts" });
    const width = async (): Promise<number> =>
      (await nav.boundingBox())?.width ?? -1;

    await expect(status).toContainText("Open · Dashboards");

    await alerts.click();
    await expect(alerts).toHaveAttribute("aria-current", "page");
    await expect(status).toContainText("Open · Alerts");

    await nav.getByRole("button", { name: "Collapse sidebar" }).click();
    const expand = nav.getByRole("button", { name: "Expand sidebar" });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("Rail · Alerts");
    // 224px open, 56px folded — the nav is measured, not assumed.
    await expect.poll(width, { timeout: 5000 }).toBeLessThan(80);
    // The selection survives the fold: the same item still owns the page.
    await expect(alerts).toHaveAttribute("aria-current", "page");

    await expand.click();
    await expect(status).toContainText("Open · Alerts");
    await expect.poll(width, { timeout: 5000 }).toBeGreaterThan(180);
    await expect(alerts).toHaveAttribute("aria-current", "page");
  });

  test("top-rise: past the threshold it surfaces, and it takes the frame home", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/top-rise");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const frame = frameOf(stage);
    const button = stage.getByRole("button", { name: "Back to top" });

    await expect(status).toContainText("Depth 0%");
    // Below the threshold it is not merely hidden: it is not in the DOM.
    await expect(button).toHaveCount(0);

    await scrollFrameTo(frame, 400);
    await expect(button).toBeVisible();
    await expect(status).not.toContainText("Depth 0%");

    await button.click();
    await expect.poll(scrollTopOf(frame), { timeout: 5000 }).toBe(0);
    await expect(status).toContainText("Depth 0%");
    await expect(button).toHaveCount(0, { timeout: 5000 });
  });

  test("canopy-menu: hover unfolds one panel and Escape folds it away", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/canopy-menu");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const bar = stage.getByRole("navigation", { name: "Fernworks" });
    const product = bar.getByRole("button", { name: "Product" });
    const solutions = bar.getByRole("button", { name: "Solutions" });
    const panel = stage.locator("[role='region']");

    await expect(status).toContainText("Panel closed");
    await expect(product).toHaveAttribute("aria-expanded", "false");
    // A shut canopy is inert, so nothing behind it can be tabbed into.
    await expect(panel).toHaveAttribute("inert", "");

    await product.hover();
    await expect(product).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Panel Product");
    await expect(panel).not.toHaveAttribute("inert");
    await expect(panel).toHaveAttribute("aria-label", "Product");

    // Moving along the bar morphs the same panel rather than reopening one.
    await solutions.hover();
    await expect(status).toContainText("Panel Solutions");
    await expect(panel).toHaveAttribute("aria-label", "Solutions");
    await expect(product).toHaveAttribute("aria-expanded", "false");

    await solutions.press("Escape");
    await expect(status).toContainText("Panel closed");
    await expect(solutions).toHaveAttribute("aria-expanded", "false");
    await expect(solutions).toBeFocused();
    await expect(panel).toHaveAttribute("inert", "");
  });

  test("swipe-tabs: the arrow keys walk the strip and the panel follows", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/swipe-tabs");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const tabs = stage.getByRole("tablist", { name: "Order sections" });
    const panels = stage.locator("[role='tabpanel']");

    await expect(status).toContainText("Tab details");
    await expect(panels).toHaveCount(3);
    await expect(panels.nth(0)).not.toHaveAttribute("inert");

    await tabs.getByRole("tab", { name: "Details" }).press("ArrowRight");
    const items = tabs.getByRole("tab", { name: "Items" });
    await expect(items).toHaveAttribute("aria-selected", "true");
    await expect(items).toBeFocused();
    await expect(status).toContainText("Tab items");
    // The strip's panels change hands: only the live one stays reachable.
    await expect(panels.nth(1)).not.toHaveAttribute("inert");
    await expect(panels.nth(0)).toHaveAttribute("inert", "");

    await page.keyboard.press("ArrowRight");
    await expect(status).toContainText("Tab timeline");
    await expect(panels.nth(2)).not.toHaveAttribute("inert");

    // The ends do not wrap; Home is the way back.
    await page.keyboard.press("ArrowRight");
    await expect(status).toContainText("Tab timeline");
    await page.keyboard.press("Home");
    await expect(status).toContainText("Tab details");
    await expect(panels.nth(0)).not.toHaveAttribute("inert");
  });

  test("route-bar: a view button starts the bar and the view lands", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/route-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const signals = stage.getByRole("button", { name: "Signals" });
    const bar = stage.getByRole("progressbar", {
      name: "Waylight view loading",
    });

    await expect(status).toContainText("View overview");
    // Idle, the bar is not rendered at all.
    await expect(bar).toHaveCount(0);

    await signals.click();
    await expect(status).toContainText("Loading signals");
    await expect(bar).toBeVisible();
    // It trickles rather than jumping: never past its 90% ceiling while waiting.
    const percent = Number(await bar.getAttribute("aria-valuenow"));
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(90);

    // The demo's route takes 1.6s, then the view lands and the bar completes.
    await expect(status).toContainText("View signals", { timeout: 8000 });
    await expect(stage.getByText("Waylight · Signals")).toBeVisible();
    await expect(stage.getByText("Rail pressure")).toBeVisible();
    await expect(signals).toHaveAttribute("aria-current", "page");
    await expect(bar).toHaveCount(0, { timeout: 8000 });
  });

  test("section-dots: a dot scrolls the frame and takes aria-current with it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/section-dots");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rail = stage.getByRole("navigation", {
      name: "Fieldline run sections",
    });
    const frame = frameOf(stage);
    const intake = rail.getByRole("button", { name: "Intake" });
    const assemble = rail.getByRole("button", { name: "Assemble" });

    await expect(status).toContainText("Section Intake");
    await expect(intake).toHaveAttribute("aria-current", "true");

    await assemble.click();
    // The rail scrolls the container; the observer, not the click, moves the pill.
    await expect
      .poll(scrollTopOf(frame), { timeout: 5000 })
      .toBeGreaterThan(100);
    await expect(status).toContainText("Section Assemble");
    await expect(assemble).toHaveAttribute("aria-current", "true");
    await expect(intake).not.toHaveAttribute("aria-current", "true");

    await intake.click();
    await expect.poll(scrollTopOf(frame), { timeout: 5000 }).toBe(0);
    await expect(status).toContainText("Section Intake");
  });

  test("burger-sheet: the button opens the sheet and Escape hands focus back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/burger-sheet");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const menu = stage.getByRole("button", { name: "Menu", exact: true });
    const sheet = stage.getByRole("dialog", { name: "Waylight" });

    await expect(status).toContainText("Menu closed");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(sheet).toHaveCount(0);

    await menu.click();
    await expect(sheet).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Menu open");
    await expect(
      sheet.getByRole("link", { name: "Sweep sheets" }),
    ).toBeVisible();
    // Focus is taken to the sheet's first control, not left on the button.
    await expect(
      sheet.getByRole("button", { name: "Close menu" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(status).toContainText("Menu closed");
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
    await expect(menu).toBeFocused();
  });

  test("letter-index: the rail jumps the list and names the letter it landed on", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/letter-index");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rail = stage.getByRole("listbox", {
      name: "Jump to contacts letter",
    });
    const list = frameOf(stage);

    await expect(status).toContainText("Letter A");
    expect(await scrollTopOf(list)()).toBe(0);

    // End takes the last letter that has entries — T, not Z.
    await rail.press("End");
    await expect(rail).toHaveAttribute("aria-activedescendant", /-letter-T$/);
    await expect(
      rail.getByRole("option", { name: "T", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    // Moving is not jumping: nothing scrolls until the letter is taken.
    expect(await scrollTopOf(list)()).toBe(0);

    await rail.press("Enter");
    await expect(status).toContainText("Letter T");
    await expect
      .poll(scrollTopOf(list), { timeout: 5000 })
      .toBeGreaterThan(100);

    // Up skips the letters with no entries: T is preceded by S.
    await rail.press("ArrowUp");
    await rail.press("Enter");
    await expect(status).toContainText("Letter S");
    await expect(
      rail.getByRole("option", { name: "S", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("overlays", () => {
  test("undo-toast: Archive raises the toast and Undo puts the row back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/undo-toast");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const row = stage
      .getByRole("listitem")
      .filter({ hasText: "Weekly digest" });

    await expect(status).toContainText("Inbox 4 of 4");
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: "Archive" }).click();
    await expect(stage.getByText("Archived Weekly digest")).toBeVisible();
    await expect(status).toContainText("Inbox 3 of 4 · undo window open");
    await expect(row).toHaveCount(0, { timeout: 5000 });

    // Well inside the five-second ring.
    await stage.getByRole("button", { name: "Undo" }).click();
    await expect(stage.getByText("Restored")).toBeVisible();
    await expect(row).toHaveCount(1);
    await expect(status).toContainText("Inbox 4 of 4");
    // The row goes back where it was, not onto the end.
    await expect(stage.getByRole("listitem").nth(1)).toContainText(
      "Weekly digest",
    );

    // The restored line holds, then the toast lifts away on its own.
    await expect(status).not.toContainText("undo window open", {
      timeout: 8000,
    });
  });

  test("light-box: a tile opens, an arrow moves, Escape returns to the tile", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/light-box");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const basin = stage.getByRole("button", {
      name: "Basin fog before sunrise",
    });
    const glasshouse = stage.getByRole("button", {
      name: "Fernworks glasshouse at noon",
    });

    await expect(status).toContainText("Four plates · pick one to open");

    await basin.click();
    const viewer = stage.getByRole("dialog", {
      name: "Basin fog before sunrise",
    });
    await expect(viewer).toBeVisible();
    await expect(basin).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Viewing Basin fog before sunrise");
    await expect(stage.getByText("1 / 4")).toBeVisible();
    // Focus lands on the panel, so the picture's name is read first.
    await expect(viewer).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(
      stage.getByRole("dialog", { name: "Fernworks glasshouse at noon" }),
    ).toBeVisible();
    await expect(status).toContainText("Viewing Fernworks glasshouse at noon");
    await expect(stage.getByText("2 / 4")).toBeVisible();
    await expect(stage.getByText("Fernworks · 12:05")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(status).toContainText("Four plates · pick one to open");
    await expect(stage.getByRole("dialog")).toHaveCount(0, { timeout: 5000 });
    // Focus returns to the tile of the picture that was being viewed.
    await expect(glasshouse).toBeFocused();
  });

  test("edit-bubble: Enter commits the edit and Escape restores the old value", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/edit-bubble");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const trigger = stage.getByRole("button", {
      name: "Edit Project name, currently Relay bench rebuild",
    });

    await expect(status).toContainText("Saved Relay bench rebuild · 4200");

    await trigger.click();
    const field = stage.getByLabel("Project name");
    await expect(field).toBeFocused();
    await field.fill("Relay bench teardown");
    await field.press("Enter");

    await expect(status).toContainText("Saved Relay bench teardown");
    const renamed = stage.getByRole("button", {
      name: "Edit Project name, currently Relay bench teardown",
    });
    await expect(renamed).toBeVisible();
    // Committing hands focus back to the value it just wrote.
    await expect(renamed).toBeFocused();

    // Escape is the way out that keeps nothing.
    const budget = stage.getByRole("button", {
      name: "Edit Monthly budget · USD, currently 4200",
    });
    await budget.click();
    const amount = stage.getByLabel("Monthly budget · USD");
    await amount.fill("9100");
    await amount.press("Escape");
    await expect(status).toContainText("Saved Relay bench teardown · 4200");
    await expect(budget).toBeVisible();
    await expect(budget).toBeFocused();
  });

  test("bell-tray: an arrival raises the count and Mark all read clears it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/bell-tray");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const bell = stage.getByRole("button", { name: /^Notifications, / });

    await expect(status).toContainText("2 unread of 3");
    await expect(bell).toHaveAttribute("aria-label", "Notifications, 2 unread");

    await stage.getByRole("button", { name: "Simulate arrival" }).click();
    await expect(bell).toHaveAttribute("aria-label", "Notifications, 3 unread");
    await expect(status).toContainText("3 unread of 4");

    await bell.click();
    const tray = stage.getByRole("region", { name: "Notifications" });
    await expect(tray).toBeVisible();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    await expect(
      tray.getByRole("button", { name: /^Sensor 12 drifting, now, unread/ }),
    ).toBeVisible();

    const markAll = tray.getByRole("button", { name: "Mark all read" });
    await markAll.click();
    await expect(status).toContainText("0 unread of 4");
    await expect(bell).toHaveAttribute("aria-label", "Notifications, 0 unread");
    // Nothing left to mark, so the control stands down.
    await expect(markAll).toBeDisabled();
    await expect(
      tray.getByRole("button", { name: /^Sensor 12 drifting, now\. Dismiss$/ }),
    ).toBeVisible();
  });

  test("typed-confirm: the wrong phrase keeps the button asleep, the right one wakes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/typed-confirm");
    const stage = stageOf(page);
    const status = demoStatus(stage);

    await expect(status).toContainText("Match 0/14");

    await stage.getByRole("button", { name: "Delete environment" }).click();
    const dialog = stage.getByRole("alertdialog", {
      name: "Delete this environment",
    });
    await expect(dialog).toBeVisible();
    const field = dialog.getByLabel("Type fernworks-prod to confirm");
    await expect(field).toBeFocused();
    const confirm = dialog.getByRole("button", { name: "Delete" });
    await expect(confirm).toBeDisabled();

    // A near miss is still a miss: ten characters agree, the button does not.
    await field.fill("fernworks-dev");
    await expect(status).toContainText("Match 10/14");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("That is not the name")).toBeVisible();
    await expect(confirm).toBeDisabled();

    await field.fill("fernworks-prod");
    await expect(status).toContainText("Match 14/14");
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(status).toContainText("fernworks-prod deleted");
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
    await expect(stage.getByText("Removed")).toBeVisible();
    await expect(
      stage.getByRole("button", { name: "Recreate environment" }),
    ).toBeFocused();
  });

  test("fab-fan: the fan opens, the arrows walk it, Enter starts the action", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/fab-fan");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const fab = stage.getByRole("button", { name: "New", exact: true });

    await expect(status).toContainText("Open the fan to start something");
    await expect(fab).toHaveAttribute("aria-expanded", "false");

    await fab.click();
    const menu = stage.getByRole("menu", { name: "New" });
    await expect(menu).toBeVisible();
    await expect(fab).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem")).toHaveCount(5);
    // The fan is opened from the trigger, so the first action takes focus.
    const transfer = menu.getByRole("menuitem", { name: "Transfer" });
    await expect(transfer).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const request = menu.getByRole("menuitem", { name: "Request" });
    await expect(request).toBeFocused();

    // Escape folds the fan without starting anything.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0, { timeout: 5000 });
    await expect(fab).toBeFocused();
    await expect(status).toContainText("Open the fan to start something");

    await fab.click();
    await expect(transfer).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(status).toContainText("Started Request");
    await expect(menu).toHaveCount(0, { timeout: 5000 });
    await expect(fab).toBeFocused();
  });

  test("keymap-sheet: ? opens the sheet, typing folds it down, Escape closes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/keymap-sheet");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const trigger = stage.getByRole("button", { name: /^Shortcuts/ });
    const sheet = stage.getByRole("dialog", { name: "Keyboard shortcuts" });
    const listed = stage.getByText(/shortcuts? listed$/);

    await expect(status).toContainText("Sheet closed · press ? to open");
    await expect(sheet).toHaveCount(0);

    // Focus is on the document, not in a field, so the hotkey is the sheet's.
    await page.keyboard.press("?");
    await expect(sheet).toBeVisible();
    await expect(status).toContainText("Sheet open");
    await expect(listed).toHaveText("10 shortcuts listed");
    const filter = sheet.getByLabel("Filter shortcuts");
    await expect(filter).toBeFocused();

    await filter.pressSequentially("link");
    await expect(status).toContainText("filter “link”");
    await expect(listed).toHaveText("1 shortcut listed", { timeout: 5000 });
    await expect(sheet.getByText("Insert link")).toBeVisible();

    // The hotkey stands down while the filter has the caret.
    await filter.press("?");
    await expect(filter).toHaveValue("link?");

    await filter.press("Escape");
    await expect(status).toContainText("Sheet closed");
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
    await expect(trigger).toBeFocused();
  });

  test("dock-player: scrolling past the seat sends the card to the corner", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/dock-player");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const frame = frameOf(stage);
    const returnHome = stage.getByRole("button", {
      name: "Return Bay 4 calibration to the article",
    });

    await expect(status).toContainText("Player inline");
    await expect(returnHome).toHaveCount(0);

    await scrollFrameTo(frame, 400);
    await expect(status).toContainText("Player docked");
    await expect(returnHome).toBeVisible();
    await expect(stage.getByText("Playing in the corner")).toBeVisible();

    // The docked picture is the way back, and it has a keyboard path.
    await returnHome.click();
    await expect(status).toContainText("Player inline", { timeout: 8000 });
    await expect(returnHome).toHaveCount(0, { timeout: 5000 });
  });

  test("share-tray: the tray opens and Copy link stamps its own cell", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/share-tray");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // Exact: the tray's own backdrop is named "Close share tray".
    const trigger = stage.getByRole("button", { name: "Share", exact: true });

    await expect(status).toContainText("Open the tray to share");

    await trigger.click();
    const tray = stage.getByRole("dialog", { name: "Share" });
    await expect(tray).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      tray.getByText("waylight.example/field/third-sweep"),
    ).toBeVisible();

    const copy = tray.getByRole("button", { name: "Copy link" });
    await expect(copy).toBeFocused();
    await copy.click();

    // Chromium refuses the clipboard write under Playwright, so the cell
    // stamps the documented fallback — "Copy failed" — rather than "Copied".
    // Either stamp is the component reporting an attempt, which is what is
    // under test here; the demo records copy as the target that was used.
    await expect(status).toContainText("Shared to Copy link");
    await expect(
      tray.getByRole("button", { name: /^Cop(ied|y failed)$/ }),
    ).toBeVisible();
    await expect(tray.locator("[role='status']")).toHaveText(
      /^(Link copied|Could not copy the link)$/,
    );

    await tray.getByRole("button", { name: "Fieldline" }).click();
    await expect(status).toContainText("Shared to Fieldline");

    await page.keyboard.press("Escape");
    await expect(tray).toHaveCount(0, { timeout: 5000 });
    await expect(trigger).toBeFocused();
  });

  test("consent-slab: Customise unfolds the switches and Reject all sinks the slab", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/consent-slab");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const slab = stage.getByRole("region", { name: "Your data choices" });
    const customise = slab.getByRole("button", { name: "Customise" });
    // The switches live in a panel that is measured, not reserved: a folded
    // panel is zero tall, so the panel's own height is the reveal.
    const panelHeight = () =>
      slab
        .locator("[role='switch']")
        .first()
        .evaluate(
          (element) =>
            element.closest("div.overflow-hidden")?.getBoundingClientRect()
              .height ?? -1,
        );

    await expect(status).toContainText("Awaiting a choice");
    await expect(customise).toHaveAttribute("aria-expanded", "false");
    expect(await panelHeight()).toBeLessThan(1);

    await customise.click();
    await expect(customise).toHaveAttribute("aria-expanded", "true");
    await expect.poll(panelHeight, { timeout: 5000 }).toBeGreaterThan(60);
    const necessary = slab.getByRole("switch", { name: "Necessary" });
    await expect(necessary).toHaveAttribute("aria-checked", "true");
    await expect(necessary).toHaveAttribute("aria-disabled", "true");
    const analytics = slab.getByRole("switch", { name: "Analytics" });
    await expect(analytics).toHaveAttribute("aria-checked", "false");

    // Refusing everything still grants what the site cannot run without.
    await slab.getByRole("button", { name: "Reject all" }).click();
    await expect(status).toContainText("Allowed Necessary");
    // The stamp itself, not the sr-only line that repeats it underneath.
    await expect(stage.getByText("Necessary only").first()).toBeVisible();
    // The stamp holds, then the slab sinks and leaves its chip behind.
    await expect(
      stage.getByRole("button", { name: "Preferences" }),
    ).toBeVisible({ timeout: 8000 });
    await expect(slab).toHaveCount(0);
  });
});

/**
 * A state that only lives for a beat — a 700ms save, say — is not something a
 * poll can prove it saw, and a miss would be a fact about the polling interval
 * rather than about the component. The trail is recorded in the page instead,
 * by a MutationObserver installed before the run starts, and read back after.
 */
const recordTrail = async (target: Locator): Promise<void> => {
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
    (window as unknown as { __trail: string[] }).__trail = trail;
  });
};

/** Everything the recorded node has said so far, oldest first. */
const trailOf = (page: Page) => async (): Promise<string[]> =>
  page.evaluate(
    () => (window as unknown as { __trail?: string[] }).__trail ?? [],
  );

test.describe("feedback", () => {
  test("transfer-bar: the queue runs, one upload drops, and Retry finishes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/transfer-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);

    await expect(status).toContainText("0 of 3 · ready");

    await stage.getByRole("button", { name: "Start upload" }).click();
    await expect(status).toContainText("uploading");

    // The second file drops its connection the first time it is tried, and the
    // queue stops with it rather than stepping over it.
    const retry = stage.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible({ timeout: 15000 });
    await expect(status).toContainText("1 of 3 · one stopped");
    const stopped = stage.getByRole("progressbar", {
      name: "fernworks-canopy-plan.pdf",
    });
    await expect(stopped).toHaveAttribute(
      "aria-valuetext",
      /^Stopped at \d+ percent$/,
    );
    await expect(stage.getByText("Failed")).toBeVisible();

    await retry.click();
    await expect(status).toContainText("3 of 3 · all uploaded", {
      timeout: 15000,
    });
    // A finished bar folds its body away, so no track is left anywhere.
    await expect(stage.getByRole("progressbar")).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test("save-mark: a keystroke goes dirty, then saving, then saved", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/save-mark");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The chip is a status region of its own, and it comes first in the demo.
    const mark = stage.locator("[role='status']").first();
    const note = stage.getByLabel("Fernworks field note");

    await expect(status).toContainText("idle · 0 written");
    await expect(mark).toContainText("No changes");

    await recordTrail(status);
    await note.pressSequentially(" Held.");

    await expect(mark).toContainText("Unsaved changes");
    await expect(status).toContainText("saved · 1 written", { timeout: 8000 });
    await expect(mark).toContainText("Saved just now");

    // Saving lasts 700ms, which a poll may or may not land on; the trail was
    // recorded in the page, so the sequence is the component's own.
    const states = (await trailOf(page)()).map((line) => line.split(" · ")[1]);
    expect(states).toEqual(["idle", "dirty", "saving", "saved"]);

    // The demo drops its second save, so the error path and Retry are both
    // reachable from the same field.
    await note.pressSequentially("!");
    await expect(status).toContainText("error", { timeout: 8000 });
    await expect(mark).toContainText("Save failed");

    await mark.getByRole("button", { name: "Retry" }).click();
    await expect(status).toContainText("saved · 2 written", { timeout: 8000 });
    await expect(mark).toContainText("Saved just now");
  });

  test("expiry-ring: the digits drain, Pause holds them, Resume sets them going", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/expiry-ring");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const ring = stage.getByRole("timer", {
      name: "Waylight verification code",
    });
    // The face is a stack of rolling digit strips; the ring's own reading of
    // it is the sr-only line beside the label.
    const spoken = stage.getByText(/seconds remaining$/);
    const left = async (): Promise<number> =>
      Number(/(\d+)s left/.exec((await status.textContent()) ?? "")?.[1] ?? -1);

    await expect(ring).toBeVisible();
    await expect(status).toContainText("30s left · sent 1×");
    await expect(spoken).toHaveText("30 seconds remaining");
    await expect(stage.getByText("Expires in")).toBeVisible();

    // Draining, not merely mounted.
    await expect.poll(left, { timeout: 8000 }).toBeLessThanOrEqual(28);

    await stage.getByRole("button", { name: "Pause" }).click();
    await expect(stage.getByText("Paused")).toBeVisible();
    const held = await left();
    await expect(spoken).toHaveText(`${held} seconds remaining`);
    // The ticker is cleared, not ignored: nothing moves at all while it is off.
    await page.waitForTimeout(900);
    expect(await left()).toBe(held);
    await expect(spoken).toHaveText(`${held} seconds remaining`);

    await stage.getByRole("button", { name: "Resume" }).click();
    await expect(stage.getByText("Expires in")).toBeVisible();
    await expect.poll(left, { timeout: 8000 }).toBeLessThan(held);
    // Resend belongs to the expired state, a full 30s window away, which is
    // outside this test's budget — the ring is still counting here.
    await expect(stage.getByRole("button", { name: "Resend" })).toHaveCount(0);
  });

  test("copy-chip: a press copies, or hands the value to Ctrl/Cmd+C when the clipboard refuses", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/copy-chip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The chip's accessible name is the very thing under test, so it is
    // reached by its place in the demo: the first control on the plate.
    const chip = stage.getByRole("button").first();
    // The chip carries a status of its own, ahead of the demo's line.
    const said = stage.locator("[role='status']").first();

    await expect(chip).toHaveText("Copy");
    await expect(said).toHaveText("");
    await expect(status).toContainText("nothing copied yet");

    await chip.click();

    // Chromium under Playwright refuses the write, so the documented fallback
    // is the outcome on test here; either way the chip reports its attempt.
    await expect(said).toHaveText(
      /^(Copied wl_live_7f3ca2b91d4e|Copy blocked\. Press Ctrl\/Cmd\+C)$/,
      { timeout: 5000 },
    );
    const blocked = ((await said.textContent()) ?? "").startsWith(
      "Copy blocked",
    );

    if (blocked) {
      // A refusal is not a shrug: the value is selected in a field over the
      // chip's own box, one keystroke away from the clipboard.
      await expect(chip).toHaveText("Press Ctrl/Cmd+C");
      const fallback = stage.getByLabel("Copy value — Press Ctrl/Cmd+C");
      await expect(fallback).toBeFocused();
      await expect(fallback).toHaveValue("wl_live_7f3ca2b91d4e");
      // Nothing was copied, and the demo does not claim otherwise.
      await expect(status).toContainText("nothing copied yet");

      await fallback.press("Escape");
      await expect(chip).toHaveText("Copy");
      await expect(said).toHaveText("");
    } else {
      await expect(chip).toHaveText("Copied");
      await expect(status).toContainText("copied wl_live_7f3ca2b91d4e");
      // The stamp reverts on its own after the timeout.
      await expect(chip).toHaveText("Copy", { timeout: 5000 });
    }
  });

  test("task-tick: checking strikes a row and sinks it into Done", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/task-tick");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rows = stage.getByRole("listitem");
    const canopy = stage.getByRole("checkbox", {
      name: "Set the canopy baseline",
    });
    const label = stage.getByTitle("Set the canopy baseline");

    await expect(status).toContainText("2 of 5 done");
    // Open work above the divider, done work below it: this row starts on top.
    await expect(rows.first()).toContainText("Set the canopy baseline");
    await expect(canopy).not.toBeChecked();

    // The box is sr-only and its label owns the hit area, so Space is the path.
    await canopy.press(" ");
    await expect(canopy).toBeChecked();
    await expect(status).toContainText("3 of 5 done");
    // Struck through and retired to the done tone.
    await expect(label).toHaveClass(/text-ink-3/);
    await expect(stage.getByText("Done", { exact: true })).toBeVisible();
    // The row holds its place for a beat, then sinks past the divider.
    await expect(rows.last()).toContainText("Set the canopy baseline", {
      timeout: 5000,
    });

    await canopy.press(" ");
    await expect(canopy).not.toBeChecked();
    await expect(status).toContainText("2 of 5 done");
    await expect(label).not.toHaveClass(/text-ink-3/);
    await expect(rows.first()).toContainText("Set the canopy baseline", {
      timeout: 5000,
    });
  });

  test("quota-meter: adding crosses the warn line, then goes over the quota", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/quota-meter");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const meter = stage.getByRole("meter", { name: "Gaugeworks storage" });
    const add = stage.getByRole("button", { name: "Add 35 GB" });

    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "120 of 250 GB used, 48 percent",
    );
    await expect(stage.getByText("Within quota")).toBeVisible();
    await expect(status).toContainText("Using 120 of 250 GB");

    // 190 of 250 is 76%: the warn line at 80% is a line, not a mood.
    await add.click();
    await add.click();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "190 of 250 GB used, 76 percent",
    );
    await expect(stage.getByText("Within quota")).toBeVisible();

    await add.click();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "225 of 250 GB used, 90 percent",
    );
    await expect(stage.getByText("Near limit")).toBeVisible();
    await expect(status).toContainText("Using 225 of 250 GB");

    // A meter may not report past its maximum, so the overage goes in the
    // valuetext while valuenow stays inside the quota.
    await add.click();
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      "260 of 250 GB used, 10 GB over the quota",
    );
    await expect(meter).toHaveAttribute("aria-valuenow", "250");
    await expect(stage.getByText("Over by 10 GB")).toBeVisible();
    await expect(status).toContainText("Using 260 of 250 GB");
  });

  test("presence-row: a face arrives, the chip takes the overflow, a face leaves", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/presence-row");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The group's name is the sentence it speaks, and the sentence changes.
    const row = stage.getByRole("group", { name: /on the Fernworks brief$/ });
    const faces = stage.locator("li[title]");
    const join = stage.getByRole("button", { name: "Someone joins" });
    const leave = stage.getByRole("button", { name: "Someone leaves" });

    await expect(faces).toHaveCount(3);
    await expect(row).toHaveAttribute(
      "aria-label",
      "Ana Reyes, Bo Fenwick and 1 other are on the Fernworks brief",
    );
    await expect(status).toContainText("3 on the brief");

    await join.click();
    await expect(faces).toHaveCount(4);
    await expect(stage.getByTitle("Milo Trant")).toBeVisible();
    await expect(status).toContainText("4 on the brief");

    // Past max the fifth face does not squeeze in: it goes behind the chip.
    await join.click();
    const overflow = stage.getByRole("button", { name: "Show 1 more person" });
    await expect(overflow).toBeVisible();
    await expect(faces).toHaveCount(4);
    await expect(row).toHaveAttribute(
      "aria-label",
      "Ana Reyes, Bo Fenwick and 3 others are on the Fernworks brief",
    );
    await expect(status).toContainText("5 on the brief");

    // The chip is a real button, and it knows who it is holding.
    await overflow.click();
    await expect(status).toContainText("also Nell Okoro");

    await leave.click();
    await expect(overflow).toHaveCount(0, { timeout: 5000 });
    await expect(status).toContainText("4 on the brief");

    await leave.click();
    await expect(stage.getByTitle("Milo Trant")).toHaveCount(0, {
      timeout: 5000,
    });
    await expect(faces).toHaveCount(3);
    await expect(status).toContainText("3 on the brief");
  });

  test("typing-pill: the pill arrives with a typist and names the pair", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/typing-pill");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The pill's own live region, which is mounted whether or not it shows.
    const said = stage.locator("[role='status']").first();
    const pill = stage
      .locator("div[aria-hidden]")
      .filter({ hasText: "typing" });
    const ana = stage.getByRole("button", { name: "Ana" });
    const bo = stage.getByRole("button", { name: "Bo" });

    await expect(ana).toHaveAttribute("aria-pressed", "true");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Ana is typing");
    await expect(said).toHaveText("Ana is typing");
    await expect(status).toContainText("Ana is typing");

    // A second typist does not lengthen the caption: one name, then a count.
    await bo.click();
    await expect(bo).toHaveAttribute("aria-pressed", "true");
    await expect(said).toHaveText("Ana and 1 other are typing");
    await expect(pill).toContainText("Ana and 1 other are typing");
    await expect(status).toContainText("Ana and 1 other are typing");

    // The caption keeps roster order however the buttons were pressed.
    await ana.click();
    await expect(said).toHaveText("Bo is typing");
    await expect(status).toContainText("Bo is typing");

    await bo.click();
    await expect(pill).toHaveCount(0, { timeout: 5000 });
    // The region empties rather than holding a stale sentence.
    await expect(said).toHaveText("");
    await expect(status).toContainText("No one is typing");
  });

  test("load-hem: the hem recovers a failed page and stamps the end", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/load-hem");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const frame = frameOf(stage);
    const rows = stage
      .getByRole("list", { name: "Basinworks listings" })
      .getByRole("listitem");

    await expect(rows).toHaveCount(8);
    await expect(status).toContainText("Page 1 of 3 · 8 listings");

    // The hem crossing the fold is what asks for the next page — and the demo
    // drops that page the first time it is asked for.
    await scrollFrameTo(frame, 99_999);
    const retry = stage.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible({ timeout: 8000 });
    await expect(stage.getByText("That page did not load.")).toBeVisible();
    // A failed page keeps everything already loaded.
    await expect(rows).toHaveCount(8);
    await expect(status).toContainText("Page 1 of 3 · 8 listings");

    await retry.click();
    await expect(rows).toHaveCount(16, { timeout: 8000 });
    await expect(status).toContainText("Page 2 of 3 · 16 listings");
    await expect(retry).toHaveCount(0);

    await scrollFrameTo(frame, 99_999);
    await expect(rows).toHaveCount(24, { timeout: 8000 });
    await expect(status).toContainText("Page 3 of 3 · 24 listings");
    // The last page retires the loader and stamps the end.
    await expect(stage.getByText("That is everything")).toBeVisible();
  });

  test("offline-bar: the bar drops, the second check gets through, and it lifts", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/offline-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The bar lives inside a permanent status region: the region is always
    // there, and what changes is what it is holding.
    const bar = stage.locator("[role='status']").first();

    await expect(status).toContainText("Connection Online");
    await expect(bar).toHaveText("");

    await stage.getByRole("switch", { name: "Simulate offline" }).click();
    await expect(bar).toContainText("No connection");
    await expect(bar).toContainText(/retrying in \ds/);
    await expect(status).toContainText("Offline · 0 attempts");

    const retry = bar.getByRole("button", { name: "Retry now" });
    await retry.click();
    // The check takes 700ms, and the first one does not get through.
    await expect(status).toContainText("Offline · 1 attempt", {
      timeout: 8000,
    });
    await expect(bar).toContainText("No connection");

    await retry.click();
    await expect(status).toContainText("Connection Back online", {
      timeout: 8000,
    });
    await expect(bar).toHaveText("Back online");
    // A relief, not a celebration: the bar holds its beat, then lifts away.
    await expect(bar).toHaveText("", { timeout: 8000 });
    await expect(status).toContainText("Connection Back online");
  });
});

/**
 * The data wing draws numbers, so its outcomes are numbers: a percentage a ring
 * crossed, the day a bar was nudged onto, the row that rose to the top. Each
 * test drives the mechanic the component advertises and reads the result off
 * the demo's status line and the ARIA the component publishes about itself.
 */

/** A laid-out box's width, measured rather than assumed. */
const widthOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => element.getBoundingClientRect().width);

/**
 * How far a node has been turned, in degrees, read off the transform its
 * spring settled on — the sign is dropped, so a half turn is 180 either way.
 */
const turnOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    const matrix = new DOMMatrix(transform);
    return Math.round(
      Math.abs((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
    );
  });

test.describe("data", () => {
  test("uptime-strip: the strip opens on today and the arrows walk back through it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/uptime-strip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const strip = stage.getByRole("listbox", {
      name: "Gaugeworks API daily status, oldest first",
    });

    await expect(status).toContainText("Hover or focus a strip to read a day");

    // Focus lands on today, the day the strip is actually about.
    await strip.focus();
    await expect(strip).toHaveAttribute("aria-activedescendant", /-day-89$/);
    await expect(status).toContainText("Gaugeworks API · Jun 30 · up");
    const today = strip.getByRole("option", { name: "Jun 30, Operational" });
    await expect(today).toHaveAttribute("aria-selected", "true");

    // Left walks back a day at a time, and the reading names the new date.
    await strip.press("ArrowLeft");
    await expect(strip).toHaveAttribute("aria-activedescendant", /-day-88$/);
    await expect(status).toContainText("Gaugeworks API · Jun 29 · up");
    await expect(today).toHaveAttribute("aria-selected", "false");

    // Home is the oldest day the strip holds — ninety days back.
    await strip.press("Home");
    await expect(strip).toHaveAttribute("aria-activedescendant", /-day-0$/);
    await expect(status).toContainText("Gaugeworks API · Apr 2 · up");

    // Escape drops the reading rather than leaving a stale day selected.
    await strip.press("Escape");
    await expect(status).toContainText("Hover or focus a strip to read a day");
    await expect(strip).not.toHaveAttribute("aria-activedescendant", /-day-/);
  });

  test("poll-bars: a vote reveals the bars, and the vote can be moved", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/poll-bars");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const poll = stage.getByRole("radiogroup", {
      name: "Which Fernworks feature should ship first?",
    });
    const gear = poll.getByRole("radio", { name: /^Gear checklists/ });
    const trails = poll.getByRole("radio", { name: /^Offline trail maps/ });
    // Each row draws its own share inside itself, so the bar is the row's.
    const gearBar = widthOf(gear.locator("span.origin-left"));

    // Before the vote the options are bare labels and no bar is drawn.
    await expect(status).toContainText("No vote yet · 1,184 votes");
    await expect(gear).toHaveAttribute("aria-label", "Gear checklists");
    expect(await gearBar()).toBeLessThan(1);

    await gear.click();
    await expect(gear).toHaveAttribute("aria-checked", "true");
    await expect(status).toContainText("Gear checklists · 1,185 votes");
    // The reader's own vote is counted into the share the row now reports.
    await expect(gear).toHaveAttribute(
      "aria-label",
      "Gear checklists, 27 percent, 319 votes",
    );
    await expect(trails).toHaveAttribute(
      "aria-label",
      "Offline trail maps, 35 percent, 412 votes",
    );
    await expect.poll(gearBar, { timeout: 5000 }).toBeGreaterThan(20);

    // Moving the vote moves the one extra ballot; the total does not climb.
    await trails.click();
    await expect(trails).toHaveAttribute("aria-checked", "true");
    await expect(gear).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("Offline trail maps · 1,185 votes");
    await expect(trails).toHaveAttribute(
      "aria-label",
      "Offline trail maps, 35 percent, 413 votes",
    );
    await expect(gear).toHaveAttribute(
      "aria-label",
      "Gear checklists, 27 percent, 318 votes",
    );
  });

  test("delta-tile: the next month rolls the values and turns the arrow over", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/delta-tile");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const revenue = stage.getByRole("button", { name: /^Revenue,/ });
    // The badge is the tile's one round-cornered pill: arrow, then delta.
    const badge = revenue.locator("span.rounded-full");
    const arrow = revenue.locator('svg[viewBox="0 0 12 12"]').locator("..");

    await expect(status).toContainText(
      "April · Revenue -1.6% · Active users +8.7% · Churn +9.1%",
    );
    await expect(revenue).toHaveAttribute(
      "aria-label",
      "Revenue, $48,157, down 1.6 percent from $48,957 last period. Trend over 12 points, low $41,114, high $49,651.",
    );
    // April's revenue fell, so the arrow stands on its head in the danger tone.
    await expect.poll(turnOf(arrow), { timeout: 5000 }).toBe(180);
    await expect(badge).toHaveClass(/text-danger/);

    await stage.getByRole("button", { name: "Load next month" }).click();

    await expect(status).toContainText(
      "May · Revenue +8.4% · Active users -1.9% · Churn +8.3%",
    );
    // The whole tile rolls: value, prior period, and the range under the trace.
    await expect(revenue).toHaveAttribute(
      "aria-label",
      "Revenue, $52,204, up 8.4 percent from $48,157 last period. Trend over 12 points, low $42,325, high $52,204.",
    );
    // Up, and the tone turns with it.
    await expect.poll(turnOf(arrow), { timeout: 5000 }).toBe(0);
    await expect(badge).toHaveClass(/text-success/);
    await expect(badge).not.toHaveClass(/text-danger/);

    // Its neighbour turned the other way in the same press.
    const users = stage.getByRole("button", { name: /^Active users,/ });
    await expect(users).toHaveAttribute(
      "aria-label",
      "Active users, 15,799, down 1.9 percent from 16,112 last period. Trend over 12 points, low 13,862, high 16,609.",
    );
    await expect(users.locator("span.rounded-full")).toHaveClass(/text-danger/);
  });

  test("activity-rings: a press takes the Move ring past its goal and onto a second lap", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/activity-rings");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const figure = stage.getByRole("img", {
      name: /^Coldbrook daily activity\./,
    });
    // Outer group carries the twelve-o'clock turn; each ring is a group in it.
    const moveRing = figure.locator("g > g").first();

    await expect(status).toContainText("Move 92% · Exercise 73% · Stand 67%");
    await expect(figure).toHaveAttribute(
      "aria-label",
      "Coldbrook daily activity. Move: 480 of 520, 92 percent. Exercise: 22 of 30, 73 percent. Stand: 8 of 12, 67 percent.",
    );
    // A ring under its goal is one track and one arc.
    await expect(moveRing.locator("circle")).toHaveCount(2);

    await stage.getByRole("button", { name: "+60 kcal" }).click();

    // 540 of 520: the ring closes and keeps going rather than pinning at 100.
    await expect(status).toContainText("Move 104%");
    await expect(figure).toHaveAttribute(
      "aria-label",
      /Move: 540 of 520, 104 percent\./,
    );
    // The surplus is drawn as a second lap laid over the first.
    await expect(moveRing.locator("circle")).toHaveCount(3, { timeout: 5000 });
    // The rings it did not touch are untouched.
    await expect(status).toContainText("Exercise 73% · Stand 67%");

    // The legend reports the raw figure beside the ring it belongs to.
    await expect(
      stage.getByRole("button", { name: "Move 540 / 520" }),
    ).toBeVisible();
  });

  test("budget-bar: the keyboard reads a segment, and a chip drops one out of the bar", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/budget-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const bar = stage.getByRole("group", { name: "Gaugeworks · June" });
    const salaries = bar.getByRole("button", { name: /^Salaries,/ });
    const cloud = bar.getByRole("button", { name: /^Cloud,/ });
    const tooling = bar.getByRole("button", { name: /^Tooling,/ });

    await expect(status).toContainText(
      "Read a segment with the pointer or the arrow keys",
    );
    await expect(salaries).toHaveAttribute(
      "aria-label",
      "Salaries, $18,400, 54 percent",
    );

    // Focus is a reading, and the arrows walk the bar left to right.
    await salaries.focus();
    await expect(status).toContainText("Salaries · $18,400");
    await page.keyboard.press("ArrowRight");
    await expect(cloud).toBeFocused();
    await expect(status).toContainText("Cloud · $7,350");

    // The pointer outranks focus: it reads whichever segment it is over.
    await bar.getByRole("button", { name: /^Travel,/ }).hover();
    await expect(status).toContainText("Travel · $2,480");
    // Off the bar, the reading falls back to the segment focus is holding.
    await page.mouse.move(0, 0);
    await expect(status).toContainText("Cloud · $7,350");

    // Enter pins that reading, so it outlives both the pointer and focus.
    await cloud.press("Enter");
    await expect(cloud).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Cloud · $7,350");

    // The legend chip is a toggle: turning Cloud off takes it out of the bar.
    const chip = stage.getByRole("button", {
      name: "Cloud, $7,350",
      exact: true,
    });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(cloud).toHaveAttribute("aria-label", "Cloud, $7,350, hidden");
    await expect(cloud).toBeDisabled();
    await expect.poll(widthOf(cloud), { timeout: 5000 }).toBeLessThan(1);
    // A category that leaves the bar takes its pinned reading with it, rather
    // than leaving the demo holding a segment that is no longer drawn.
    await expect(status).toContainText(
      "Read a segment with the pointer or the arrow keys",
    );

    // The rest of the bar re-flows into the room it left: the shares are
    // recut against the smaller total, and the arrows skip the empty seat.
    await expect(salaries).toHaveAttribute(
      "aria-label",
      "Salaries, $18,400, 69 percent",
    );
    await expect(tooling).toHaveAttribute(
      "aria-label",
      "Tooling, $3,120, 12 percent",
    );
    await salaries.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tooling).toBeFocused();
    await expect(status).toContainText("Tooling · $3,120");
  });

  test("crosshair-chart: the crosshair opens on the last sample and the arrows scrub it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/crosshair-chart");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const plot = stage.getByRole("slider", { name: "Fernworks sessions" });

    await expect(status).toContainText("Hover or arrow-key the trace");
    // Unread, the slider speaks the series rather than a point.
    await expect(plot).toHaveAttribute(
      "aria-valuetext",
      "Fernworks sessions: 30 points, 2,487 to 4,464",
    );

    await plot.focus();
    await expect(plot).toHaveAttribute("aria-valuenow", "29");
    await expect(plot).toHaveAttribute("aria-valuetext", "Apr 30, 4,464");
    await expect(status).toContainText("Apr 30 · 4,464 sessions");

    await plot.press("ArrowLeft");
    await expect(plot).toHaveAttribute("aria-valuenow", "28");
    await expect(status).toContainText("Apr 29 · 4,383 sessions");

    await plot.press("Home");
    await expect(plot).toHaveAttribute("aria-valuenow", "0");
    await expect(plot).toHaveAttribute("aria-valuetext", "Apr 1, 2,487");
    await expect(status).toContainText("Apr 1 · 2,487 sessions");

    // The pointer snaps to the nearest sample rather than reading between two.
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await expect(plot).toHaveAttribute("aria-valuenow", "29");
    await expect(status).toContainText("Apr 30 · 4,464 sessions");

    // Escape gives the reading up rather than latching the last point.
    await plot.press("Escape");
    await expect(status).toContainText("Hover or arrow-key the trace");
  });

  test("gantt-lane: nudging a bar moves its dates and pushes what waits on it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gantt-lane");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The chart keeps its own live readout; the demo's line is the one after.
    const moved = stage.locator("[role='status']").first();
    const build = stage.getByRole("button", { name: "Build", exact: true });
    // Each bar's dates are the sr-only text its aria-describedby points at.
    const buildDates = stage.locator('[id$="-dates-build"]');
    const reviewDates = stage.locator('[id$="-dates-review"]');

    await expect(status).toContainText("Hover a bar, or drag it to a new day");
    await expect(buildDates).toHaveText("Apr 9 to Apr 15");
    await expect(reviewDates).toHaveText("Apr 15 to Apr 18");
    // Nothing has been moved, so the chart has nothing to announce.
    await expect(moved).toHaveText("");

    // Focusing a bar reads it out; the demo names it and its window.
    await build.focus();
    await expect(status).toContainText("Build · Apr 9 – Apr 15");

    await build.press("ArrowRight");
    await expect(buildDates).toHaveText("Apr 10 to Apr 16", { timeout: 5000 });
    await expect(status).toContainText("Build · Apr 10 – Apr 16");
    await expect(moved).toHaveText("Build moved to Apr 10 through Apr 16");

    // Review cannot start before Build ends, so it is pushed along with it —
    // and says so in its own description, not just in the picture.
    await expect(reviewDates).toHaveText("Apr 16 to Apr 19");
    // Copy runs beside Build rather than after it, so it does not move.
    await expect(stage.locator('[id$="-dates-copy"]')).toHaveText(
      "Apr 10 to Apr 14",
    );

    // The bar itself steps back, but the push is one-way: a dependency that
    // has been given room keeps it, so a re-planned chain does not silently
    // re-compress under the bar that moved it.
    await build.press("ArrowLeft");
    await expect(buildDates).toHaveText("Apr 9 to Apr 15", { timeout: 5000 });
    await expect(status).toContainText("Build · Apr 9 – Apr 15");
    await expect(moved).toHaveText("Build moved to Apr 9 through Apr 15");
    await expect(reviewDates).toHaveText("Apr 16 to Apr 19");

    // Down walks the lanes without moving anything.
    await build.press("ArrowDown");
    await expect(
      stage.getByRole("button", { name: "Copy pass", exact: true }),
    ).toBeFocused();
    await expect(status).toContainText("Copy pass · Apr 10 – Apr 14");
  });

  test("sort-table: a header sorts, reverses, and hands the table back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/sort-table");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const table = stage.getByRole("table", { name: "Basinworks properties" });
    const property = table.getByRole("columnheader", { name: "Property" });
    const rent = table.getByRole("columnheader", { name: "Rent" });
    /** Row 0 is the header; the first body row is the one that answers. */
    const topRow = table.getByRole("row").nth(1);

    // The table opens sorted by rent, dearest first.
    await expect(status).toContainText("Sorted by Rent · descending");
    await expect(rent).toHaveAttribute("aria-sort", "descending");
    await expect(property).toHaveAttribute("aria-sort", "none");
    await expect(topRow).toContainText("Salt Yard");

    await property.getByRole("button", { name: "Property" }).click();
    await expect(property).toHaveAttribute("aria-sort", "ascending");
    await expect(rent).toHaveAttribute("aria-sort", "none");
    await expect(status).toContainText("Sorted by Property · ascending");
    await expect(topRow).toContainText("Alder Court", { timeout: 5000 });

    // A second press reverses the same column rather than starting over.
    await property.getByRole("button", { name: "Property" }).click();
    await expect(property).toHaveAttribute("aria-sort", "descending");
    await expect(status).toContainText("Sorted by Property · descending");
    await expect(topRow).toContainText("Verge House", { timeout: 5000 });

    // A third gives the table back in the order it was handed.
    await property.getByRole("button", { name: "Property" }).click();
    await expect(property).toHaveAttribute("aria-sort", "none");
    await expect(status).toContainText("Source order");
    await expect(topRow).toContainText("Alder Court", { timeout: 5000 });
    await expect(table.getByRole("row").nth(2)).toContainText("Kiln Row");
  });

  test("waterfall-steps: a column reads its own delta and the total it lands on", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/waterfall-steps");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const receipts = stage.getByRole("button", {
      name: "Receipts, up $18,400, running total $60,400",
    });
    const payroll = stage.getByRole("button", {
      name: "Payroll, down $9,600, running total $50,800",
    });

    await expect(status).toContainText("Hover or arrow-key a column");

    // The pointer reads a column: what it added, and where it left the balance.
    await receipts.hover();
    await expect(status).toContainText("Receipts · +$18,400 · $60,400");

    // The arrows walk the same columns, and a fall is read as a fall.
    await payroll.focus();
    await expect(status).toContainText("Payroll · −$9,600 · $50,800");
    await payroll.press("ArrowRight");
    await expect(
      stage.getByRole("button", {
        name: "Grants, up $6,200, running total $57,000",
      }),
    ).toBeFocused();
    await expect(status).toContainText("Grants · +$6,200 · $57,000");

    // End is the closing balance — a total, so it has no delta of its own.
    await page.keyboard.press("End");
    await expect(
      stage.getByRole("button", { name: "Closing, $45,200" }),
    ).toBeFocused();
    await expect(status).toContainText("Closing · $45,200");

    await page.keyboard.press("Home");
    await expect(
      stage.getByRole("button", { name: "Opening, $42,000" }),
    ).toBeFocused();
    await expect(status).toContainText("Opening · $42,000");
  });

  test("range-histogram: the thumbs narrow the band and push rather than cross", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/range-histogram");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const low = stage.getByRole("slider", { name: "Basinworks rent minimum" });
    const high = stage.getByRole("slider", { name: "Basinworks rent maximum" });

    await expect(status).toContainText("$1,200 – $2,400 · 1405 of 1841 homes");
    await expect(low).toHaveAttribute("aria-valuenow", "1200");
    await expect(high).toHaveAttribute("aria-valuenow", "2400");

    // A quarter-bin a press: three of them clear the $1,200 band entirely.
    await low.focus();
    for (let i = 0; i < 3; i += 1) await low.press("ArrowRight");
    await expect(low).toHaveAttribute("aria-valuenow", "1275");
    await expect(low).toHaveAttribute("aria-valuetext", "$1,275");
    await expect(status).toContainText("$1,275 – $2,400 · 1299 of 1841 homes");

    await high.focus();
    for (let i = 0; i < 3; i += 1) await high.press("ArrowLeft");
    await expect(high).toHaveAttribute("aria-valuenow", "2325");
    await expect(status).toContainText("$1,275 – $2,325 · 1214 of 1841 homes");

    // Shift takes ten steps at a time — enough to run the low thumb into the
    // high one, which it pushes along rather than passing through.
    await low.focus();
    for (let i = 0; i < 5; i += 1) await low.press("Shift+ArrowRight");
    await expect(low).toHaveAttribute("aria-valuenow", "2525");
    await expect(high).toHaveAttribute("aria-valuenow", "2525");
    await expect(status).toContainText("$2,525 – $2,525 · 0 of 1841 homes");
    // The low thumb's ceiling is its partner, so the pair can never invert.
    await expect(low).toHaveAttribute("aria-valuemax", "2525");

    // Backing off moves only the thumb that was pressed.
    await low.press("ArrowLeft");
    await expect(low).toHaveAttribute("aria-valuenow", "2500");
    await expect(high).toHaveAttribute("aria-valuenow", "2525");
    await expect(status).toContainText("$2,500 – $2,525 · 0 of 1841 homes");
  });
});

/**
 * The text wing works on the words themselves — a passage that folds, a term
 * that explains itself, a diff a reader applies in place — so its outcomes are
 * what the passage now says, the count it is down to, or the height it moved
 * to. Each test drives the mechanic and reads the result off the demo's status
 * line, the component's own reading of itself, or a measured box.
 */

/** A laid-out box's height, measured rather than assumed. */
const heightOf = (target: Locator) => async (): Promise<number> =>
  target.evaluate((element) => element.getBoundingClientRect().height);

/**
 * An inline term wraps across lines, and the union of its fragments has a
 * centre that lands on neither — so the pointer is put inside its first line
 * box rather than at the middle of a rectangle the word does not occupy.
 */
const hoverInline = async (page: Page, target: Locator): Promise<void> => {
  await target.scrollIntoViewIfNeeded();
  const spot = await target.evaluate((element) => {
    const rect = element.getClientRects()[0];
    if (!rect) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  expect(spot).not.toBeNull();
  if (!spot) return;
  await page.mouse.move(spot.x, spot.y);
};

test.describe("text", () => {
  test("diff-lines: accepting a hunk drops the count, and Result shows the edit", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/diff-lines");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The passage keeps its own reading of the review, ahead of the demo's.
    const left = stage.locator("[role='status']").first();
    const ghosts = stage.locator("del");

    await expect(status).toContainText("2 of 2 changes to review");
    await expect(left).toHaveText("2 of 2 changes left to review");
    // Two hunks, each still showing the wording it would replace.
    await expect(ghosts).toHaveCount(2);

    const accept = stage.getByRole("button", { name: "Accept change 1" });
    await expect(accept).toHaveAttribute("aria-pressed", "false");
    await accept.click();

    await expect(status).toContainText("1 of 2 changes to review");
    await expect(left).toHaveText("1 of 2 changes left to review");
    // Applying a hunk drops its ghost and leaves the new wording behind.
    await expect(ghosts).toHaveCount(1, { timeout: 5000 });
    // The same control reverses itself, so a mistaken accept is not final.
    await expect(
      stage.getByRole("button", { name: "Restore change 1" }),
    ).toHaveAttribute("aria-pressed", "true");

    const result = stage.getByRole("switch", { name: "Result" });
    await expect(result).toHaveAttribute("aria-checked", "false");
    await result.click();
    await expect(result).toHaveAttribute("aria-checked", "true");
    await expect(left).toHaveText("Showing the result");
    // The result is the edit as it would read: no ghosts, nothing left to press.
    await expect(ghosts).toHaveCount(0, { timeout: 5000 });
    await expect(stage.getByRole("button", { name: /change \d$/ })).toHaveCount(
      0,
    );
    // The demo counts decisions, not views: the accepted hunk still stands.
    await expect(status).toContainText("1 of 2 changes to review");
  });

  test("fold-text: Read more grows the passage and Show less folds it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/fold-text");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const more = stage.getByRole("button", { name: "Read more" });

    await expect(status).toContainText("Description folded");
    await expect(more).toHaveAttribute("aria-expanded", "false");

    // The clamp is a height rather than a line-clamp, so the fold is a
    // measurement: the region the button controls is three line boxes tall
    // while the passage inside it runs to eight.
    const regionId = await more.getAttribute("aria-controls");
    expect(regionId).toBeTruthy();
    if (!regionId) return;
    const region = stage.locator(`[id="${regionId}"]`);
    const line = await region.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).lineHeight),
    );
    expect(line).toBeGreaterThan(10);
    const full = await heightOf(region.locator("div").first())();
    expect(full).toBeGreaterThan(line * 5);
    // Folded is what the button, the ARIA and the demo's line all claim.
    expect(await heightOf(region)()).toBeLessThan(line * 4);

    await more.click();
    await expect(status).toContainText("Description open");
    const less = stage.getByRole("button", { name: "Show less" });
    await expect(less).toHaveAttribute("aria-expanded", "true");
    // Open is the passage's own measured height, not a guess at it.
    await expect
      .poll(heightOf(region), { timeout: 5000 })
      .toBeGreaterThan(full - 2);

    await less.click();
    await expect(status).toContainText("Description folded");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(heightOf(region), { timeout: 5000 })
      .toBeLessThan(line * 4);
  });

  test("gloss-word: hover unfolds a gloss, focus opens the next, Escape closes it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/gloss-word");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const duty = stage.getByRole("button", { name: "duty cycle" });
    const settling = stage.getByRole("button", { name: "settling window" });
    // A shut gloss is out of the accessibility tree, so it is reached by label.
    const dutyGloss = stage.locator('[role="region"][aria-label="duty cycle"]');

    await expect(status).toContainText("No gloss open");
    await expect(duty).toHaveAttribute("aria-expanded", "false");
    // Nothing is reserved: a closed gloss costs the paragraph no height.
    expect(await heightOf(dutyGloss)()).toBeLessThan(1);

    await hoverInline(page, duty);
    await expect(duty).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Gloss duty cycle");
    await expect(dutyGloss).toContainText(
      "The share of each hour a pump actually runs.",
    );
    await expect
      .poll(heightOf(dutyGloss), { timeout: 5000 })
      .toBeGreaterThan(20);

    // The pointer leaving takes the gloss with it.
    await page.mouse.move(0, 0);
    await expect(duty).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("No gloss open");
    await expect.poll(heightOf(dutyGloss), { timeout: 5000 }).toBeLessThan(1);

    // The keyboard opens it too: arriving on the term is a reading.
    await settling.focus();
    await expect(settling).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Gloss settling window");
    await expect(
      stage.getByRole("region", { name: "settling window" }),
    ).toContainText("Ninety seconds after a valve moves");

    await settling.press("Escape");
    await expect(settling).toHaveAttribute("aria-expanded", "false");
    await expect(status).toContainText("No gloss open");
    // Escape closes the gloss without taking the caret off the term.
    await expect(settling).toBeFocused();
  });

  test("find-marks: a query marks the passage and Enter walks the matches", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/find-marks");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const field = stage.getByRole("searchbox", { name: "Find in passage" });
    const marks = stage.locator("mark");
    /** One ring marks the current match, and it is the ring that travels. */
    const ringOn = (position: number) =>
      marks.nth(position).locator("span.border-cobalt-bright");

    // The passage opens on a search that has already run.
    await expect(field).toHaveValue("flow");
    await expect(marks).toHaveCount(6);
    await expect(status).toContainText("Match 1 of 6");

    await field.fill("weir");
    await expect(marks).toHaveCount(3, { timeout: 5000 });
    // A new search starts at its first match rather than keeping the old place.
    await expect(status).toContainText("Match 1 of 3");
    await expect(ringOn(0)).toHaveCount(1, { timeout: 5000 });

    await field.press("Enter");
    await expect(status).toContainText("Match 2 of 3");
    await expect(ringOn(1)).toHaveCount(1, { timeout: 5000 });
    await expect(ringOn(0)).toHaveCount(0);

    await field.press("Shift+Enter");
    await expect(status).toContainText("Match 1 of 3");
    await expect(ringOn(0)).toHaveCount(1, { timeout: 5000 });

    // The walk wraps rather than stopping at either end.
    await field.press("Shift+Enter");
    await expect(status).toContainText("Match 3 of 3");
    await expect(ringOn(2)).toHaveCount(1, { timeout: 5000 });

    await field.fill("kestrel");
    await expect(marks).toHaveCount(0, { timeout: 5000 });
    await expect(status).toContainText("No matches");
  });

  test("select-bar: a selection raises the bar and Bold wraps the words", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/select-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const editor = stage.getByRole("textbox", {
      name: "Gaugeworks release note",
    });
    const bar = stage.getByRole("toolbar", { name: "Format selection" });

    await expect(status).toContainText("Select words to raise the bar");
    await expect(bar).toHaveCount(0);

    // The caret goes into the first line and the keyboard takes eight
    // characters with it: the bar reads the selection, not the pointer.
    await editor.click({ position: { x: 8, y: 12 } });
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Shift+ArrowRight");
    }
    await expect(bar).toBeVisible();

    const bold = bar.getByRole("button", { name: "Bold" });
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await bold.click();

    await expect(status).toContainText("Applied bold");
    // The bar re-reads the range it just wrapped, so it knows what it did.
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    // Formatting is real range wrapping, not a class on a span.
    const strong = editor.locator("strong");
    await expect(strong).toHaveCount(1);
    await expect(strong).not.toBeEmpty();

    // Letting the selection go lowers the bar.
    await page.keyboard.press("ArrowRight");
    await expect(bar).toHaveCount(0, { timeout: 5000 });
    await expect(status).toContainText("Applied bold");
  });

  test("mention-chip: @ picks a name into a chip, and Backspace takes it back out", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/mention-chip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const field = stage.getByLabel("Fernworks survey · comment");
    // The composer says how many people the query matched, ahead of the demo.
    const matched = stage.locator("[role='status']").first();

    await expect(status).toHaveText("Mentioned rae");

    // Select-all then a step right is the deterministic way to the end of a
    // textarea that already holds a sentence.
    await field.press("ControlOrMeta+a");
    await field.press("ArrowRight");
    await field.pressSequentially(" @ivo");

    const list = stage.getByRole("listbox", { name: "People to mention" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(1);
    await expect(matched).toHaveText("1 people match");
    // Focus never leaves the text: the list is driven from the field.
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-activedescendant", /-list-0$/);

    await field.press("Enter");
    // The space inside a mentioned name is stored non-breaking, which is
    // what keeps a chip sitting on its own glyphs when the line wraps.
    await expect(field).toHaveValue(/@Ivo\u00A0Marsh $/);
    await expect(status).toHaveText("Mentioned rae, ivo");
    await expect(list).toHaveCount(0, { timeout: 5000 });

    // The caret sits past the chip's trailing space: one press takes the
    // space, the next takes the whole mention rather than a letter of it.
    await field.press("Backspace");
    await expect(status).toHaveText("Mentioned rae, ivo");
    await field.press("Backspace");
    await expect(status).toHaveText("Mentioned rae", { timeout: 5000 });
    await expect(field).not.toHaveValue(/Ivo/);
  });

  test("squiggle-mark: Accept swaps the word, Ignore leaves it and drops the mark", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/squiggle-mark");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The proofreader announces each decision ahead of the demo's tally.
    const said = stage.locator("[role='status']").first();
    // Exact: once a bubble is up, its Accept and Ignore both carry the
    // flagged word in their own names.
    const flagged = stage.getByRole("button", {
      name: "cordinate",
      exact: true,
    });
    const next = stage.getByRole("button", { name: "resurvey", exact: true });

    await expect(status).toContainText("3 of 3 still flagged");
    await expect(said).toHaveText("");

    // Focus raises the suggestion, so the fix is reachable by Tab alone.
    await flagged.focus();
    await expect(flagged).toHaveAttribute("aria-expanded", "true");
    const bubble = stage.getByRole("group", {
      name: "Suggestion for cordinate",
    });
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("coordinate");

    await bubble
      .getByRole("button", { name: "Replace cordinate with coordinate" })
      .click();
    await expect(said).toHaveText("cordinate replaced with coordinate");
    await expect(status).toContainText("2 of 3 still flagged");
    await expect(flagged).toHaveCount(0, { timeout: 5000 });
    // Resolving hands focus to the next open word rather than dropping the
    // reader back at the top of the note — and that arrival opens its bubble.
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-expanded", "true");

    await stage
      .getByRole("group", { name: "Suggestion for resurvey" })
      .getByRole("button", { name: "Ignore resurvey" })
      .click();
    await expect(said).toHaveText("resurvey ignored");
    await expect(status).toContainText("1 of 3 still flagged");
    // Ignored, the word keeps its spelling and loses only its mark.
    await expect(next).toHaveCount(0, { timeout: 5000 });
    await expect(stage.getByText("resurvey").last()).toBeVisible();
    // The word nobody ruled on is still flagged.
    await expect(
      stage.getByRole("button", { name: "Wether", exact: true }),
    ).toHaveCount(1);
  });

  test("karaoke-line: Play runs the playhead, Pause holds it, a word seeks", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/karaoke-line");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const transport = stage.getByRole("button", { name: /^(Play|Pause)$/ });
    const head = async (): Promise<number> =>
      Number(
        /Playhead ([\d.]+)s/.exec((await status.textContent()) ?? "")?.[1] ??
          -1,
      );

    const hold = stage.getByRole("button", { name: "Hold, at 0.0 seconds" });

    await expect(status).toContainText("Playhead 0.00s of 5.60s");
    await expect(transport).toHaveText("Play");
    // Nothing runs on mount, and at the top of the line the first word is the
    // one the playhead is standing on.
    await expect(hold).toHaveAttribute("aria-current", "true");

    await transport.click();
    await expect(transport).toHaveText("Pause");
    // Past 0.45s the first word's window has closed.
    await expect.poll(head, { timeout: 5000 }).toBeGreaterThan(0.5);
    await expect(hold).not.toHaveAttribute("aria-current", "true");
    // The line lights in time, so one word owns the playhead.
    await expect(stage.locator('[aria-current="true"]')).toHaveCount(1);

    await transport.click();
    await expect(transport).toHaveText("Play");
    // The clock is cleared, not ignored: nothing moves at all while it is off.
    await page.waitForTimeout(300);
    const held = await head();
    expect(held).toBeGreaterThan(0.5);
    await page.waitForTimeout(700);
    expect(await head()).toBe(held);

    // A word is a seek: the playhead lands on its start, not near it.
    const north = stage.getByRole("button", { name: "north, at 2.5 seconds" });
    await north.click();
    await expect(status).toContainText("Playhead 2.50s");
    await expect(north).toHaveAttribute("aria-current", "true");

    await stage.getByRole("button", { name: "Restart" }).click();
    await expect(status).toContainText("Playhead 0.00s");
    await expect(north).not.toHaveAttribute("aria-current", "true");
  });

  test("transcript-flow: Start brings segments in and firms them, Reset winds it back", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/transcript-flow");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const log = stage.getByRole("log", { name: "Fieldline dictation" });
    // The flow keeps two lines of its own: the last sentence the recogniser
    // committed, then whether the microphone is open.
    const settled = stage.locator("[role='status']").first();
    const mic = stage.locator("[role='status']").nth(1);
    const transport = stage.getByRole("button", { name: /^(Start|Pause)$/ });
    /** The tone of the second sentence, which is how firm it is. */
    const secondTone = async (): Promise<string> =>
      log.evaluate(
        (element) => element.querySelectorAll("p")[1]?.className ?? "",
      );

    await expect(status).toContainText("Paused · 1 segments");
    await expect(mic).toHaveText("Not listening");
    await expect(settled).toHaveText("Bay four is reading two degrees long.");
    await expect(log.locator("p")).toHaveCount(1);

    await transport.click();
    await expect(mic).toHaveText("Listening");
    await expect(status).toContainText("Listening", { timeout: 5000 });
    // A sentence arrives tentative in muted ink — a state that lives for about
    // two seconds, so it is polled for rather than asserted after the fact.
    await expect.poll(secondTone, { timeout: 8000 }).toContain("text-ink-3");
    await expect(status).toContainText("2 segments");

    // It firms when the recogniser commits it, and the committed line is what
    // the flow announces.
    await expect(settled).toHaveText(
      "Re-torque to eighteen newton metres and log the drift.",
      { timeout: 8000 },
    );
    await expect
      .poll(secondTone, { timeout: 5000 })
      .toContain("text-foreground");

    // The script runs itself out and stands the microphone down.
    await expect(status).toContainText("Paused · 3 segments", {
      timeout: 8000,
    });
    await expect(mic).toHaveText("Not listening");
    await expect(settled).toHaveText("Hand the bay over at shift change.");
    await expect(log.locator("p")).toHaveCount(3);

    await stage.getByRole("button", { name: "Reset" }).click();
    await expect(status).toContainText("Paused · 1 segments");
    await expect(log.locator("p")).toHaveCount(1, { timeout: 5000 });
    await expect(settled).toHaveText("Bay four is reading two degrees long.");
  });

  test("unit-flip: pressing a unit turns the card and re-measures the reading", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/unit-flip");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // Each readout speaks its own digits; the demo's line is the one after.
    // The digit stack itself is mid-roll DOM — two glyphs to a slot — so the
    // component's own reading is the honest way to read what it shows.
    const readings = stage.locator("[role='status']");
    const celsius = stage.getByRole("button", {
      name: "Unit °C, switch to °F",
    });

    await expect(status).toContainText("Reading in °C · km · lb");
    await expect(readings.nth(0)).toHaveText("21.4 °C");
    await expect(celsius).toHaveAttribute("aria-pressed", "false");

    await celsius.click();
    const fahrenheit = stage.getByRole("button", {
      name: "Unit °F, switch to °C",
    });
    await expect(fahrenheit).toHaveAttribute("aria-pressed", "true");
    await expect(readings.nth(0)).toHaveText("70.5 °F");
    await expect(status).toContainText("Reading in °F · km · lb");

    // Space flips it too, and precision follows the unit: miles are read to
    // two decimals where kilometres are read to one.
    const kilometres = stage.getByRole("button", {
      name: "Unit km, switch to mi",
    });
    await kilometres.press(" ");
    await expect(readings.nth(1)).toHaveText("7.83 mi");
    await expect(status).toContainText("Reading in °F · mi · lb");
    // The pair nobody pressed is untouched.
    await expect(readings.nth(2)).toHaveText("163.6 lb");

    await fahrenheit.press(" ");
    await expect(celsius).toHaveAttribute("aria-pressed", "false");
    await expect(readings.nth(0)).toHaveText("21.4 °C");
    await expect(status).toContainText("Reading in °C · mi · lb");
  });
});

/**
 * The layout wing rearranges space itself — an order, a day, a board, a height
 * that is measured rather than reserved — so its outcomes are the order the
 * demo now reads, the time an event now carries, the lane a card now sits in,
 * or a box whose size a test measured for itself. Each test drives the
 * mechanic by the path the component advertises, preferring the keyboard where
 * there is one, and reads the result off the demo's status line, the
 * component's own announcement, or the geometry.
 */
test.describe("layout", () => {
  test("reorder-list: Space lifts a row, Down moves it, Space commits the order", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/reorder-list");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The list narrates each step of a lift itself, ahead of the demo's order.
    const said = stage.locator("[role='status']").first();
    const rows = stage.getByRole("listitem");
    const intake = stage.getByRole("button", { name: /^Intake/ });

    await expect(status).toContainText(
      "Intake / Triage / Fit check / Quote / Handover",
    );
    await expect(rows.first()).toContainText("Intake");

    await intake.press(" ");
    await expect(intake).toHaveAttribute("aria-pressed", "true");
    await expect(said).toHaveText("Intake lifted at position 1 of 5.");

    await intake.press("ArrowDown");
    await expect(said).toHaveText("Intake moved to position 2 of 5.");
    // Moving is not committing: the demo hears nothing until the row is down.
    await expect(status).toContainText("Intake / Triage / Fit check");

    await intake.press(" ");
    await expect(intake).toHaveAttribute("aria-pressed", "false");
    await expect(said).toHaveText("Intake dropped at position 2 of 5.");
    await expect(status).toContainText(
      "Triage / Intake / Fit check / Quote / Handover",
    );
    await expect(rows.nth(1)).toContainText("Intake");

    // Escape is the way out that keeps nothing: the lift is wound back to the
    // order it started from, not to the row's original slot.
    await intake.press(" ");
    await expect(said).toHaveText("Intake lifted at position 2 of 5.");
    await intake.press("ArrowUp");
    await expect(said).toHaveText("Intake moved to position 1 of 5.");
    await expect(rows.first()).toContainText("Intake");

    await intake.press("Escape");
    await expect(said).toHaveText(
      "Move cancelled. Intake back at position 2 of 5.",
    );
    await expect(intake).toHaveAttribute("aria-pressed", "false");
    await expect(rows.nth(1)).toContainText("Intake");
    await expect(status).toContainText("Triage / Intake / Fit check");
  });

  test("agenda-day: the arrows nudge the focused event a quarter hour at a time", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/agenda-day");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The day announces each landing itself, ahead of the demo's readout.
    const said = stage.locator("[role='status']").first();
    const yard = stage.getByRole("button", { name: /^Yard check,/ });

    await expect(status).toContainText("Focus an event, then drag it");
    await expect(yard).toHaveAttribute(
      "aria-label",
      "Yard check, 08:30 to 09:15",
    );

    // Arriving on an event is what puts it in the demo's readout.
    await yard.focus();
    await expect(status).toContainText("Yard check · 08:30–09:15");

    await yard.press("ArrowDown");
    await expect(yard).toHaveAttribute(
      "aria-label",
      "Yard check, 08:45 to 09:30",
    );
    await expect(said).toHaveText("Yard check 08:45 to 09:30.");
    await expect(status).toContainText("Yard check · 08:45–09:30");

    // The block keeps its span while it moves: a nudge is a time, not a resize.
    await yard.press("PageDown");
    await expect(yard).toHaveAttribute(
      "aria-label",
      "Yard check, 09:45 to 10:30",
    );
    await expect(status).toContainText("Yard check · 09:45–10:30");

    await yard.press("ArrowUp");
    await expect(status).toContainText("Yard check · 09:30–10:15");
    // The event nobody moved is where it was.
    await expect(
      stage.getByRole("button", { name: "Route brief, 09:30 to 11:00" }),
    ).toHaveCount(1);
  });

  test("lane-board: a card's menu moves it a lane over and both counts roll", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/lane-board");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    // The board announces each landing itself, ahead of the demo's line.
    const said = stage.locator("[role='status']").first();
    const todo = stage.getByRole("list", { name: "Todo" });
    const doing = stage.getByRole("list", { name: "Doing" });
    const seal = stage.getByRole("button", { name: /^Seal the intake port,/ });
    /** The badge beside a lane's title, which is the lane's own count. */
    const countOf = (lane: string) =>
      stage
        .getByTitle(lane, { exact: true })
        .locator("xpath=following-sibling::span");

    await expect(status).toContainText(
      "Drag a card, or open one for its moves",
    );
    await expect(todo.getByRole("button")).toHaveCount(3);
    await expect(doing.getByRole("button")).toHaveCount(2);
    await expect(countOf("Todo")).toHaveText("3");
    await expect(seal).toHaveAttribute(
      "aria-label",
      "Seal the intake port, M, Todo, position 1 of 3",
    );

    await seal.click();
    const menu = stage.getByRole("menu", {
      name: "Move Seal the intake port",
    });
    await expect(menu).toBeVisible();
    await expect(seal).toHaveAttribute("aria-expanded", "true");
    // The first lane has nothing to its left, and the top card nothing above
    // it, so those two moves stand down rather than being offered.
    await expect(
      menu.getByRole("menuitem", { name: "Lane left" }),
    ).toBeDisabled();
    await expect(
      menu.getByRole("menuitem", { name: "Move up" }),
    ).toBeDisabled();

    await menu.getByRole("menuitem", { name: "Lane right" }).click();
    await expect(said).toHaveText(
      "Seal the intake port moved to Doing, position 1 of 3.",
    );
    await expect(status).toContainText("Seal the intake port · Doing 1");
    await expect(todo.getByRole("button")).toHaveCount(2);
    await expect(doing.getByRole("button")).toHaveCount(3);
    await expect(countOf("Todo")).toHaveText("2");
    await expect(countOf("Doing")).toHaveText("3");
    // The same card, re-labelled where it landed — and the move hands focus
    // back to it rather than dropping the reader at the top of the board.
    await expect(seal).toHaveAttribute(
      "aria-label",
      "Seal the intake port, M, Doing, position 1 of 3",
    );
    await expect(seal).toBeFocused();
    await expect(menu).toHaveCount(0, { timeout: 5000 });
  });

  test("unfold-card: a card opens where it stands and folds the one that was open", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/unfold-card");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const mill = stage.getByRole("button", { name: /^Mill Row 4/ });
    const kiln = stage.getByRole("button", { name: /^Kiln Yard 12/ });
    // A folded panel is inert and out of the accessibility tree, so the panels
    // are reached by their place in the list rather than by name.
    const panels = stage.locator("[role='region']");
    const millPanel = panels.nth(0);
    const kilnPanel = panels.nth(1);

    await expect(panels).toHaveCount(3);
    await expect(status).toContainText("Open · Mill Row 4");
    await expect(mill).toHaveAttribute("aria-expanded", "true");
    // Nothing is reserved: a folded card costs the list no height.
    await expect
      .poll(heightOf(millPanel), { timeout: 5000 })
      .toBeGreaterThan(40);
    expect(await heightOf(kilnPanel)()).toBeLessThan(1);

    await kiln.click();
    await expect(kiln).toHaveAttribute("aria-expanded", "true");
    await expect(status).toContainText("Open · Kiln Yard 12");
    await expect
      .poll(heightOf(kilnPanel), { timeout: 5000 })
      .toBeGreaterThan(40);
    await expect(kilnPanel).toContainText("1974");
    // Opening one folds the other in the same beat.
    await expect(mill).toHaveAttribute("aria-expanded", "false");
    await expect.poll(heightOf(millPanel), { timeout: 5000 }).toBeLessThan(1);

    await kiln.press("Escape");
    await expect(status).toContainText("All folded");
    await expect(kiln).toHaveAttribute("aria-expanded", "false");
    await expect.poll(heightOf(kilnPanel), { timeout: 5000 }).toBeLessThan(1);
    // The summary is where the card came from, so that is where focus belongs.
    await expect(kiln).toBeFocused();
  });

  test("fit-panel: a new tab is measured and the box glides to what it measured", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/fit-panel");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const tabs = stage.getByRole("tablist", { name: "Gaugeworks R2" });
    // The panel is the only clipping box on the plate, and it is the box the
    // demo is reporting the measurement of.
    const box = stage.locator("div.overflow-hidden").first();
    const measured = async (): Promise<number> =>
      Number(
        /Measured (\d+) px/.exec((await status.textContent()) ?? "")?.[1] ?? -1,
      );
    /** How far the box is from the height it just reported. */
    const drift = async (): Promise<number> =>
      Math.abs((await heightOf(box)()) - (await measured()));

    await expect.poll(measured, { timeout: 5000 }).toBeGreaterThan(0);
    const spec = await measured();
    await expect.poll(drift, { timeout: 5000 }).toBeLessThanOrEqual(1);

    // Notes is two paragraphs where Spec is one line: the box has to grow.
    await tabs.getByRole("tab", { name: "Notes" }).click();
    await expect(tabs.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.poll(measured, { timeout: 5000 }).toBeGreaterThan(spec);
    const notes = await measured();
    await expect.poll(drift, { timeout: 5000 }).toBeLessThanOrEqual(1);
    await expect(stage.getByRole("tabpanel")).toContainText("dial vertical");

    // The arrows walk the strip, and the box follows them back down.
    await tabs.getByRole("tab", { name: "Notes" }).press("ArrowLeft");
    const fit = tabs.getByRole("tab", { name: "Fit" });
    await expect(fit).toHaveAttribute("aria-selected", "true");
    await expect(fit).toBeFocused();
    await expect.poll(measured, { timeout: 5000 }).toBeLessThan(notes);
    await expect.poll(drift, { timeout: 5000 }).toBeLessThanOrEqual(1);
    await expect(stage.getByRole("tabpanel")).toContainText("G1/4 B");
  });

  test("density-grid: Compact tightens every row and the card comes down with them", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/density-grid");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const density = stage.getByRole("radiogroup", { name: "Row density" });
    const comfortable = density.getByRole("radio", { name: "Comfortable" });
    const compact = density.getByRole("radio", { name: "Compact" });
    const row = stage.getByRole("row").filter({ hasText: "Rosa Amberlink" });
    // offsetHeight, not the rect: the card carries a layout transform mid-glide
    // and the rect would report the animated size rather than the laid-out one.
    const rowHeight = async (): Promise<number> =>
      row.evaluate((element) => (element as HTMLElement).offsetHeight);
    /** The card's own height, as the demo's observer measured it. */
    const cardHeight = async (): Promise<number> =>
      Number(
        /(\d+)px tall/.exec((await status.textContent()) ?? "")?.[1] ?? -1,
      );

    await expect(status).toContainText("comfortable");
    await expect(comfortable).toHaveAttribute("aria-checked", "true");
    await expect.poll(cardHeight, { timeout: 5000 }).toBeGreaterThan(0);
    const roomy = await cardHeight();
    expect(await rowHeight()).toBe(48);

    await compact.click();
    await expect(compact).toHaveAttribute("aria-checked", "true");
    await expect(comfortable).toHaveAttribute("aria-checked", "false");
    await expect(status).toContainText("compact");
    await expect.poll(rowHeight, { timeout: 5000 }).toBe(32);
    // Eight rows, sixteen pixels each: the card gives up exactly what the rows
    // did, and nothing else on the card changed size.
    await expect.poll(cardHeight, { timeout: 5000 }).toBe(roomy - 8 * 16);

    // The type holds at every density — shrinking it would be a legibility
    // decision, not a density one.
    await expect(
      stage.getByRole("cell", { name: "Rosa Amberlink" }),
    ).toBeVisible();
  });

  test("summary-hem: the cart scrolling down condenses the hem, and it opens again", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/summary-hem");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const frame = frameOf(stage);
    const hem = stage.getByRole("region", { name: "Coldbrook order" });
    const disclosure = hem.getByRole("button", { name: "Coldbrook order" });
    // The itemised lines are the part the condensed bar gives up.
    const lines = hem.getByText("Delivery, north basin");
    const hemHeight = heightOf(hem);

    await expect(status).toContainText("Hem expanded");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(lines).toBeVisible();
    const open = await hemHeight();
    expect(open).toBeGreaterThan(80);

    await scrollFrameTo(frame, 220);
    await expect(status).toContainText("Hem condensed");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(lines).toHaveCount(0, { timeout: 5000 });
    await expect.poll(hemHeight, { timeout: 5000 }).toBeLessThan(open - 40);
    // The total and the action are kept in both states.
    await expect(hem.getByText("90.50")).toBeVisible();
    await expect(hem.getByRole("button", { name: "Checkout" })).toBeVisible();

    // Direction, not position: scrolling back up hands the lines over again
    // without the reader having to reach the top.
    await scrollFrameTo(frame, 120);
    await expect(status).toContainText("Hem expanded");
    await expect(lines).toBeVisible({ timeout: 5000 });
    await expect.poll(hemHeight, { timeout: 5000 }).toBeGreaterThan(open - 5);

    // The heading is also a disclosure, and it works the same both ways.
    await disclosure.click();
    await expect(status).toContainText("Hem condensed");
    await expect(lines).toHaveCount(0, { timeout: 5000 });
    await disclosure.click();
    await expect(status).toContainText("Hem expanded");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(lines).toBeVisible({ timeout: 5000 });
  });

  test("step-slide: Next walks the steps, Back comes home, the last Next files it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/step-slide");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const next = stage.getByRole("button", { name: /^(Next|Finish)$/ });
    const back = stage.getByRole("button", { name: "Back" });
    // The dots are decoration the reader can see, so they are read as marks.
    const dots = stage.locator("ol li span");

    await expect(status).toContainText("Step Workspace");
    await expect(stage.getByText("Step 1 of 3", { exact: true })).toBeVisible();
    await expect(dots).toHaveCount(3);
    await expect(dots.nth(0)).toHaveClass(/w-5/);
    await expect(back).toBeDisabled();

    await next.click();
    await expect(status).toContainText("Step Team");
    await expect(stage.getByText("Step 2 of 3", { exact: true })).toBeVisible();
    await expect(stage.getByText("rosa@waylight.test")).toBeVisible();
    // The pill is the same mark travelling; the step behind it is filled in.
    await expect(dots.nth(1)).toHaveClass(/w-5/);
    await expect(dots.nth(0)).toHaveClass(/bg-primary\/50/);
    await expect(back).toBeEnabled();

    await back.click();
    await expect(status).toContainText("Step Workspace");
    await expect(dots.nth(0)).toHaveClass(/w-5/);
    await expect(back).toBeDisabled({ timeout: 5000 });

    await next.click();
    await next.click();
    await expect(status).toContainText("Step Notifications");
    await expect(stage.getByText("Step 3 of 3", { exact: true })).toBeVisible();
    // The forward button says what it will do at the end of the line.
    await expect(next).toHaveText("Finish");
    await expect(status).not.toContainText("setup filed");

    await next.click();
    await expect(status).toContainText("Step Notifications · setup filed");
    // Finishing is not a fourth step: the wizard stays where it is.
    await expect(dots.nth(2)).toHaveClass(/w-5/);
  });

  test("swipe-row: the menu archives a row, and a drag parks one on its action", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/swipe-row");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const rows = stage.getByRole("listitem");
    const depot = stage.getByRole("button", {
      name: "Actions for Sweep sheet for run 118",
    });

    await expect(status).toContainText("Last none");
    await expect(rows).toHaveCount(3);

    // The swipe is a shortcut, never the only way in: every action is in the
    // row's own menu, which the keyboard opens and lands inside.
    await depot.press("Enter");
    const menu = stage.getByRole("menu", {
      name: "Actions for Sweep sheet for run 118",
    });
    await expect(menu).toBeVisible();
    await expect(depot).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    const archive = menu.getByRole("menuitem", { name: "Archive" });
    await expect(archive).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(status).toContainText("Last archived · Fieldline depot");
    await expect(menu).toHaveCount(0, { timeout: 5000 });
    await expect(depot).toBeFocused();
    await expect(rows.first()).toContainText("archived");

    // By hand: the row travels with the pointer and settles on the open stop,
    // with its trailing action standing in the strip it gave up.
    const surface = rows.nth(1).locator("div.touch-pan-y");
    const shift = async (): Promise<number> =>
      surface.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        if (!transform || transform === "none") return 0;
        return new DOMMatrixReadOnly(transform).m41;
      });
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const midY = box.y + box.height / 2;

    // Starting clear of the menu button, and travelling well short of the
    // overswipe threshold, so this opens the row rather than firing anything.
    await page.mouse.move(box.x + box.width - 90, midY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 190, midY, { steps: 10 });
    await page.mouse.up();
    await expect.poll(shift, { timeout: 5000 }).toBeLessThan(-60);
    await expect(status).toContainText("Last archived · Fieldline depot");

    // The revealed slab is a real control, and running it closes the row.
    await rows.nth(1).locator("div[aria-hidden] > button").last().click();
    await expect(status).toContainText("Last deleted · Rosa Amberlink");
    await expect(rows.nth(1)).toContainText("deleted");
    await expect.poll(shift, { timeout: 5000 }).toBeGreaterThan(-1);
  });

  test("shrink-bar: scrolling spends the bar's height, scrolling back buys it", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/shrink-bar");
    const stage = stageOf(page);
    const status = demoStatus(stage);
    const frame = frameOf(stage);
    const bar = stage.locator("header");
    const subtitle = stage.getByText("North basin · since 2019");
    const percent = async (): Promise<number> =>
      Number(
        /Compaction (\d+)%/.exec((await status.textContent()) ?? "")?.[1] ?? -1,
      );
    const barHeight = heightOf(bar);

    await expect(status).toContainText("Compaction 0%");
    await expect(subtitle).toBeVisible();
    expect(await barHeight()).toBeCloseTo(88, 0);

    // Scroll-linked and nothing else: half the range is half the compaction,
    // and half the height the bar has to give.
    await scrollFrameTo(frame, 40);
    await expect.poll(percent, { timeout: 5000 }).toBe(50);
    await expect.poll(barHeight, { timeout: 5000 }).toBeCloseTo(70, 0);

    await scrollFrameTo(frame, 200);
    await expect.poll(percent, { timeout: 5000 }).toBe(100);
    await expect.poll(barHeight, { timeout: 5000 }).toBeCloseTo(52, 0);
    // The subtitle gives up its line rather than merely fading.
    await expect(subtitle).not.toBeVisible();
    // One heading throughout, whatever height it is wearing.
    await expect(
      stage.getByRole("heading", { name: "Fernworks" }),
    ).toBeVisible();

    await scrollFrameTo(frame, 0);
    await expect.poll(percent, { timeout: 5000 }).toBe(0);
    await expect.poll(barHeight, { timeout: 5000 }).toBeCloseTo(88, 0);
    await expect(subtitle).toBeVisible();
  });
});
