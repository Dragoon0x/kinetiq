"use client";

import * as React from "react";

import { DocScan, type DocScanStatus } from "@/registry/ui/doc-scan";

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const LINE: Record<DocScanStatus, string> = {
  idle: "ready · hold the card in frame",
  finding: "finding edges",
  scanning: "scanning",
  blurred: "blurred · hold still",
  captured: "captured · coldbrook id",
};

export function DocScanDemo() {
  const [status, setStatus] = React.useState<DocScanStatus>("idle");
  const [scans, setScans] = React.useState(0);
  const [verdict, setVerdict] = React.useState<DocScanStatus | null>(null);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The frame never judges its own capture: the first scan is read as blurred
  // and the retry as captured, on a timer that holds while the tab is hidden.
  React.useEffect(() => {
    if (!visible || !verdict) return;
    const timer = window.setTimeout(() => {
      setStatus(verdict);
      setVerdict(null);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [visible, verdict]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DocScan
        label="Waylight Pay · verify identity"
        title="Coldbrook ID"
        holder="R. Basin"
        status={status}
        onStatusChange={setStatus}
        onScanned={() => {
          setVerdict(scans === 0 ? "blurred" : "captured");
          setScans((count) => count + 1);
        }}
      />

      <button
        type="button"
        disabled={status === "idle"}
        onClick={() => {
          setStatus("idle");
          setScans(0);
          setVerdict(null);
        }}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{LINE[status]}</span>
      </p>
    </div>
  );
}
