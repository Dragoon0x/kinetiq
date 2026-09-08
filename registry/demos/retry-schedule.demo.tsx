"use client";

import * as React from "react";

import { RetrySchedule, type RetryAttempt } from "@/registry/ui/retry-schedule";

const WAIT = 45;

const SCHEDULE: RetryAttempt[] = [
  { id: "a1", label: "Now", status: "failed" },
  { id: "a2", label: "+2h", status: "pending" },
  { id: "a3", label: "+1d", status: "pending" },
  { id: "a4", label: "+3d", status: "pending" },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const pad = (value: number) => String(value).padStart(2, "0");

export function RetryScheduleDemo() {
  const [attempts, setAttempts] = React.useState(SCHEDULE);
  const [outcome, setOutcome] = React.useState<"failed" | "succeeded">(
    "failed",
  );
  const [busy, setBusy] = React.useState(false);
  const [left, setLeft] = React.useState(WAIT);

  // The attempt takes a beat to come back, the way a real authorisation does.
  React.useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setAttempts((current) => {
        const index = current.findIndex((item) => item.status === "pending");
        if (index < 0) return current;
        return current.map((item, at) =>
          at === index ? { ...item, status: outcome } : item,
        );
      });
      setBusy(false);
      setLeft(WAIT);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [busy, outcome]);

  const nextIndex = attempts.findIndex((item) => item.status === "pending");
  const charged = attempts.some((item) => item.status === "succeeded");
  const state = busy
    ? "trying"
    : charged
      ? "charged"
      : nextIndex < 0
        ? "spent"
        : "waiting";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RetrySchedule
        attempts={attempts}
        waitSeconds={WAIT}
        amount={86.4}
        reason="Insufficient funds"
        method="Coldbrook Bank ·· 4417"
        busy={busy}
        onTick={setLeft}
        onRetryNow={() => setBusy(true)}
        onElapse={() => setBusy(true)}
        label="Invoice WP-1180"
      />

      <div className="flex flex-wrap gap-2">
        {(["failed", "succeeded"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={outcome === value}
            onClick={() => setOutcome(value)}
            className={
              BUTTON +
              (outcome === value
                ? " border-transparent bg-primary text-primary-foreground"
                : " border-input bg-surface-1 text-foreground hover:bg-accent")
            }
          >
            {value === "failed" ? "Fail next" : "Succeed next"}
          </button>
        ))}
        <button
          type="button"
          className={BUTTON + " border-input bg-surface-1 hover:bg-accent"}
          disabled={attempts === SCHEDULE && !busy}
          onClick={() => {
            setAttempts(SCHEDULE);
            setLeft(WAIT);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Attempt {nextIndex < 0 ? attempts.length : nextIndex + 1}/
        {attempts.length} · <span className="text-signal">{state}</span>
        {state === "waiting"
          ? ` · next in ${pad(Math.floor(left / 60))}:${pad(left % 60)}`
          : null}
      </p>
    </div>
  );
}
