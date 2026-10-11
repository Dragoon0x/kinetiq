"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CornerTide } from "@/registry/ui/corner-tide";

export const tweaks = defineTweaks({
  exponent: {
    kind: "range",
    label: "Exponent",
    default: 6,
    min: 3,
    max: 12,
    step: 0.5,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 6,
    min: 2,
    max: 16,
    step: 1,
    unit: "px",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Tile Co.: a hero for their glazed tile range, laid over a grid
 * whose corners round and square in a tide, and ripple where you click.
 */
export function CornerTideDemo({
  chrome = true,
  // The grid is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sent, setSent] = React.useState(0);
  const top = values.exponent ?? 6;

  const grid = (
    <CornerTide
      onRipple={() => setSent((n) => n + 1)}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks · glazed tile
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Corners, fired soft.
          </p>
        </div>
      </div>
    </CornerTide>
  );

  if (!chrome) return <div className="flex w-full">{grid}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {grid}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">exponent 2.0–{top.toFixed(1)}</span> ·{" "}
        {sent === 0
          ? "click to send a ripple"
          : sent === 1
            ? "1 ripple sent"
            : `${sent} ripples sent`}
      </p>
    </div>
  );
}
