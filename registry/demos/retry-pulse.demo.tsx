"use client";

import * as React from "react";

import { RetryPulse, type RetryStatus } from "@/registry/ui/retry-pulse";

export function RetryPulseDemo() {
  const [status, setStatus] = React.useState<RetryStatus>("idle");
  // The first attempt fails, the retry succeeds — a fixed narrative, no chance.
  const attempts = React.useRef(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const run = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus("loading");
    const willSucceed = attempts.current > 0;
    attempts.current += 1;
    timer.current = window.setTimeout(() => {
      setStatus(willSucceed ? "success" : "error");
    }, 1100);
  };

  const reset = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    attempts.current = 0;
    setStatus("idle");
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex items-center gap-3">
        <RetryPulse status={status} onRetry={run} label="Commit run" />
        {status === "success" && (
          <button
            type="button"
            onClick={reset}
            className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            Again
          </button>
        )}
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Attempt{" "}
        <span className="text-[var(--signal,var(--primary))]">{status}</span>
      </p>
    </div>
  );
}
