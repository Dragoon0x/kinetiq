"use client";

import * as React from "react";

import { ExpiryRing } from "@/registry/ui/expiry-ring";

const WINDOW_SECONDS = 30;

export function ExpiryRingDemo() {
  const [left, setLeft] = React.useState(WINDOW_SECONDS);
  const [running, setRunning] = React.useState(true);
  const [sent, setSent] = React.useState(1);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-base tracking-[0.28em] tabular-nums">
            418902
          </span>
          <button
            type="button"
            onClick={() => setRunning((on) => !on)}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-input px-3 text-xs font-medium outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {running ? "Pause" : "Resume"}
          </button>
        </div>

        <ExpiryRing
          label="Waylight verification code"
          seconds={WINDOW_SECONDS}
          running={running}
          onTick={setLeft}
          onResend={() => {
            setLeft(WINDOW_SECONDS);
            setRunning(true);
            setSent((count) => count + 1);
          }}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight · <span className="text-signal tabular-nums">{left}</span>s
        left · sent <span className="tabular-nums">{sent}</span>&times;
      </p>
    </div>
  );
}
