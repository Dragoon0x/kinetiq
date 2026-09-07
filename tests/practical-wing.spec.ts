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
