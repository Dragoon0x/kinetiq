"use client";

import * as React from "react";

import { SlideConfirm } from "@/registry/ui/slide-confirm";

export function SlideConfirmDemo() {
  const [percent, setPercent] = React.useState(0);
  const [paid, setPaid] = React.useState(false);

  const status = paid ? "paid" : percent > 0 ? `sliding ${percent}%` : "idle";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Coldbrook order 4471
        </span>
        <span className="font-mono text-sm tabular-nums">48.00</span>
      </div>

      <SlideConfirm
        label="Slide to pay 48.00"
        confirmedLabel="Paid 48.00"
        resetAfter={2500}
        onConfirm={() => setPaid(true)}
        onProgressChange={(next) => {
          setPercent(next);
          if (next === 0) setPaid(false);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook checkout <span className="text-cobalt-bright">{status}</span>
      </p>
    </div>
  );
}
