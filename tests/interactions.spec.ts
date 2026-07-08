import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./helpers";

test.describe("pressure button", () => {
  test("click fires and updates status", async ({ page }) => {
    await gotoHydrated(page, "/components/pressure-button");
    await page.getByRole("button", { name: "Promote to production" }).click();
    await expect(page.getByText("Promoted to production.")).toBeVisible();
  });

  test("squashes while pressed", async ({ page }) => {
    await gotoHydrated(page, "/components/pressure-button");
    const button = page.getByRole("button", { name: "Promote to production" });
    const box = await button.boundingBox();
    if (!box) throw new Error("button not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(async () =>
        button.evaluate((el) => getComputedStyle(el).transform),
      )
      .not.toBe("none");
    await page.mouse.up();
  });

  test("hold to confirm fires after the hold duration", async ({ page }) => {
    await gotoHydrated(page, "/components/pressure-button");
    const button = page.getByRole("button", { name: /Destroy environment/ });
    const box = await button.boundingBox();
    if (!box) throw new Error("button not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByText("Environment destroyed.")).toBeVisible({
      timeout: 3000,
    });
    await page.mouse.up();
  });

  test("early release cancels the hold", async ({ page }) => {
    await gotoHydrated(page, "/components/pressure-button");
    const button = page.getByRole("button", { name: /Destroy environment/ });
    const box = await button.boundingBox();
    if (!box) throw new Error("button not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    await expect(page.getByText("Environment destroyed.")).toHaveCount(0);
    await expect(page.getByText("Environment: staging-04 · idle")).toBeVisible();
  });

  test("space key drives the same hold physics", async ({ page }) => {
    await gotoHydrated(page, "/components/pressure-button");
    const button = page.getByRole("button", { name: /Destroy environment/ });
    await button.focus();
    await page.keyboard.down(" ");
    await expect(page.getByText("Environment destroyed.")).toBeVisible({
      timeout: 3000,
    });
    await page.keyboard.up(" ");
  });
});

test.describe("launch checklist", () => {
  test("completing every step lands the stamp and fills the progress track", async ({
    page,
  }) => {
    await gotoHydrated(page, "/blocks/launch-checklist");

    for (const title of [
      "Import your first dataset",
      "Invite two teammates",
      "Set an alert threshold",
      "Run your first deploy",
    ]) {
      await page.getByText(title).click();
    }

    await expect(page.getByText("Calibrated", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "5",
    );
    await expect(
      page.getByText("All steps complete — calibrated."),
    ).toBeVisible();
  });

  test("unchecking after completion removes the stamp", async ({ page }) => {
    await gotoHydrated(page, "/blocks/launch-checklist");
    for (const title of [
      "Import your first dataset",
      "Invite two teammates",
      "Set an alert threshold",
      "Run your first deploy",
    ]) {
      await page.getByText(title).click();
    }
    await expect(page.getByText("Calibrated", { exact: true })).toBeVisible();
    await page.getByText("Invite two teammates").click();
    await expect(page.getByText("Calibrated", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
  });
});
