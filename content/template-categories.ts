/**
 * Templates: complete landing sites, serials KT-001+. Each is one page
 * assembled end to end from shipped sections — navbar through footer — so a
 * template is a starting point rather than a new kind of thing to maintain.
 *
 * Templates are `registry:page` items like pages, but live in their own
 * manifest. `isPage()` looks for a page-family category, which templates do
 * not carry, so the two wings never leak into each other's index or sweep.
 *
 * Hook-free and import-free so tsx build scripts and server components can
 * both consume it.
 */

export type TemplateKind = {
  slug: string;
  label: string;
  blurb: string;
};

/** Ordered by how commonly a team reaches for them. */
export const TEMPLATE_KINDS: TemplateKind[] = [
  {
    slug: "saas",
    label: "SaaS",
    blurb:
      "The full argument, top to bottom, for a product that has to be believed before it is bought.",
  },
  {
    slug: "launch",
    label: "Launch",
    blurb:
      "One announcement, one ask — for the weeks before there is much to show.",
  },
  {
    slug: "agent",
    label: "Agent",
    blurb:
      "For products whose core act is a conversation, demonstrated in its own medium.",
  },
  {
    slug: "studio",
    label: "Studio",
    blurb:
      "Image-first, where the work has to carry the page and the copy gets out of the way.",
  },
  {
    slug: "data",
    label: "Data",
    blurb:
      "For instruments — grids, trends, and integrations that have to be shown working.",
  },
  {
    slug: "transparency",
    label: "Transparency",
    blurb:
      "The honest play: price forward, failures published, and who it is not for.",
  },
];

const KIND_SLUGS = new Set<string>(TEMPLATE_KINDS.map((k) => k.slug));

/** The kind a template belongs to, or undefined for anything else. */
export function templateKindOf(item: {
  categories?: string[];
}): TemplateKind | undefined {
  const first = item.categories?.[0]?.toLowerCase();
  if (!first) return undefined;
  return TEMPLATE_KINDS.find((k) => k.slug === first);
}

/** Whether a catalog item is a complete template. */
export function isTemplate(item: {
  type?: string;
  categories?: string[];
}): boolean {
  if (item.type !== "registry:page") return false;
  const first = item.categories?.[0]?.toLowerCase();
  return first !== undefined && KIND_SLUGS.has(first);
}
