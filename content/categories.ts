/**
 * The presentation taxonomy: fourteen ordered categories that drive the docs
 * nav, the index chip rails, the explorer filters, and the landing pages.
 *
 * This is an ADDITIVE layer. The manifest `categories` strings are a published
 * surface (they flow into registry-meta.json, the MCP catalog, and
 * validate:meta), so we never rewrite them — we alias them here instead. New
 * items may also use a taxonomy slug directly; `categoryOf` resolves both.
 *
 * Hook-free and import-free so tsx build scripts and server components can both
 * consume it (the item shape is structural, not the manifest type).
 */

export type CategorySlug =
  | "inputs"
  | "selection"
  | "navigation"
  | "overlays"
  | "data"
  | "feedback"
  | "layout"
  | "motion"
  | "text"
  | "backgrounds"
  | "cursor"
  | "physics"
  | "spatial"
  | "delight";

export type Category = {
  slug: CategorySlug;
  label: string;
  blurb: string;
};

/** The ordered taxonomy. Order drives nav, index rails, and landing pages. */
export const CATEGORIES: Category[] = [
  {
    slug: "inputs",
    label: "Inputs",
    blurb:
      "Fields, buttons, and controls that take a value and answer the press.",
  },
  {
    slug: "selection",
    label: "Selection",
    blurb:
      "Pick one or many — switches, segments, and choosers with a decisive throw.",
  },
  {
    slug: "navigation",
    label: "Navigation",
    blurb:
      "Move between views: tabs, menus, rails, and orbits that project to a detent.",
  },
  {
    slug: "overlays",
    label: "Overlays",
    blurb:
      "Layered surfaces — dialogs, sheets, and menus that arrive and dismiss with intent.",
  },
  {
    slug: "data",
    label: "Data",
    blurb:
      "Numbers made legible — readouts, charts, rings, and flows that draw themselves.",
  },
  {
    slug: "feedback",
    label: "Feedback",
    blurb:
      "Status in motion — toasts, loaders, and seals that confirm what just happened.",
  },
  {
    slug: "layout",
    label: "Layout",
    blurb:
      "Structure that reflows — disclosure, grids, and shells that rearrange on the glide.",
  },
  {
    slug: "motion",
    label: "Motion",
    blurb:
      "Motion as the material — tickers, reveals, and timelines tied to scroll and time.",
  },
  {
    slug: "text",
    label: "Text",
    blurb:
      "Typography that performs — decoding, focusing, and settling one character at a time.",
  },
  {
    slug: "backgrounds",
    label: "Backgrounds",
    blurb:
      "Living surfaces — fields, lattices, and ribbons that answer the cursor.",
  },
  {
    slug: "cursor",
    label: "Cursor",
    blurb:
      "The pointer as an instrument — trails, magnets, and spotlights that track your hand.",
  },
  {
    slug: "physics",
    label: "Physics",
    blurb:
      "Mass, spring, and momentum — sheets, ropes, and decks you can actually throw.",
  },
  {
    slug: "spatial",
    label: "Spatial",
    blurb:
      "Depth and perspective — cards, globes, and dioramas that bank in three dimensions.",
  },
  {
    slug: "delight",
    label: "Delight",
    blurb:
      "Small celebrations — taps, bursts, and reactions calibrated to the millisecond.",
  },
];

const CATEGORY_SLUGS = new Set<string>(CATEGORIES.map((c) => c.slug));

/**
 * Each published manifest category string → a taxonomy slug. Only the first
 * category on an item is consulted. New items using a taxonomy slug directly
 * (e.g. "physics") resolve by identity in `categoryOf` and need no entry here.
 */
const CATEGORY_ALIASES: Record<string, CategorySlug> = {
  // inputs
  forms: "inputs",
  buttons: "inputs",
  controls: "inputs",
  authentication: "inputs",
  // navigation
  menus: "navigation",
  // overlays
  overlay: "overlays",
  // data
  finance: "data",
  commerce: "data",
  // feedback
  onboarding: "feedback",
  // layout
  disclosure: "layout",
  application: "layout",
  pages: "layout",
  // spatial
  display: "spatial",
};

/** The taxonomy slug an item belongs to, from its first category string. */
export function categoryOf(item: { categories?: string[] }): CategorySlug {
  const first = item.categories?.[0]?.toLowerCase();
  if (!first) return "delight";
  if (CATEGORY_SLUGS.has(first)) return first as CategorySlug;
  return CATEGORY_ALIASES[first] ?? "delight";
}

export const categoryBySlug = (slug: string): Category | undefined =>
  CATEGORIES.find((c) => c.slug === slug);

/**
 * Group items by taxonomy slug in CATEGORIES order, dropping empty categories.
 * The item type is preserved so callers keep their manifest fields.
 */
export function itemsByCategory<T extends { categories?: string[] }>(
  items: T[],
): { category: Category; items: T[] }[] {
  const buckets = new Map<CategorySlug, T[]>();
  for (const item of items) {
    const slug = categoryOf(item);
    const bucket = buckets.get(slug);
    if (bucket) bucket.push(item);
    else buckets.set(slug, [item]);
  }
  return CATEGORIES.map((category) => ({
    category,
    items: buckets.get(category.slug) ?? [],
  })).filter((group) => group.items.length > 0);
}
