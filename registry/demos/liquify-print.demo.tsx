"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  LiquifyPrint,
  type LiquifyPrintState,
} from "@/registry/ui/liquify-print";

export const tweaks = defineTweaks({
  brush: {
    kind: "range",
    label: "Brush",
    default: 56,
    min: 24,
    max: 120,
    step: 8,
    unit: "px",
  },
  relax: {
    kind: "range",
    label: "Relax",
    default: 2200,
    min: 500,
    max: 6000,
    step: 250,
    unit: "ms",
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const SAID: Record<LiquifyPrintState, string> = {
  rest: "print at rest · drag to smear",
  smearing: "smearing",
  relaxing: "relaxing",
  holding: "holding",
};

const CONTROL =
  "inline-flex h-8 items-center gap-2 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks Press: the Fern study poster, still wet from the press — push the
 * paint around and watch it settle back.
 */
export function LiquifyPrintDemo({
  chrome = true,
  // The paint is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<LiquifyPrintState>("rest");
  const [pinned, setPinned] = React.useState(false);
  const [held, setHeld] = React.useState(0);
  const [restoreKey, setRestoreKey] = React.useState(0);

  const print = (
    <div className="relative w-full">
      <LiquifyPrint
        className={cn("w-full rounded-3", chrome ? "h-56" : "h-52")}
        pinned={pinned}
        onPinnedChange={setPinned}
        onStateChange={setState}
        onSmear={(pin) => {
          if (pin) setHeld((n) => n + 1);
        }}
        onRestore={() => setHeld(0)}
        restoreKey={restoreKey}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 rounded-full border border-hairline bg-card/90 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
        Fernworks Press · Fern study
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{print}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {print}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {held > 0 && (state === "rest" || state === "holding")
              ? `pinned · ${held} ${held === 1 ? "smear" : "smears"} held`
              : SAID[state]}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={pinned}
            onClick={() => setPinned((p) => !p)}
            className={CONTROL}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full transition-colors",
                pinned ? "bg-signal" : "bg-ink-3/40",
              )}
            />
            Pin
          </button>
          <button
            type="button"
            onClick={() => setRestoreKey((k) => k + 1)}
            className={CONTROL}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}
