"use client";

import * as React from "react";

import { CardTap, type CardTapStatus } from "@/registry/ui/card-tap";

const AMOUNT = 24.8;
/** How long the till takes to answer a tap. */
const DECISION_MS = 900;

const CONTROL =
  "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CardTapDemo() {
  const [status, setStatus] = React.useState<CardTapStatus>("idle");
  const [approve, setApprove] = React.useState(true);

  // The armed outcome is read by a timer, so it is mirrored rather than listed
  // as a dependency — re-arming mid-read must not restart the till's clock.
  const approveRef = React.useRef(approve);
  React.useEffect(() => {
    approveRef.current = approve;
  });

  React.useEffect(() => {
    if (status !== "reading") return;
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => {
        setStatus(approveRef.current ? "approved" : "declined");
      }, DECISION_MS);
    };
    // A till nobody is watching is not deciding anything: the clock stops with
    // the tab and starts again from the top when it comes back.
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CardTap
        label="Tap to pay"
        merchant="Fernworks Depot"
        amount={AMOUNT}
        status={status}
        onStatusChange={setStatus}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Next result"
          className="flex items-center gap-1.5"
        >
          {[
            { value: true, label: "Approve" },
            { value: false, label: "Decline" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={approve === option.value}
              onClick={() => setApprove(option.value)}
              className={`${CONTROL} ${
                approve === option.value
                  ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                  : "border-hairline-strong hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          disabled={status === "idle"}
          className={`${CONTROL} border-hairline-strong hover:bg-accent disabled:opacity-45`}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Tap <span className="text-cobalt-bright">{status}</span> · $24.80 ·
        Fernworks Depot
      </p>
    </div>
  );
}
