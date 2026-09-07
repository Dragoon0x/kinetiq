"use client";

import * as React from "react";

import { QuotaMeter } from "@/registry/ui/quota-meter";

const LIMIT = 250;
const STEP = 35;
const CEILING = 340;
const START = 120;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function QuotaMeterDemo() {
  const [used, setUsed] = React.useState(START);

  const shift = (delta: number) =>
    setUsed((current) => Math.min(CEILING, Math.max(0, current + delta)));

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <QuotaMeter label="Gaugeworks storage" used={used} limit={LIMIT} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={used >= CEILING}
          onClick={() => shift(STEP)}
        >
          Add {STEP} GB
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={used <= 0}
          onClick={() => shift(-STEP)}
        >
          Free {STEP} GB
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={used === START}
          onClick={() => setUsed(START)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Using{" "}
        <span className="text-signal tabular-nums">
          {used} of {LIMIT} GB
        </span>
      </p>
    </div>
  );
}
