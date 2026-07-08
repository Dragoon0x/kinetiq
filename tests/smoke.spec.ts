import { expect, test } from "@playwright/test";

import { catalogBlocks, catalogComponents } from "../content/manifest";

const routes = [
  "/",
  "/components",
  "/blocks",
  ...catalogComponents.map((c) => `/components/${c.name}`),
  ...catalogBlocks.map((b) => `/blocks/${b.name}`),
];

for (const route of routes) {
  test(`renders ${route} cleanly`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        problems.push(`console.error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error}`));

    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();

    // Let demos mount, animate their entrances, and settle.
    await page.waitForTimeout(900);
    expect(problems).toEqual([]);
  });
}
