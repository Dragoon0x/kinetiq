/**
 * The pages taxonomy: whole page compositions (serials KP-001+), assembled
 * from shipped sections rather than authored from scratch. A page's job is
 * to prove the wing composes — if a page needs markup a section could have
 * owned, that is a missing section, not page-local styling.
 *
 * Same additive contract as content/block-categories.ts: this layers over the
 * manifest's published `categories` strings and never rewrites them.
 *
 * Hook-free and import-free so tsx build scripts and server components can
 * both consume it.
 */

export type PageFamilySlug =
  "auth" | "onboarding" | "about" | "careers" | "changelog" | "blog" | "errors";

export type PageFamily = {
  slug: PageFamilySlug;
  label: string;
  blurb: string;
};

/** Ordered roughly by where a visitor meets them. */
export const PAGE_FAMILIES: PageFamily[] = [
  {
    slug: "auth",
    label: "Auth",
    blurb: "Getting in — sign in, sign up, recovery, and the second factor.",
  },
  {
    slug: "onboarding",
    label: "Onboarding",
    blurb:
      "The first session, from empty account to something worth returning to.",
  },
  {
    slug: "about",
    label: "About",
    blurb: "Who is behind it, and what they have decided to be answerable for.",
  },
  {
    slug: "careers",
    label: "Careers",
    blurb:
      "Open seats, said plainly enough that the wrong people self-select out.",
  },
  {
    slug: "changelog",
    label: "Changelog",
    blurb: "What shipped, what broke, and what changed because of it.",
  },
  {
    slug: "blog",
    label: "Blog",
    blurb: "Writing that earns its own traffic — index, post, and the archive.",
  },
  {
    slug: "errors",
    label: "Error Pages",
    blurb: "Every way a request can fail, answered without a dead end.",
  },
];

const FAMILY_SLUGS = new Set<string>(PAGE_FAMILIES.map((f) => f.slug));

/** Whether a catalog item is a whole page (vs a section or a component). */
export function isPage(item: {
  type?: string;
  categories?: string[];
}): boolean {
  if (item.type !== "registry:page") return false;
  const first = item.categories?.[0]?.toLowerCase();
  return first !== undefined && FAMILY_SLUGS.has(first);
}

/** The family a page belongs to, or undefined for anything else. */
export function pageFamilyOf(item: {
  categories?: string[];
}): PageFamily | undefined {
  const first = item.categories?.[0]?.toLowerCase();
  if (!first) return undefined;
  return PAGE_FAMILIES.find((f) => f.slug === first);
}

/** Group pages by family in PAGE_FAMILIES order, dropping empty families. */
export function pagesByFamily<T extends { categories?: string[] }>(
  items: T[],
): { family: PageFamily; items: T[] }[] {
  const buckets = new Map<PageFamilySlug, T[]>();
  for (const item of items) {
    const family = pageFamilyOf(item);
    if (!family) continue;
    const bucket = buckets.get(family.slug);
    if (bucket) bucket.push(item);
    else buckets.set(family.slug, [item]);
  }
  return PAGE_FAMILIES.map((family) => ({
    family,
    items: buckets.get(family.slug) ?? [],
  })).filter((group) => group.items.length > 0);
}
