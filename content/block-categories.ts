/**
 * The sections taxonomy: ordered families for the full-width landing blocks
 * (serials KB-201+). The original card blocks (KB-1xx) stay outside it and
 * keep their flat "Blocks" group.
 *
 * Same contract as content/categories.ts: an ADDITIVE layer over the
 * manifest's published `categories` strings — never rewrite those. A block
 * whose first category matches a family slug here is a SECTION and gets the
 * full-width presentation; anything else keeps the card treatment.
 *
 * Hook-free and import-free so tsx build scripts and server components can
 * both consume it.
 */

export type SectionFamilySlug =
  | "hero"
  | "navbar"
  | "features"
  | "pricing"
  | "stats"
  | "logo-cloud"
  | "testimonials"
  | "social-proof"
  | "cta"
  | "announcement"
  | "faq"
  | "step-form"
  | "empty-states"
  | "newsletter"
  | "contact"
  | "team"
  | "use-cases"
  | "how-it-works"
  | "offer"
  | "content-sections"
  | "integrations"
  | "data-tables"
  | "comparison"
  | "trust"
  | "galleries"
  | "footer";

export type SectionFamily = {
  slug: SectionFamilySlug;
  label: string;
  blurb: string;
};

/** Ordered by where each family sits on a landing page, top to bottom. */
export const SECTION_FAMILIES: SectionFamily[] = [
  {
    slug: "announcement",
    label: "Announcements",
    blurb:
      "The line above the fold — launches, releases, and standing notices.",
  },
  {
    slug: "navbar",
    label: "Navbars",
    blurb:
      "The header that holds the page — navigation, actions, and the mobile fold.",
  },
  {
    slug: "hero",
    label: "Hero Sections",
    blurb: "The opening argument — headline, proof, and the first action.",
  },
  {
    slug: "logo-cloud",
    label: "Logo Clouds",
    blurb: "Who already ships with it — rails and grids of marks.",
  },
  {
    slug: "features",
    label: "Feature Sections",
    blurb: "What it does, shown working — grids, bentos, and staged tours.",
  },
  {
    slug: "use-cases",
    label: "Use Cases",
    blurb: "Who it is for — roles, days, and outcomes people recognise.",
  },
  {
    slug: "offer",
    label: "What We Offer",
    blurb:
      "The offer stated plainly — services, outcomes, and the first step in.",
  },
  {
    slug: "how-it-works",
    label: "How It Works",
    blurb: "The path from start to done, one visible step at a time.",
  },
  {
    slug: "stats",
    label: "Stats",
    blurb: "The numbers that carry the claim — bands, indexes, and reports.",
  },
  {
    slug: "testimonials",
    label: "Testimonials",
    blurb: "Customers in their own words — walls, spotlights, and archives.",
  },
  {
    slug: "social-proof",
    label: "Social Proof",
    blurb: "Evidence in one band — marks, metrics, and a voice together.",
  },
  {
    slug: "pricing",
    label: "Pricing",
    blurb: "Plans made legible — tiers, usage, and the honest ledger.",
  },
  {
    slug: "comparison",
    label: "Comparison",
    blurb: "The decision laid flat — capabilities side by side.",
  },
  {
    slug: "trust",
    label: "Trust & Security",
    blurb: "Compliance, safeguards, and uptime — stated calmly, in full.",
  },
  {
    slug: "integrations",
    label: "Integrations",
    blurb: "The tools it meets — directories to browse, filter, and connect.",
  },
  {
    slug: "data-tables",
    label: "Data Tables",
    blurb: "Working grids for real records — sorted, filtered, and fast.",
  },
  {
    slug: "galleries",
    label: "Galleries",
    blurb: "Image-first sections — mosaics, rails, and moving walls.",
  },
  {
    slug: "content-sections",
    label: "Content Sections",
    blurb: "Editorial passages — narrative, metrics, and imagery in step.",
  },
  {
    slug: "step-form",
    label: "Step Forms",
    blurb: "Longer asks broken into stages, with the way back always open.",
  },
  {
    slug: "empty-states",
    label: "Empty States",
    blurb: "The first minute of a product — nothing yet, clearly said.",
  },
  {
    slug: "team",
    label: "Team",
    blurb: "The people behind it — grids and galleries with a human read.",
  },
  {
    slug: "newsletter",
    label: "Newsletter",
    blurb: "The ongoing relationship — signup moments worth the address.",
  },
  {
    slug: "contact",
    label: "Contact",
    blurb: "Ways in — routed intents, forms, and response expectations.",
  },
  {
    slug: "faq",
    label: "FAQ",
    blurb: "The questions answered before they are asked.",
  },
  {
    slug: "cta",
    label: "CTA Sections",
    blurb: "The closing move — one action, made hard to miss.",
  },
  {
    slug: "footer",
    label: "Footers",
    blurb: "The page's last word — links, status, and the wordmark at rest.",
  },
];

const FAMILY_SLUGS = new Set<string>(SECTION_FAMILIES.map((f) => f.slug));

/** Whether a catalog item is a full-width section (vs a card block). */
export function isSection(item: { categories?: string[] }): boolean {
  const first = item.categories?.[0]?.toLowerCase();
  return first !== undefined && FAMILY_SLUGS.has(first);
}

/** The family a section belongs to, or undefined for card blocks. */
export function sectionFamilyOf(item: {
  categories?: string[];
}): SectionFamily | undefined {
  const first = item.categories?.[0]?.toLowerCase();
  if (!first) return undefined;
  return SECTION_FAMILIES.find((f) => f.slug === first);
}

/**
 * Group sections by family in SECTION_FAMILIES order, dropping empty
 * families. Card blocks (non-section items) are excluded — list them
 * separately.
 */
export function sectionsByFamily<T extends { categories?: string[] }>(
  items: T[],
): { family: SectionFamily; items: T[] }[] {
  const buckets = new Map<SectionFamilySlug, T[]>();
  for (const item of items) {
    const family = sectionFamilyOf(item);
    if (!family) continue;
    const bucket = buckets.get(family.slug);
    if (bucket) bucket.push(item);
    else buckets.set(family.slug, [item]);
  }
  return SECTION_FAMILIES.map((family) => ({
    family,
    items: buckets.get(family.slug) ?? [],
  })).filter((group) => group.items.length > 0);
}
