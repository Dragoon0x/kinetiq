"use client";

import * as React from "react";

import { StatusLine } from "@/registry/ui/status-line";

const LINES = [
  "At the loading dock until four",
  "Back on the yard, radio three",
];
const TOTAL = 45;
const STEP_MS = 900;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

export function StatusLineDemo() {
  const [status, setStatus] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState(TOTAL);
  const [line, setLine] = React.useState("no status");
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The clock is the demo's, not the component's: a seeded step every 900ms
  // while the tab is visible, and the ring simply glides to each value.
  React.useEffect(() => {
    if (!status || !visible || remaining <= 0) return;
    const timer = window.setTimeout(
      () => setRemaining((left) => Math.max(0, left - 3)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [status, visible, remaining]);

  const next = () => {
    const index = status === LINES[0] ? 1 : 0;
    setStatus(LINES[index] ?? null);
    setRemaining(TOTAL);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-0 px-3 py-3">
        <StatusLine
          name="Rui Baptista"
          roleLabel="Coldbrook dispatch"
          status={status}
          expiry={
            status
              ? { label: `${remaining} min`, remaining, total: TOTAL }
              : undefined
          }
          onClear={() => {
            setStatus(null);
            setLine("cleared");
          }}
          onSettle={() => setLine("status set")}
          onExpire={() => {
            setStatus(null);
            setLine("expired");
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={next}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {status ? "Change status" : "Set status"}
        </button>
        <button
          type="button"
          disabled={!status}
          onClick={() => setRemaining((left) => Math.max(0, left - 15))}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Skip a quarter hour
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Rui Baptista — <span className="text-signal">{line}</span>
        {status ? ` · ${remaining} min left` : ""}
      </p>
    </div>
  );
}
