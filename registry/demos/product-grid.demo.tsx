"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultProductColors,
  defaultProducts,
  matchProducts,
  ProductGrid,
  type ProductGridFilters,
  type ProductGridSort,
} from "@/registry/ui/product-grid";

export const tweaks = defineTweaks({
  reflow: {
    kind: "choice",
    label: "Reflow",
    default: "glide",
    options: ["glide", "wave", "fade"],
    names: { glide: "Glide", wave: "Wave", fade: "Fade" },
  },
  quickview: {
    kind: "choice",
    label: "Quick view",
    default: "morph",
    options: ["morph", "sheet", "side"],
    names: { morph: "Morph", sheet: "Sheet", side: "Side panel" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
});

const NONE: ProductGridFilters = {
  categories: [],
  colors: [],
  price: null,
  inStock: false,
};

const SORT_NAMES: Record<ProductGridSort, string> = {
  featured: "featured",
  "price-asc": "price low to high",
  "price-desc": "price high to low",
  newest: "newest",
  rating: "top rated",
};

/**
 * Fernworks Home's kitchen shelf: sixteen pieces in six glazes, filtered and
 * sorted by the visitor, with a bag that counts what was added.
 */
export function ProductGridDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [filters, setFilters] = React.useState<ProductGridFilters>(NONE);
  const [sort, setSort] = React.useState<ProductGridSort>("featured");
  const [bag, setBag] = React.useState(0);

  const grid = (
    <ProductGrid
      filters={filters}
      onFiltersChange={setFilters}
      sort={sort}
      onSortChange={setSort}
      onAddToCart={(_, options) => setBag((n) => n + options.qty)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{grid}</div>;

  const count = matchProducts(defaultProducts, filters).length;
  const picked = [
    ...filters.categories.map((c) => c.toLowerCase()),
    ...filters.colors.map(
      (c) =>
        defaultProductColors.find((x) => x.id === c)?.name.toLowerCase() ?? c,
    ),
    ...(filters.price ? [filters.price.replace("-", " to ")] : []),
    ...(filters.inStock ? ["in stock"] : []),
  ];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {grid}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {count} of {defaultProducts.length}
        </span>{" "}
        · {picked.length ? picked.join(", ") : "everything"} ·{" "}
        {SORT_NAMES[sort]} · bag {bag}
      </p>
    </div>
  );
}
