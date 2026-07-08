import { blocks } from "./blocks";
import { components } from "./components";
import { shared } from "./shared";
import { kinetiqItemSchema, type KinetiqItem } from "./types";

/** Every distributable item, validated. Throws at import time on a bad entry. */
export const allItems: KinetiqItem[] = [
  ...components,
  ...blocks,
  ...shared,
].map((item) => {
  const parsed = kinetiqItemSchema.safeParse(item);
  if (!parsed.success) {
    throw new Error(
      `Invalid manifest entry "${item.name}": ${parsed.error.message}`,
    );
  }
  return parsed.data;
});

const names = new Set<string>();
for (const item of allItems) {
  if (names.has(item.name)) {
    throw new Error(`Duplicate manifest entry name "${item.name}"`);
  }
  names.add(item.name);
}

const bySerial = (a: KinetiqItem, b: KinetiqItem) =>
  (a.meta?.serial ?? "").localeCompare(b.meta?.serial ?? "");

/** Catalog items that appear in nav/docs (excludes shared libs/hooks), in serial order. */
export const catalogComponents = components
  .filter((c) => !c.draft)
  .sort(bySerial);
export const catalogBlocks = blocks.filter((b) => !b.draft).sort(bySerial);

export const itemBySlug = (slug: string): KinetiqItem | undefined =>
  allItems.find((item) => item.name === slug);

export { components, blocks, shared };
export type { KinetiqItem } from "./types";
