"use client";

import * as React from "react";

import { UnfoldCard, type UnfoldItem } from "@/registry/ui/unfold-card";

const LISTINGS = [
  {
    id: "mill",
    name: "Mill Row 4",
    note: "Two beds · 68 m²",
    price: "418,000",
    facts: [
      ["Tenure", "Freehold"],
      ["Built", "1912"],
      ["Heating", "Air source"],
      ["Council band", "C"],
    ],
  },
  {
    id: "kiln",
    name: "Kiln Yard 12",
    note: "Three beds · 94 m²",
    price: "545,000",
    facts: [
      ["Tenure", "Freehold"],
      ["Built", "1974"],
      ["Heating", "Gas"],
      ["Council band", "D"],
    ],
  },
  {
    id: "weir",
    name: "Weir Cottage",
    note: "One bed · 41 m²",
    price: "262,000",
    facts: [
      ["Tenure", "Leasehold"],
      ["Built", "1886"],
      ["Heating", "Electric"],
      ["Council band", "B"],
    ],
  },
];

const ITEMS: UnfoldItem[] = LISTINGS.map((listing) => ({
  id: listing.id,
  summary: (
    <span className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {listing.name}
        </span>
        <span className="block truncate text-[11px] text-ink-3">
          {listing.note}
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums">
        {listing.price}
      </span>
    </span>
  ),
  detail: (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {listing.facts.map(([term, value]) => (
        <React.Fragment key={term}>
          <dt className="text-[11px] text-ink-3">{term}</dt>
          <dd className="text-right font-mono text-[11px] tabular-nums">
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  ),
}));

export function UnfoldCardDemo() {
  const [openId, setOpenId] = React.useState<string | null>("mill");
  const open = LISTINGS.find((listing) => listing.id === openId);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <UnfoldCard
        label="Basinworks listings"
        items={ITEMS}
        open={openId}
        onOpenChange={setOpenId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            Open ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {open.name}
            </span>
          </>
        ) : (
          "All folded"
        )}
      </p>
    </div>
  );
}
