import { expect, test } from "@playwright/test";

import { catalogTemplates } from "../content/manifest";
import { isTemplate } from "../content/template-categories";

/**
 * A template is one site, so it must name one product. Sections each invent
 * their own narrative by design — which is right for a catalog and wrong for
 * a composed page — so this sweep reads the rendered DOM of every template
 * and fails on any product name that is not the template's own.
 *
 * Yard and place names inside section data ("North Basin", "Relay floor")
 * are narrative furniture rather than brands, so only the product names the
 * catalog actually uses are checked.
 */

const PRODUCT_NAMES = [
  "Waylight",
  "Keeper",
  "Fieldline",
  "Fernworks",
  "Basinworks",
  "Gaugeworks",
  "Ovenword",
] as const;

/** Each template's own product, taken from its rendered wordmark. */
const OWN: Record<string, string> = {
  "template-instrument": "Waylight",
  "template-launch": "Basinworks",
  "template-agent": "Fernworks",
  "template-studio": "Fernworks",
  "template-ledger": "Gaugeworks",
  "template-field": "Fieldline",
  "template-causeway": "Basinworks",
  // A personal site has no product wordmark of its own — its identity is a
  // person. See ALSO_NAMES below for why it still gets checked.
  "template-signature": "Waylight",
};

/**
 * Products a template may name besides its own, and the only ones it may.
 *
 * The one-product rule is right for a product site and wrong for exactly one
 * archetype: a portfolio, whose selected-work list is a client list by
 * definition. Exempting the archetype outright would let a genuine stray from
 * another template ride in unnoticed, so the allowance is spelled out per
 * slug instead — anything outside this set still fails.
 */
const ALSO_NAMES: Record<string, readonly string[]> = {
  "template-signature": ["Gaugeworks", "Fernworks", "Basinworks"],
};

const templates = catalogTemplates.filter(isTemplate).map((t) => t.name);

test.describe.configure({ mode: "parallel" });

for (const slug of templates) {
  test(`template ${slug} names exactly one product`, async ({ page }) => {
    const own = OWN[slug];
    // A template with no registered product would otherwise sail through
    // this check, which would make the guard worse than useless.
    if (!own) {
      throw new Error(
        `${slug} has no expected product name in OWN — register it, or this template goes unchecked.`,
      );
    }

    await page.setViewportSize({ width: 1280, height: 950 });
    await page.goto(`/preview/templates/${slug}`);
    await page.waitForSelector("body[data-hydrated]", { timeout: 30000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 50));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);

    const found = await page.evaluate((names: readonly string[]) => {
      const hits: Record<string, string> = {};
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? "";
        for (const name of names) {
          if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
            hits[name] ||= text.trim().slice(0, 60);
          }
        }
      }
      return hits;
    }, PRODUCT_NAMES);

    const allowed = new Set(
      [own, ...(ALSO_NAMES[slug] ?? [])].map((n) => n.toLowerCase()),
    );
    const strays = Object.entries(found).filter(
      ([name]) => !allowed.has(name.toLowerCase()),
    );
    expect(
      strays,
      `${slug} should name only ${own}, but also names: ${strays
        .map(([n, sample]) => `${n} ("${sample}")`)
        .join("; ")}`,
    ).toEqual([]);
  });
}
