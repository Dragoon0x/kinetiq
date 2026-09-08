"use client";

import * as React from "react";

import {
  ApproveStep,
  type ApproveStepStatus,
} from "@/registry/ui/approve-step";

const AMOUNT = 12000;
const RECEIVE = 148320;

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const STATUS_LINE: Record<ApproveStepStatus, string> = {
  idle: "step 1 · approve 12,000 BSN",
  approving: "step 1 · approving",
  approved: "step 2 · swap ready",
  swapping: "step 2 · swapping",
  done: "done · 148,320 FRN",
  failed: "step 1 · approval failed",
};

export function ApproveStepDemo() {
  const [status, setStatus] = React.useState<ApproveStepStatus>("idle");
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The control never invents time — the timers live here, in an effect with
  // cleanup, and hold while the tab is hidden rather than resolving unseen.
  React.useEffect(() => {
    if (!visible) return;
    if (status !== "approving" && status !== "swapping") return;
    const next = status === "approving" ? "approved" : "done";
    const timer = window.setTimeout(
      () => setStatus(next),
      status === "approving" ? 1400 : 1100,
    );
    return () => window.clearTimeout(timer);
  }, [status, visible]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ApproveStep
        label="Basinworks Exchange"
        status={status}
        onStatusChange={setStatus}
        amount={AMOUNT}
        symbol="BSN"
        receive={RECEIVE}
        receiveSymbol="FRN"
      />

      <button
        type="button"
        disabled={status === "idle"}
        onClick={() => setStatus("idle")}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{STATUS_LINE[status]}</span>
      </p>
    </div>
  );
}
