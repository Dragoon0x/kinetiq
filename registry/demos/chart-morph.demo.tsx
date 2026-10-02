"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ChartMorph,
  defaultChartMorphLabels,
  defaultChartMorphSeries,
  type ChartMorphType,
} from "@/registry/ui/chart-morph";

export const tweaks = defineTweaks({
  type: {
    kind: "choice",
    label: "Type",
    default: "bar",
    options: ["bar", "line", "area", "dot"],
    names: { bar: "Bars", line: "Line", area: "Area", dot: "Dots" },
  },
  smooth: {
    kind: "range",
    label: "Smooth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  points: {
    kind: "range",
    label: "Points",
    default: 12,
    min: 6,
    max: 24,
    step: 2,
  },
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
/** $48.2K: built by hand, since compact notation differs between platforms. */
const compact = {
  format: (v: number) =>
    v >= 1e3 ? `${usd.format(Math.round(v / 100) / 10)}K` : usd.format(v),
};

/**
 * Fernworks Supply's monthly payment volume on Waylight Pay over two years:
 * cards, wallets and bank transfers.
 */
export function ChartMorphDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets where the type starts; the visitor's presses move it
  // from there.
  const [type, setType] = React.useState<ChartMorphType>(values.type ?? "bar");
  const [seenType, setSeenType] = React.useState(values.type);
  if (seenType !== values.type) {
    setSeenType(values.type);
    if (values.type !== undefined) setType(values.type);
  }
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [cursor, setCursor] = React.useState<number | null>(null);

  const chart = (
    <ChartMorph
      title="Payment volume"
      subtitle="Fernworks Supply"
      sound={sound}
      {...values}
      type={type}
      onTypeChange={setType}
      hidden={hidden}
      onHiddenChange={setHidden}
      onCursorChange={setCursor}
    />
  );

  if (!chrome) return <div className="w-full">{chart}</div>;

  const shown = defaultChartMorphSeries.filter((s) => !hidden.includes(s.id));
  const points = values.points ?? 12;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {chart}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {cursor === null ? (
          <>
            <span className="text-signal">{type}</span> · last {points} months ·{" "}
            {shown.map((s) => s.label.toLowerCase()).join(", ")}
          </>
        ) : (
          <>
            <span className="text-signal">
              {(defaultChartMorphLabels[cursor] ?? "").toLowerCase()}
            </span>
            {shown
              .map(
                (s) =>
                  ` · ${s.label.toLowerCase()} ${compact.format(s.values[cursor] ?? 0)}`,
              )
              .join("")}
          </>
        )}
      </p>
    </div>
  );
}
