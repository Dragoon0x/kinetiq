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
      .locator(
        "figcaption:has-text('mcp.json') + div, figcaption:has-text('server entry') + div",
      )
      .allInnerTexts();
    for (const block of jsonBlocks) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });
});

/**
 * Every page unfurls as itself. The root layout's Open Graph block is
 * inherited wholesale, so before lib/seo.ts a link to any component, guide
 * or template carried the home page's title, description and URL. This
 * walks one route of each kind and checks the tags a share reads, that the
 * card is a real image, and that the structured data parses.
 */
test.describe("share metadata", () => {
  const routes = [
    "/",
    "/components",
    "/components/pressure-button",
    "/components/category/inputs",
    "/blocks",
    "/pages",
    "/pages/onboarding-first-run",
    "/templates",
    "/explore",
    "/spatial",
    "/showcase",
    "/showcase/feedback",
    "/playground",
    "/playground/spring",
    "/guides",
    "/guides/reduced-motion",
    "/mcp",
    "/agents",
  ];

  for (const route of routes) {
    test(`${route} carries its own share tags`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      const html = await res.text();
      const meta = (prop: string) =>
        html.match(
          new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`),
        )?.[1];
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

      expect(canonical, "canonical").toBeTruthy();
      expect(new URL(canonical!).pathname).toBe(route);
      expect(new URL(meta("og:url")!).pathname).toBe(route);
      expect(meta("og:title"), "og:title").toBe(meta("twitter:title"));
      expect(meta("og:description"), "og:description").toBeTruthy();
      if (route !== "/") {
        expect(meta("og:title")).not.toBe("Kinetiq — Motion, calibrated.");
        expect(meta("og:title")).toContain(title.replace(/ · Kinetiq$/, ""));
      }
      expect(meta("og:image:alt"), "alt").toBeTruthy();

      const image = meta("og:image");
      expect(image, "og:image").toBeTruthy();
      const img = await request.get(new URL(image!).pathname);
      expect(img.status()).toBe(200);
      expect(img.headers()["content-type"]).toBe("image/png");
      expect(meta("og:image:width")).toBe("1200");

      const blocks = [
        ...html.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]!) as { "@type": string });
      const types = blocks.map((b) => b["@type"]);
      expect(types).toContain("WebSite");
      expect(types).toContain("Person");
      if (route !== "/") expect(types).toContain("BreadcrumbList");
    });
  }

  test("robots admits answer engines and names the sitemap", async ({
    request,
  }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("User-Agent: GPTBot");
    expect(text).toContain("User-Agent: ClaudeBot");
    expect(text).toContain("User-Agent: PerplexityBot");
    expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("/llms.txt lists every wing", async ({ request }) => {
    const text = await (await request.get("/llms.txt")).text();
    for (const section of [
      "## Components",
      "## Blocks",
      "## Pages",
      "## Templates",
      "## Categories",
      "## Showcases",
      "## Playground",
      "## Guides",
    ]) {
      expect(text).toContain(section);
    }
  });

  test("the web manifest and icons resolve", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const json = (await manifest.json()) as { icons: { src: string }[] };
    for (const icon of json.icons) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
    }
  });
});
