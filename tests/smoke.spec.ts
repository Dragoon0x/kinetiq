import { expect, test } from "@playwright/test";

import { itemsByCategory } from "../content/categories";
import { guides } from "../content/guides";
import { labs } from "../content/labs";
import { catalogBlocks, catalogComponents } from "../content/manifest";

const routes = [
  "/",
  "/components",
  "/explore",
  "/spatial",
  "/blocks",
  "/playground",
  "/guides",
  "/agents",
  "/mcp",
  ...itemsByCategory(catalogComponents).map(
    ({ category }) => `/components/category/${category.slug}`,
  ),
  ...catalogComponents.map((c) => `/components/${c.name}`),
  ...catalogBlocks.map((b) => `/blocks/${b.name}`),
  ...labs.map((lab) => `/playground/${lab.slug}`),
  ...guides.map((guide) => `/guides/${guide.slug}`),
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
