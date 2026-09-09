"use client";

import * as React from "react";

import { IndexDial } from "@/registry/ui/index-dial";

/** Yesterday's close, and today's prints in the order they arrived. */
const PREVIOUS_CLOSE = 4156.8;
const PRINTS = [4182.35, 4171.02, 4139.44, 4160.91, 4197.63];

const level = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function IndexDialDemo() {
  const [index, setIndex] = React.useState(0);
  const [settled, setSettled] = React.useState<number | null>(null);

  const value = PRINTS[index] ?? PRINTS[0]!;
  const percent = ((value - PREVIOUS_CLOSE) / PREVIOUS_CLOSE) * 100;
  const printed = `${percent < 0 ? "-" : "+"}${Math.abs(percent).toFixed(2)}%`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <IndexDial
        label="Basin 40"
        caption="Basinworks Exchange"
        value={value}
        previousClose={PREVIOUS_CLOSE}
        onSettle={(settledAt) => setSettled(settledAt)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={index >= PRINTS.length - 1}
          onClick={() => setIndex((current) => current + 1)}
        >
          Next print
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={index === 0}
          onClick={() => setIndex(0)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basin 40{" "}
        <span className="text-cobalt-bright tabular-nums">
          {level.format(value)}
        </span>{" "}
        · <span className="tabular-nums">{printed}</span> ·{" "}
        <span className="text-signal">
          {settled === value ? "settled" : "swinging"}
        </span>
      </p>
    </div>
  );
}
