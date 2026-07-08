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
    const input = page.getByPlaceholder("Search instruments, benches, pages…");
    await expect(input).toBeVisible();
    await input.fill("caliper");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/components\/caliper-slider/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Caliper Slider" }),
    ).toBeVisible();
  });

  test("escape closes the deck", async ({ page }) => {
    await gotoHydrated(page, "/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder("Search instruments, benches, pages…");
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
    await expect(
      page.getByText(/Reduced motion · test active/i),
    ).toBeVisible();

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
