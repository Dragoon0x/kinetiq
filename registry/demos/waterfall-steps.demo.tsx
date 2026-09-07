"use client";

import * as React from "react";

import {
  WaterfallSteps,
  type WaterfallStep,
} from "@/registry/ui/waterfall-steps";

const OPENING = 42000;

const STEPS: WaterfallStep[] = [
  { label: "Receipts", delta: 18400 },
  { label: "Payroll", delta: -9600 },
  { label: "Grants", delta: 6200 },
  { label: "Fit-out", delta: -11800 },
];

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;

/** The same columns the chart builds, spelled out for the status line. */
const READINGS = (() => {
  let running = OPENING;
  const rows = [{ label: "Opening", text: money(OPENING) }];
  for (const step of STEPS) {
    running += step.delta;
    rows.push({
      label: step.label,
      text: `${step.delta < 0 ? "−" : "+"}${money(Math.abs(step.delta))} · ${money(running)}`,
    });
  }
  rows.push({ label: "Closing", text: money(running) });
  return rows;
})();

export function WaterfallStepsDemo() {
  const [index, setIndex] = React.useState<number | null>(null);
  const row = index === null ? undefined : READINGS[index];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <WaterfallSteps
        steps={STEPS}
        start={OPENING}
        format={money}
        label="Coldbrook cash bridge"
        onActiveChange={setIndex}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {row ? (
          <>
            {row.label} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {row.text}
            </span>
          </>
        ) : (
          "Hover or arrow-key a column"
        )}
      </p>
    </div>
  );
}
