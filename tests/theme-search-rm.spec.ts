import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

test.describe("theme", () => {
  test("toggle flips the html class, persists, and updates theme-color", async ({
    page,
  }) => {
    await gotoHydrated(page, "/");
    const initial = await page.evaluate(() =>
      document.documentElement.classList.contains("light") ? "light" : "dark",
    );
    await page.locator("[data-theme-toggle]").click();
    const flipped = initial === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveClass(new RegExp(flipped));
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
              ?.content,
        ),
      )
      .toBe(flipped === "light" ? "#fafbfd" : "#10131a");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(flipped));
  });
});

test.describe("command deck", () => {
  test("⌘K opens, filters, and navigates", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(
      "Search the library — names, props, serials, anything…",
    );
    await expect(input).toBeVisible();
    await input.fill("caliper");
    // The index is fetched rather than bundled, so wait for the match the
    // way a reader does — look, then press Enter.
    await expect(page.locator("[cmdk-item]").first()).toContainText(
      "Caliper Slider",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/components\/caliper-slider/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Caliper Slider" }),
    ).toBeVisible();
  });

  test("a prop name finds the component that takes it", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(
      "Search the library — names, props, serials, anything…",
    );
    await input.fill("holdToConfirm");
    const first = page.locator("[cmdk-item]").first();
    await expect(first).toContainText("Pressure Button");
    // The row says which field it matched on, so the hit is never a mystery.
    await expect(first).toContainText("prop");
    await page.keyboard.press("Enter");
    // Straight to the props table, not the top of the page.
    await expect(page).toHaveURL(/\/components\/pressure-button#props/);
    await expect(page.locator("#props")).toBeInViewport();
  });

  test("a serial goes straight to its specimen", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    await page
      .getByPlaceholder("Search the library — names, props, serials, anything…")
      .fill("KQ-001");
    await expect(page.locator("[cmdk-item]").first()).toContainText(
      "Pressure Button",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/components\/pressure-button/);
  });

  test("prose from a description is searchable once the bodies land", async ({
    page,
  }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(
      "Search the library — names, props, serials, anything…",
    );
    await input.fill("damping");
    // "damping" appears in no title or keyword — only in prop docs and
    // descriptions, which arrive with the second index file.
    await expect
      .poll(async () => page.locator("[cmdk-item]").count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(2);
    await expect(page.locator("[cmdk-item]").first()).toContainText(
      "Pond Glass",
    );
  });

  test("scope chips narrow the results to one section", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    await page
      .getByPlaceholder("Search the library — names, props, serials, anything…")
      .fill("button");
    const blocks = page.getByRole("button", { name: /^Blocks/ });
    await expect(blocks).toBeVisible();
    await blocks.click();
    await expect(page.getByText("COMPONENTS", { exact: true })).toHaveCount(0);
    // Scoping must leave a row selected, or Enter would have nothing to open.
    await expect(page.locator('[cmdk-item][aria-selected="true"]')).toHaveCount(
      1,
    );
  });

  test("⌘↵ copies the install command without leaving the page", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(
      "Search the library — names, props, serials, anything…",
    );
    await input.fill("pressure button");
    await expect(page.locator("[cmdk-item]").first()).toContainText(
      "Pressure Button",
    );
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("pnpm dlx shadcn@latest add @kinetiq/pressure-button");
    await expect(input).toBeVisible();
  });

  test("escape closes the deck", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(
      "Search the library — names, props, serials, anything…",
    );
    await expect(input).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
  });
});

test.describe("reduced motion", () => {
  test("the RM test switch shows the banner and suppresses squash physics", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/pressure-button");
    await page.getByRole("button", { name: "Test reduced motion" }).click();
    await expect(page.getByText(/Reduced motion · test active/i)).toBeVisible();

    const button = page.getByRole("button", { name: "Promote to production" });
    const box = await button.boundingBox();
    if (!box) throw new Error("button not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const transform = await button.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    await page.mouse.up();
    expect(transform).toBe("none");
  });

  test("OS-level prefers-reduced-motion also suppresses squash", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await gotoHydrated(page, "/components/pressure-button");
    const button = page.getByRole("button", { name: "Promote to production" });
    const box = await button.boundingBox();
    if (!box) throw new Error("button not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const transform = await button.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    await page.mouse.up();
    expect(transform).toBe("none");
    await context.close();
  });
});

test.describe("keyboard operability", () => {
  test("caliper slider thumb responds to arrow keys with ARIA updates", async ({
    page,
  }) => {
    await gotoHydrated(page, "/components/caliper-slider");
    const thumbs = page.getByRole("slider");
    const first = thumbs.first();
    await first.focus();
    const before = await first.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => first.getAttribute("aria-valuenow"))
      .not.toBe(before);
  });

  test("select opens with keyboard and reports selection", async ({ page }) => {
    await gotoHydrated(page, "/components/select");
    const trigger = page.getByRole("combobox").first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("registry JSON artifacts parse and carry content", async ({
    request,
  }) => {
    const index = await request.get("/r/registry.json");
    expect(index.ok()).toBeTruthy();
    const registry = (await index.json()) as { items: { name: string }[] };
    expect(registry.items.length).toBeGreaterThanOrEqual(32);

    const item = await request.get("/r/pressure-button.json");
    expect(item.ok()).toBeTruthy();
    const parsed = (await item.json()) as {
      files: { content: string }[];
    };
    expect(parsed.files[0]?.content.length).toBeGreaterThan(1000);
  });
});
