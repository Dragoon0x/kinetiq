"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FlipSequins } from "@/registry/ui/flip-sequins";

export const tweaks = defineTweaks({
  sequin: {
    kind: "range",
    label: "Sequin",
    default: 18,
    min: 10,
    max: 28,
    step: 2,
    unit: "px",
  },
  flipColor: {
    kind: "choice",
    label: "Flip",
    default: "rose",
    options: ["rose", "gold", "teal", "ink"],
    names: { rose: "Rose", gold: "Gold", teal: "Teal", ink: "Ink" },
  },
  shine: {
    kind: "range",
    label: "Shine",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks atelier, swatch 12: a reversible sequin panel with its swatch
 * number brushed into it, ready to be drawn over.
 */
export function FlipSequinsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [count, setCount] = React.useState({ flipped: 0, total: 0 });
  const [round, setRound] = React.useState(0);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <FlipSequins
          text="12"
          label="Swatch 12, reversible sequins"
          sound={sound}
          className="h-52 w-full"
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks atelier · swatch 12
          </p>
          <p className="text-base font-medium text-foreground">
            Reversible sequin
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRound((n) => n + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Reset
        </button>
      </div>
      <FlipSequins
        key={round}
        text="12"
        label="Swatch 12, reversible sequins"
        onFlipChange={(flipped, total) => setCount({ flipped, total })}
        sound={sound}
        className="h-60 w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {count.total > 0 ? (
          <>
            <span className="text-signal">{count.flipped}</span> of{" "}
            {count.total} flipped
          </>
        ) : (
          <span className="text-signal">swatch 12</span>
        )}{" "}
        · brush right or down to draw
      </p>
    </div>
  );
}
