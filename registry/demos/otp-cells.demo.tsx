"use client";

import * as React from "react";

import { OtpCells, type OtpCellsStatus } from "@/registry/ui/otp-cells";

const SENT_CODE = "482190";

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const secondary =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function OtpCellsDemo() {
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState<OtpCellsStatus>("idle");
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The cells never judge the code: the host does, here, on a timer that
  // holds while the tab is hidden so the verdict never lands unseen.
  React.useEffect(() => {
    if (!visible || status !== "verifying") return;
    const timer = window.setTimeout(
      () => setStatus(code === SENT_CODE ? "verified" : "failed"),
      1200,
    );
    return () => window.clearTimeout(timer);
  }, [visible, status, code]);

  const line =
    status === "verifying"
      ? "verifying"
      : status === "verified"
        ? "verified · signed in"
        : status === "failed"
          ? "rejected · try again"
          : `code · ${code.length} of 6`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OtpCells
        label="Waylight Pay · confirm sign-in"
        hint="Sent to the phone ending 4471"
        value={code}
        onValueChange={(next) => {
          setCode(next);
          if (status === "failed" && next) setStatus("idle");
        }}
        onComplete={() => setStatus("verifying")}
        status={status}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            (status !== "idle" && status !== "failed") || code.length > 0
          }
          onClick={() => setCode(SENT_CODE)}
          className={secondary}
        >
          Paste code
        </button>
        <button
          type="button"
          disabled={status === "idle" && code.length === 0}
          onClick={() => {
            setCode("");
            setStatus("idle");
          }}
          className={secondary}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{line}</span>
      </p>
    </div>
  );
}
