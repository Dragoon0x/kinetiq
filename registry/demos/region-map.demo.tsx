"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRegionMapData,
  defaultRegionMapRegions,
  defaultRegionMapStats,
  RegionMap,
} from "@/registry/ui/region-map";

export const tweaks = defineTweaks({
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 2.5,
    min: 1,
    max: 4,
    step: 0.25,
    unit: "×",
  },
  legend: {
    kind: "choice",
    label: "Legend",
    default: "steps",
    options: ["steps", "ramp"],
    names: { steps: "Stepped", ramp: "Continuous" },
  },
  scheme: {
    kind: "choice",
    label: "Scheme",
    default: "cobalt",
    options: ["cobalt", "signal", "heat", "diverging"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      heat: "Heat",
      diverging: "Diverging",
    },
  },
});

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const reading = (metric: string, v: number) => {
  if (metric === "revenue") return money.format(v);
  if (metric === "growth")
    return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}% growth`;
  if (metric === "trips") return `${v.toFixed(1)} trips per rider`;
  return `${count.format(v)} riders`;
};

/**
 * Fieldline's bike-share network across fourteen regions of an invented
 * coast: riders, revenue, growth on last quarter and trips per rider.
 */
export function RegionMapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [metric, setMetric] = React.useState("riders");
  const [picked, setPicked] = React.useState<string | null>(null);
  const [band, setBand] = React.useState<[number, number] | null>(null);

  const map = (
    <RegionMap
      title="Fieldline riders"
      subtitle="September · 14 regions"
      sound={sound}
      {...values}
      onMetricChange={setMetric}
      onValueChange={setPicked}
      onBandChange={setBand}
    />
  );

  if (!chrome) return <div className="w-full">{map}</div>;

  const stat = defaultRegionMapStats.find((s) => s.id === metric);
  const valueOf = (id: string) =>
    defaultRegionMapData.find((d) => d.region === id)?.values[metric] ?? 0;
  const ranked = [...defaultRegionMapRegions].sort(
    (a, b) => valueOf(b.id) - valueOf(a.id),
  );
  const region = picked
    ? defaultRegionMapRegions.find((r) => r.id === picked)
    : undefined;
  const inBand = band
    ? defaultRegionMapRegions.filter((r) => {
        const v = valueOf(r.id);
        return v >= band[0] && v <= band[1];
      }).length
    : 0;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {map}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {region ? (
          <>
            <span className="text-signal">{region.name}</span> ·{" "}
            {reading(metric, valueOf(region.id))} · rank{" "}
            {ranked.findIndex((r) => r.id === region.id) + 1} of {ranked.length}
          </>
        ) : band ? (
          <>
            <span className="text-signal">
              band {reading(metric, band[0]).replace(/ .*/, "")}–
              {reading(metric, band[1])}
            </span>{" "}
            · {inBand} {inBand === 1 ? "region" : "regions"}
          </>
        ) : (
          <>
            <span className="text-signal">
              all regions · {stat?.label.toLowerCase() ?? metric}
            </span>{" "}
            · top: {ranked[0]?.name ?? "—"}
          </>
        )}
      </p>
    </div>
  );
}
