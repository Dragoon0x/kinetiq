import { expect, test } from "@playwright/test";

test.describe("machine surface", () => {
  test("/registry-meta.json is a valid catalog", async ({ request }) => {
    const res = await request.get("/registry-meta.json");
    expect(res.ok()).toBeTruthy();
    const meta = (await res.json()) as {
      items: { slug: string; install: { pnpm: string } }[];
      motion: { springs: { flick: { stiffness: number } } };
      registry: { counts: { components: number } };
    };
    expect(meta.items.length).toBeGreaterThanOrEqual(40);
    expect(meta.motion.springs.flick.stiffness).toBe(1100);
    const pb = meta.items.find((i) => i.slug === "pressure-button");
    expect(pb?.install.pnpm).toContain("@kinetiq/pressure-button");
  });

  test("/llms-full.txt serves the full reference", async ({ request }) => {
    const res = await request.get("/llms-full.txt");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("Kinetiq — full reference");
    expect(body).toContain("Operating rules");
  });

  test("/r/agents-rules.json installs AGENTS.md", async ({ request }) => {
    const res = await request.get("/r/agents-rules.json");
    expect(res.ok()).toBeTruthy();
    const item = (await res.json()) as {
      type: string;
      files: { target?: string; content: string }[];
    };
    expect(item.type).toBe("registry:file");
    expect(item.files[0]?.target).toBe("AGENTS.md");
    expect(item.files[0]?.content).toContain("five calibrated springs");
  });

  test("the /mcp page's agent configs are valid JSON", async ({ page }) => {
    await page.goto("/mcp");
    // Every JSON code block on the page must parse.
    const jsonBlocks = await page
      .locator("figcaption:has-text('mcp.json') + div, figcaption:has-text('server entry') + div")
      .allInnerTexts();
    for (const block of jsonBlocks) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });
});
