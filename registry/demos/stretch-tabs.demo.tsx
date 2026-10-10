"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { StretchTabs, type StretchTabsItem } from "@/registry/ui/stretch-tabs";

export const tweaks = defineTweaks({
  elastic: {
    kind: "range",
    label: "Elastic",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  segments: {
    kind: "range",
    label: "Segments",
    default: 4,
    min: 2,
    max: 5,
    step: 1,
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

const RANGES = [
  { value: "1d", short: "1D", name: "1 day", points: 24, seed: 11 },
  { value: "1w", short: "1W", name: "1 week", points: 28, seed: 23 },
  { value: "1m", short: "1M", name: "1 month", points: 30, seed: 37 },
  { value: "3m", short: "3M", name: "3 months", points: 36, seed: 53 },
  { value: "1y", short: "1Y", name: "1 year", points: 40, seed: 71 },
] as const;

const W = 300;
const H = 72;

/** A seeded walk per range: the same chart on the server and the client. */
const CHARTS = RANGES.map((r) => {
  let seed = r.seed * 7919;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const ys: number[] = [];
  let y = 0;
  for (let i = 0; i < r.points; i += 1) {
    y += (rand() - 0.46) * 1.4;
    ys.push(y);
  }
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pts = ys.map((v, i) => {
    const px = (i / (r.points - 1)) * W;
    const py = 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
    return `${Number(px.toFixed(2))} ${Number(py.toFixed(2))}`;
  });
  const first = ys[0] ?? 0;
  const last = ys[ys.length - 1] ?? 0;
  const change = Number(((last - first) * 1.9).toFixed(1));
  return {
    line: `M${pts.join("L")}`,
    area: `M0 ${H}L${pts.join("L")}L${W} ${H}Z`,
    change,
    price: Number((412.08 * (1 + change / 100)).toFixed(2)),
  };
});

/**
 * A Basinworks fund card: the range tabs are made of rubber, and the chart
 * below is their panel.
 */
export function StretchTabsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [range, setRange] = React.useState<string>("1m");
  const panelId = React.useId();
  const count = Math.round(values.segments ?? 4);
  const shown = RANGES.slice(0, count);
  // Fewer segments than the chosen range: the card shows the longest left.
  const active = shown.some((r) => r.value === range)
    ? range
    : (shown[shown.length - 1]?.value ?? "1d");
  const at = RANGES.findIndex((r) => r.value === active);
  const chart = CHARTS[at] ?? CHARTS[0];
  const meta = RANGES[at] ?? RANGES[0];

  const items: StretchTabsItem[] = RANGES.map((r) => ({
    value: r.value,
    label: r.short,
    ariaLabel: r.name,
    controls: panelId,
  }));

  const card = (
    <div className="flex w-full max-w-[400px] flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basin BSN
          </p>
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-lg leading-tight text-foreground tabular-nums">
              {chart?.price.toFixed(2)}
            </span>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                (chart?.change ?? 0) >= 0 ? "text-success" : "text-danger",
              )}
            >
              {(chart?.change ?? 0) >= 0 ? "+" : "−"}
              {Math.abs(chart?.change ?? 0).toFixed(1)}%
            </span>
          </p>
        </div>
        <StretchTabs
          label="Range"
          items={items}
          value={active}
          onValueChange={setRange}
          sound={sound}
          {...values}
          segments={count}
        />
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-label={`Basin BSN, ${meta?.name ?? ""}`}
        className="relative"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[72px] w-full"
        >
          {CHARTS.map((c, i) => (
            <g
              key={i}
              className="transition-opacity duration-300 ease-out"
              style={{ opacity: i === at ? 1 : 0 }}
            >
              <path d={c.area} className="fill-cobalt-bright/10" />
              <path
                d={c.line}
                fill="none"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-cobalt-bright"
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">range {meta?.name}</span>
        {` · ${(chart?.change ?? 0) >= 0 ? "+" : "−"}${Math.abs(chart?.change ?? 0).toFixed(1)}%`}
      </p>
    </div>
  );
}
