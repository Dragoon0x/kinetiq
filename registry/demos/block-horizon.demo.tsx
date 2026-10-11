"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BlockHorizon,
  defaultBlockHorizonSeries,
} from "@/registry/ui/block-horizon";

export const tweaks = defineTweaks({
  blockSize: {
    kind: "range",
    label: "Block size",
    default: 18,
    min: 12,
    max: 30,
    step: 2,
    unit: "px",
  },
  swell: {
    kind: "range",
    label: "Swell",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sunAngle: {
    kind: "range",
    label: "Sun angle",
    default: 12,
    min: 4,
    max: 40,
    step: 2,
    unit: "°",
  },
});

const POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

/**
 * Fieldline analytics: the last fourteen weeks of sessions stand in the near
 * rows of a sea that keeps rolling behind them.
 */
export function BlockHorizonDemo({
  chrome = true,
  // The sea is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [heading, setHeading] = React.useState(35);
  const series = defaultBlockHorizonSeries;
  const latest = series[series.length - 1] ?? 0;
  const before = series[series.length - 2] ?? latest;
  const change = Math.round(((latest - before) / before) * 1000) / 10;
  const from = POINTS[Math.round(heading / 45) % 8] ?? "north";

  const sea = (
    <BlockHorizon
      series={series}
      seriesLabel="Fieldline weekly sessions, thousands"
      value={heading}
      onValueChange={setHeading}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-3.5">
        <div className="rounded-2 border border-hairline bg-background/80 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · sessions
          </p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg leading-tight font-medium text-foreground tabular-nums">
              {latest.toFixed(1)}k
            </span>
            <span className="text-xs text-success tabular-nums">
              {change > 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          </p>
        </div>
      </div>
    </BlockHorizon>
  );

  if (!chrome) return <div className="flex w-full">{sea}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sea}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">heading {heading}°</span> · swell from the{" "}
        {from} · {series.length} weeks
      </p>
    </div>
  );
}
