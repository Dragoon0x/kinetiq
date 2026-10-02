"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPulseMetrics,
  defaultPulseNow,
  PulseDashboard,
  type PulseRange,
  type PulseWindow,
} from "@/registry/ui/pulse-dashboard";

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
  smooth: {
    kind: "range",
    label: "Smooth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.1,
  },
  donut: {
    kind: "choice",
    label: "Donut",
    default: "channel",
    options: ["channel", "plan", "region"],
    names: { channel: "By channel", plan: "By plan", region: "By region" },
  },
});

const DAY_MS = 86_400_000;
const SPAN: Record<PulseRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};
const NAMES: Record<PulseRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const revenue = defaultPulseMetrics[0]?.series ?? [];

const indexOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return (
    revenue.length -
    1 -
    Math.round((defaultPulseNow - Date.UTC(y, m - 1, d)) / DAY_MS)
  );
};
const sum = (from: number, to: number) => {
  let total = 0;
  for (let i = Math.max(0, from); i < Math.min(revenue.length, to); i += 1) {
    total += revenue[i] ?? 0;
  }
  return total;
};
const dayName = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Fernworks Supply's store on Waylight Pay, up to the last day of
 * September: revenue, orders, conversion and refunds, and where the revenue
 * came from.
 */
export function PulseDashboardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweaks set where the period and the breakdown start; the visitor's
  // presses move them from there.
  const [range, setRange] = React.useState<PulseRange>(values.range ?? "30d");
  const [seenRange, setSeenRange] = React.useState(values.range);
  if (seenRange !== values.range) {
    setSeenRange(values.range);
    if (values.range !== undefined) setRange(values.range);
  }
  const [donut, setDonut] = React.useState<string>(values.donut ?? "channel");
  const [seenDonut, setSeenDonut] = React.useState(values.donut);
  if (seenDonut !== values.donut) {
    setSeenDonut(values.donut);
    if (values.donut !== undefined) setDonut(values.donut);
  }
  const [zoom, setZoom] = React.useState<PulseWindow | null>(null);

  const board = (
    <PulseDashboard
      title="Fernworks Supply"
      subtitle="Waylight Pay"
      sound={sound}
      {...values}
      range={range}
      onRangeChange={(r) => {
        setRange(r);
        setZoom(null);
      }}
      donut={donut}
      onDonutChange={setDonut}
      onWindowChange={(w) => setZoom(w.custom ? w : null)}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const span = SPAN[range];
  const from = zoom ? indexOf(zoom.from) : revenue.length - span;
  const to = zoom ? indexOf(zoom.to) + 1 : revenue.length;
  const len = to - from;
  const now = sum(from, to);
  const before = from - len >= 0 ? sum(from - len, from) : null;
  const change = before
    ? Number((((now - before) / before) * 100).toFixed(1)) || 0
    : null;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {zoom
            ? `zoomed to ${dayName(zoom.from)} – ${dayName(zoom.to)}`
            : NAMES[range]}
        </span>{" "}
        · revenue {usd.format(Math.round(now))}
        {change === null
          ? ""
          : ` · ${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(1)}% vs previous`}
        {zoom ? " · esc resets" : ""}
      </p>
    </div>
  );
}
