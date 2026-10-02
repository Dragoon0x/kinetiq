"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultUsageDays,
  UsageLedger,
  type UsageRange,
} from "@/registry/ui/usage-ledger";

export const tweaks = defineTweaks({
  threshold: {
    kind: "range",
    label: "Alert",
    default: 1500000,
    min: 500000,
    max: 3000000,
    step: 250000,
    unit: "tokens/day",
  },
  stack: {
    kind: "choice",
    label: "Stack",
    default: "model",
    options: ["model", "kind", "total"],
    names: { model: "By model", kind: "By kind", total: "Total" },
  },
  range: {
    kind: "choice",
    label: "Range",
    default: "30d",
    options: ["7d", "30d", "90d"],
    names: { "7d": "7 days", "30d": "30 days", "90d": "90 days" },
  },
});

const LAST = Date.UTC(2026, 8, 28);
const TODAY = new Date(LAST).toISOString().slice(0, 10);
const SPAN: Record<UsageRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

const totalOf = (i: number) => {
  const day = defaultUsageDays[i];
  if (!day) return 0;
  let sum = 0;
  for (const u of Object.values(day.usage)) {
    sum += u.input + u.output + (u.cached ?? 0);
  }
  return sum;
};

const short = (n: number) =>
  n >= 1e6 ? `${Number((n / 1e6).toFixed(2))}m` : `${Math.round(n / 1e3)}k`;

const dayName = (iso: string) => {
  const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${months[m - 1] ?? ""} ${d}`;
};

/**
 * Fieldline's workspace usage for September: three models on a $330 monthly
 * budget, with a daily alert the team drags to where it wants to hear about.
 */
export function UsageLedgerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets where the line starts; the line itself is the visitor's.
  const [threshold, setThreshold] = React.useState(values.threshold ?? 1.5e6);
  const [seenThreshold, setSeenThreshold] = React.useState(values.threshold);
  if (seenThreshold !== values.threshold) {
    setSeenThreshold(values.threshold);
    if (values.threshold !== undefined) setThreshold(values.threshold);
  }
  const [range, setRange] = React.useState<UsageRange>(values.range ?? "30d");
  const [seenRange, setSeenRange] = React.useState(values.range);
  if (seenRange !== values.range) {
    setSeenRange(values.range);
    if (values.range !== undefined) setRange(values.range);
  }
  const [picked, setPicked] = React.useState<string | null>(null);

  const span = SPAN[range];
  const first = defaultUsageDays.length - span;
  let over = 0;
  for (let i = first; i < defaultUsageDays.length; i += 1) {
    if (totalOf(i) > threshold) over += 1;
  }
  const pickedIndex = picked
    ? defaultUsageDays.findIndex((d) => d.date === picked)
    : -1;
  const pickedTotal = pickedIndex >= 0 ? totalOf(pickedIndex) : 0;

  const ledger = (
    <UsageLedger
      title="Fieldline usage"
      now={LAST}
      onDaySelect={setPicked}
      sound={sound}
      {...values}
      threshold={threshold}
      onThresholdChange={setThreshold}
      range={range}
      onRangeChange={(r) => {
        setRange(r);
        setPicked(null);
      }}
    />
  );

  if (!chrome) return <div className="w-full">{ledger}</div>;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {ledger}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {picked && pickedIndex >= 0 ? (
          <>
            <span className="text-signal">
              {dayName(picked)} · {short(pickedTotal)} tokens
            </span>
            {pickedTotal > threshold
              ? ` · over by ${short(pickedTotal - threshold)}`
              : ` · ${short(threshold - pickedTotal)} under the alert`}
          </>
        ) : (
          <>
            <span className="text-signal">alert at {short(threshold)}/day</span>{" "}
            · {over} of {span} days over · {dayName(TODAY)} is today
          </>
        )}
      </p>
    </div>
  );
}
