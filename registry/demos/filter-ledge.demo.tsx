"use client";

import * as React from "react";

import { FilterLedge, type FilterChip } from "@/registry/ui/filter-ledge";

const TOTAL = 248;

const FILTERS: FilterChip[] = [
  { id: "waterfront", label: "Waterfront", count: 96 },
  { id: "pets", label: "Pet friendly", count: 132 },
  { id: "furnished", label: "Furnished", count: 74 },
  { id: "parking", label: "Parking", count: 158 },
  { id: "balcony", label: "Balcony", count: 61 },
  { id: "short", label: "Short stay", count: 43 },
];

/** Deterministic overlap estimate — the same ids always give the same total. */
function countFor(ids: string[]): number {
  return ids.reduce((total, id) => {
    const match = FILTERS.find((filter) => filter.id === id);
    return match?.count ? Math.round((total * match.count) / TOTAL) : total;
  }, TOTAL);
}

export function FilterLedgeDemo() {
  const [active, setActive] = React.useState<string[]>(["waterfront"]);

  const names = FILTERS.filter((filter) => active.includes(filter.id))
    .map((filter) => filter.label)
    .join(", ");

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <FilterLedge
        label="Basinworks listing filters"
        filters={FILTERS}
        value={active}
        onValueChange={setActive}
        resultCount={countFor(active)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {names || "No filters"} · {countFor(active)} listings
      </p>
    </div>
  );
}
