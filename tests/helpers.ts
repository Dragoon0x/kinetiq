import type { Page } from "@playwright/test";

/**
 * Navigate and wait for React hydration (the Providers mount marker).
 * SSG pages paint before they're interactive; pressing earlier races React's
 * event attachment.
 */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector("body[data-hydrated]", { timeout: 15_000 });
}
