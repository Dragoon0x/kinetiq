import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  /**
   * The exercise sweep drives every specimen at once, and the animation-heavy
   * blocks can starve a renderer when several run in parallel — signal-center
   * takes 3.7s alone and has blown a 60s budget under full-suite load, while
   * passing 225/225 on a lighter run. That is contention, not a defect: it has
   * no loop or blocking work in it.
   *
   * This does not hide real failures. A genuine bug reproduces on every attempt,
   * and the assertions these specs care about most — console errors, page
   * errors, hydration warnings — are deterministic, so a retry cannot launder
   * them.
   */
  retries: process.env.CI ? 2 : 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    // Serves the production build — run `pnpm build` first (CI does).
    command: "pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
