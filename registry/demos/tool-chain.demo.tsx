"use client";

import * as React from "react";

import { ToolChain, type ToolChainStatus } from "@/registry/ui/tool-chain";

/** Fernworks Model 3 at Basinworks Exchange, reconciling one day's payouts. */
const CALLS = [
  { id: "read", name: "read_file", detail: "payouts/2026-09-08.csv" },
  { id: "search", name: "search_ledger", detail: "day: 2026-09-08" },
  { id: "match", name: "match_rows", detail: "by reference" },
  { id: "post", name: "post_summary", detail: "to #reconciliation" },
];

/** Tenths of a second at which each link completes; the third fails first. */
const DONE_AT = [5, 12, 24, 29];
const FAIL_AT = 18;
const ERROR = "3 rows unmatched";

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ToolChainDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [retried, setRetried] = React.useState(false);

  // A hidden tab pauses the script; the chain should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const paused = ticks >= FAIL_AT && !retried;
  const complete = ticks >= (DONE_AT[3] ?? 0);
  const running = playing && !paused && !complete;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const statusAt = (index: number): ToolChainStatus => {
    if (!playing) return "pending";
    const start = index === 0 ? 0 : (DONE_AT[index - 1] ?? 0);
    const end = DONE_AT[index] ?? 0;
    if (ticks < start) return "pending";
    if (index === 2 && paused) return "failed";
    return ticks < end ? "running" : "done";
  };

  const steps = CALLS.map((call, index) => ({
    ...call,
    status: statusAt(index),
    error: index === 2 ? ERROR : undefined,
  }));
  const link = steps.findIndex((step) => step.status === "running") + 1;

  const status = !playing
    ? "Idle · press play"
    : paused
      ? "Paused · link 3 failed"
      : complete
        ? `Complete · 4 links · ${retried ? 1 : 0} retry`
        : `${retried && link === 3 ? "Retrying" : "Running"} · link ${link} of 4`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ToolChain
        label="Reconcile payouts"
        steps={steps}
        onRetry={() => setRetried(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setRetried(false);
            setPlaying(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
