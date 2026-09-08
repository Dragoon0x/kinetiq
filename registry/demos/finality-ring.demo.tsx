"use client";

import * as React from "react";

import { FinalityRing } from "@/registry/ui/finality-ring";

const FINALITY = 12;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function FinalityRingDemo() {
  const [blocks, setBlocks] = React.useState(3);
  const [settled, setSettled] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FinalityRing
        label="Withdrawal to Coldbrook"
        confirmations={blocks}
        finality={FINALITY}
        amount={1240}
        onFinal={() => setSettled(true)}
      />

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={blocks >= FINALITY}
          onClick={() => setBlocks((current) => current + 1)}
        >
          Next block
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setSettled(false);
            setBlocks(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Finality {blocks}/{FINALITY}{" "}
        <span className="text-cobalt-bright">
          {settled ? "final" : "settling"}
        </span>
      </p>
    </div>
  );
}
