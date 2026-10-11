"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  RootExchange,
  type RootExchangeNode,
} from "@/registry/ui/root-exchange";

export const tweaks = defineTweaks({
  pulseRate: {
    kind: "range",
    label: "Pulse rate",
    default: 4,
    min: 1,
    max: 10,
    step: 0.5,
    unit: "/s",
  },
  curve: {
    kind: "range",
    label: "Curve",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", amber: "Amber", ink: "Ink" },
  },
});

const DISTRICTS: RootExchangeNode[] = [
  { id: "harbour", label: "Harbour", value: 1640 },
  { id: "ridge", label: "Ridge", value: 420 },
  { id: "mill", label: "Mill Lane", value: 980 },
  { id: "orchard", label: "Orchard", value: 760 },
  { id: "quarry", label: "Quarry", value: 310 },
  { id: "ferry", label: "Ferry Row", value: 1210 },
  { id: "kiln", label: "Kiln Hill", value: 990 },
];

const TOTAL = DISTRICTS.reduce((sum, d) => sum + d.value, 0);
const NUMBER = new Intl.NumberFormat("en-US");

/**
 * Fernworks Water's live draw: the reservoir feeding seven districts, each
 * route pulsing at that district's share of today's flow.
 */
export function RootExchangeDemo({
  chrome = true,
  // The network is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<{
    id: string;
    inward: boolean;
  } | null>(null);
  const [reversed, setReversed] = React.useState<string[]>([]);

  const exchange = (
    <div className="@container relative w-full">
      <RootExchange
        nodes={DISTRICTS}
        hubLabel="Reservoir"
        format={(v) => `${NUMBER.format(v)} l/s`}
        reversed={reversed}
        onReversedChange={(ids) => {
          const added = ids.find((id) => !reversed.includes(id));
          const removed = reversed.find((id) => !ids.includes(id));
          const id = added ?? removed;
          if (id) setLast({ id, inward: Boolean(added) });
          setReversed(ids);
        }}
        onActiveChange={setActive}
        label="Districts fed by the reservoir"
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        {...values}
      />
      <p className="pointer-events-none absolute top-2.5 left-2.5 hidden rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm @[36rem]:block">
        Fernworks · live draw
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{exchange}</div>;

  const district = DISTRICTS.find((d) => d.id === active);
  const changed = DISTRICTS.find((d) => d.id === last?.id);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {exchange}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {district ? (
          <>
            <span className="text-signal">{district.label}</span> ·{" "}
            {NUMBER.format(district.value)} l/s ·{" "}
            {Math.round((district.value / TOTAL) * 100)}% ·{" "}
            {reversed.includes(district.id) ? "flows in" : "flows out"}
          </>
        ) : changed && last ? (
          <>
            <span className="text-signal">
              {changed.label} {last.inward ? "reversed" : "restored"}
            </span>{" "}
            · {last.inward ? "flows in" : "flows out"}
          </>
        ) : (
          <>
            <span className="text-signal">reservoir</span> ·{" "}
            {NUMBER.format(TOTAL)} l/s to {DISTRICTS.length} districts
          </>
        )}
      </p>
    </div>
  );
}
