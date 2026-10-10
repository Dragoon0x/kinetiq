"use client";

import * as React from "react";

import { Plus } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TallyRoll, type TallyRollFormat } from "@/registry/ui/tally-roll";

export const tweaks = defineTweaks({
  format: {
    kind: "choice",
    label: "Format",
    default: "number",
    options: ["number", "currency", "percent", "compact"],
    names: {
      number: "Number",
      currency: "Currency",
      percent: "Percent",
      compact: "Compact",
    },
  },
  duration: {
    kind: "range",
    label: "Duration",
    default: 1600,
    min: 600,
    max: 3000,
    step: 200,
    unit: "ms",
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 420,
    min: 120,
    max: 900,
    step: 60,
  },
  housing: { kind: "toggle", label: "Housing", default: true },
});

/** Each format gets a figure it suits, and a step the log button adds. */
const FIGURES: Record<
  TallyRollFormat,
  { label: string; base: number; step: number; unit: string; max?: number }
> = {
  number: {
    label: "Deliveries this year",
    base: 12480,
    step: 137,
    unit: "deliveries",
  },
  currency: {
    label: "Raised for trail repair",
    base: 184250,
    step: 1370,
    unit: "raised",
  },
  percent: {
    label: "On-time rate",
    base: 0.982,
    step: 0.002,
    unit: "on time",
    max: 1,
  },
  compact: {
    label: "Riders served",
    base: 1240000,
    step: 137000,
    unit: "riders",
  },
};

/**
 * A Gaugeworks impact card: the year's figure rolls up on its wheels the
 * first time the card is seen, and logging more bends the roll to the new
 * figure wherever the wheels happen to be.
 */
export function TallyRollDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const format = values.format ?? "number";
  const figure = FIGURES[format] ?? FIGURES.number;
  const [logged, setLogged] = React.useState(0);
  const [rolling, setRolling] = React.useState(false);
  const value = Math.min(
    figure.max ?? Infinity,
    Number((figure.base + logged * figure.step).toFixed(4)),
  );

  return (
    <div className="@container flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center-safe gap-2 text-center">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · {figure.label}
        </p>
        <TallyRoll
          value={value}
          sound={sound}
          onRollStart={() => setRolling(true)}
          onComplete={() => setRolling(false)}
          className="text-[2.4rem] font-semibold tracking-[-0.02em] text-foreground @[18rem]:text-[2.9rem]"
          {...values}
        />
        <p className="text-xs text-ink-3">Press the figure to count again.</p>
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {rolling ? "rolling…" : `landed · ${figure.unit}`}
          </p>
          <button
            type="button"
            onClick={() => setLogged((n) => n + 1)}
            className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <Plus aria-hidden className="size-3.5 shrink-0" />
            Log more
          </button>
        </div>
      ) : null}
    </div>
  );
}
