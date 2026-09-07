"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { OfflineBar } from "@/registry/ui/offline-bar";

const RETRY_IN = 6;

export function OfflineBarDemo() {
  const [offline, setOffline] = React.useState(false);
  const [attempts, setAttempts] = React.useState(0);
  const attemptsRef = React.useRef(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    },
    [],
  );

  const simulate = (next: boolean) => {
    attemptsRef.current = 0;
    setAttempts(0);
    setOffline(next);
  };

  const handleRetry = () =>
    new Promise<boolean>((resolve) => {
      timers.current.push(
        window.setTimeout(() => {
          attemptsRef.current += 1;
          setAttempts(attemptsRef.current);
          // The second attempt gets through, so the bar shows both a failed
          // check and the reconnect.
          const ok = attemptsRef.current >= 2;
          if (ok) setOffline(false);
          resolve(ok);
        }, 700),
      );
    });

  const state = offline
    ? `Offline · ${attempts} ${attempts === 1 ? "attempt" : "attempts"}`
    : attempts > 0
      ? "Back online"
      : "Online";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-3 border border-border bg-card p-3">
        <OfflineBar
          online={!offline}
          retryIn={RETRY_IN}
          onRetry={handleRetry}
        />
        <div className="flex items-center justify-between gap-3 rounded-2 bg-surface-2 px-3 py-2">
          <span className="text-xs font-medium">Coldbrook dispatch</span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            6 runs queued
          </span>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={offline}
        onClick={() => simulate(!offline)}
        className="inline-flex h-8 w-fit items-center gap-2 rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className={cn(
            "relative h-4 w-7 shrink-0 rounded-full transition-colors",
            offline ? "bg-warn/70" : "bg-ink-3/40",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full bg-background transition-[left] duration-150",
              offline ? "left-3.5" : "left-0.5",
            )}
          />
        </span>
        Simulate offline
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Connection <span className="text-signal">{state}</span>
      </p>
    </div>
  );
}
