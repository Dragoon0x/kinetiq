"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AnalyticsConsole,
  defaultConsoleDimensions,
  defaultConsoleSites,
  type ConsoleFilters,
  type ConsoleRange,
  type ConsoleWindow,
} from "@/registry/ui/analytics-console";

export const tweaks = defineTweaks({
  range: {
    kind: "choice",
    label: "Range",
    default: "30d",
    options: ["7d", "30d", "90d", "1y"],
    names: {
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
      "1y": "1 year",
    },
  },
  grid: {
    kind: "choice",
    label: "Grid",
    default: "bento",
    options: ["bento", "even", "stack"],
    names: { bento: "Bento", even: "Even", stack: "Stack" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
});

const NAMES: Record<ConsoleRange, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
  "1y": "last year",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const day = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};

/**
 * Fernworks' three stores on the last day of September: revenue and orders,
 * where the visitors came from, and which pages they read.
 */
export function AnalyticsConsoleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets where the period starts; the switch moves it from there.
  const [range, setRange] = React.useState<ConsoleRange>(values.range ?? "30d");
  const [seenRange, setSeenRange] = React.useState(values.range);
  if (seenRange !== values.range) {
    setSeenRange(values.range);
    if (values.range !== undefined) setRange(values.range);
  }
  const [site, setSite] = React.useState("fernworks");
  const [filters, setFilters] = React.useState<ConsoleFilters>({});
  const [zoom, setZoom] = React.useState<ConsoleWindow | null>(null);

  const screen = (
    <AnalyticsConsole
      sound={sound}
      {...values}
      range={range}
      onRangeChange={(r) => {
        setRange(r);
        setZoom(null);
      }}
      onWindowChange={(w) => setZoom(w.custom ? w : null)}
      site={site}
      onSiteChange={setSite}
      filters={filters}
      onFiltersChange={setFilters}
    />
  );

  if (!chrome) return <div className="w-full">{screen}</div>;

  const store =
    defaultConsoleSites.find((s) => s.id === site)?.name.toLowerCase() ?? site;
  const chosen = defaultConsoleDimensions
    .map((dim) => dim.options.find((o) => o.id === filters[dim.id]))
    .filter((o) => o !== undefined);
  const slice = chosen.length
    ? chosen.map((o) => o.label.toLowerCase()).join(" · ")
    : "all traffic";
  const share = Math.round(chosen.reduce((s, o) => s * o.share, 1) * 100);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {screen}
      <p
        role="status"
        className="truncate border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {zoom ? (
          <>
            <span className="text-signal">
              zoomed to {day(zoom.from)} – {day(zoom.to)}
            </span>{" "}
            · every panel follows · esc resets
          </>
        ) : (
          <>
            <span className="text-signal">{store}</span> · {NAMES[range]} ·{" "}
            {slice}
            {chosen.length ? ` · about ${share}% of visitors` : ""}
          </>
        )}
      </p>
    </div>
  );
}
