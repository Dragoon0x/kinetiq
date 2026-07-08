import type { MachineMetaItem } from "./schema.js";

export type SearchHit = {
  slug: string;
  title: string;
  tagline: string;
  category?: string;
  serial?: string;
  type: string;
};

/** Rank items against a free-text query with weighted field matches. */
export function rankComponents(
  query: string,
  items: MachineMetaItem[],
  opts: { type?: string; category?: string; limit?: number } = {},
): SearchHit[] {
  const q = query.trim().toLowerCase();
  const scored = items
    .filter((item) => (opts.type ? item.type === opts.type : true))
    .filter((item) =>
      opts.category ? (item.categories ?? []).includes(opts.category) : true,
    )
    .map((item) => ({ item, score: scoreItem(q, item) }))
    .filter((x) => q === "" || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 10);

  return scored.map(({ item }) => ({
    slug: item.slug,
    title: item.title,
    tagline: item.tagline,
    category: item.categories?.[0],
    serial: item.serial,
    type: item.type,
  }));
}

function scoreItem(q: string, item: MachineMetaItem): number {
  if (q === "") return 0;
  const title = item.title.toLowerCase();
  const slug = item.slug.toLowerCase();
  const tagline = item.tagline.toLowerCase();
  const keywords = item.keywords.map((k) => k.toLowerCase());
  const description = item.description.toLowerCase();

  let score = 0;
  if (slug === q || title === q) score += 100;
  if (slug.startsWith(q) || title.startsWith(q)) score += 40;
  if (slug.includes(q) || title.includes(q)) score += 20;
  if (keywords.some((k) => k === q)) score += 25;
  if (keywords.some((k) => k.includes(q))) score += 10;
  if (tagline.includes(q)) score += 8;
  if (description.includes(q)) score += 4;
  // Token overlap for multi-word queries.
  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (title.includes(token) || keywords.some((k) => k.includes(token))) {
      score += 3;
    }
  }
  return score;
}
