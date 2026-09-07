"use client";

import * as React from "react";

import { SwipeTabs } from "@/registry/ui/swipe-tabs";

const DETAILS = [
  ["Order", "WL-4192"],
  ["Placed", "12 Mar, 09:14"],
  ["Ship to", "Basinworks depot 3"],
  ["Carrier", "Coldbrook overnight"],
] as const;

const ITEMS = [
  ["Fieldline sensor rail", "2 × 84.00"],
  ["Gaugeworks clamp set", "1 × 46.50"],
  ["Fernworks mount plate", "4 × 12.25"],
] as const;

const TIMELINE = [
  ["09:14", "Order placed"],
  ["09:20", "Payment cleared"],
  ["11:02", "Picked at depot 3"],
  ["14:38", "Left the depot"],
  ["07:05", "Out for delivery"],
] as const;

export function SwipeTabsDemo() {
  const [tab, setTab] = React.useState("details");

  const tabs = [
    {
      id: "details",
      label: "Details",
      content: (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
          {DETAILS.map(([term, description]) => (
            <React.Fragment key={term}>
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-right font-medium">{description}</dd>
            </React.Fragment>
          ))}
        </dl>
      ),
    },
    {
      id: "items",
      label: "Items",
      content: (
        <ul className="p-4 text-sm">
          {ITEMS.map(([name, price]) => (
            <li
              key={name}
              className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0"
            >
              <span className="min-w-0 truncate">{name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {price}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "timeline",
      label: "Timeline",
      content: (
        <ol className="flex flex-col gap-3 p-4 text-sm">
          {TIMELINE.map(([time, event]) => (
            <li key={time + event} className="flex items-center gap-3">
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {time}
              </span>
              <span className="size-1.5 shrink-0 rounded-full bg-cobalt-bright" />
              <span className="min-w-0 truncate">{event}</span>
            </li>
          ))}
        </ol>
      ),
    },
  ];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="h-[300px] overflow-y-auto rounded-3 border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <span className="text-sm font-semibold">Waylight order</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            WL-4192
          </span>
        </div>
        <SwipeTabs
          aria-label="Order sections"
          tabs={tabs}
          value={tab}
          onValueChange={setTab}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Tab <span className="text-[var(--signal,var(--primary))]">{tab}</span>
      </p>
    </div>
  );
}
