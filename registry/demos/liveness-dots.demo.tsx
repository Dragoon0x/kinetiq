"use client";

import * as React from "react";

import { LivenessDots, type LivenessStatus } from "@/registry/ui/liveness-dots";

const STOPS = 6;

export function LivenessDotsDemo() {
  const [status, setStatus] = React.useState<LivenessStatus>("idle");
  const [caught, setCaught] = React.useState(0);
  const [resolved, setResolved] = React.useState(0);

  const line =
    status === "passed"
      ? `Passed · ${caught} of ${STOPS}`
      : status === "failed"
        ? `Failed · ${caught} of ${STOPS}`
        : status === "running"
          ? `Running · ${resolved} of ${STOPS}`
          : "Idle";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LivenessDots
        label="Basinworks Exchange"
        status={status}
        onStatusChange={(next) => {
          if (next === "running") {
            setCaught(0);
            setResolved(0);
          }
          setStatus(next);
        }}
        onResolve={(_, wasCaught) => {
          setResolved((count) => count + 1);
          if (wasCaught) setCaught((count) => count + 1);
        }}
      />

      <p className="text-xs text-ink-3">
        Withdrawals over{" "}
        <span className="font-mono text-foreground tabular-nums">
          2,000 BSN
        </span>{" "}
        need a liveness check.
      </p>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
