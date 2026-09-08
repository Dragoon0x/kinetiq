"use client";

import * as React from "react";

import { TransferTrack } from "@/registry/ui/transfer-track";

const AMOUNT = 240;
const OPENED_AT = "09:41";

const money = (value: number) => `$${value.toFixed(2)}`;

/** Read in the click handler, never during render. */
const stampNow = () =>
  new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function TransferTrackDemo() {
  const [reached, setReached] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [stamps, setStamps] = React.useState<(string | undefined)[]>([
    OPENED_AT,
  ]);

  const advance = () => {
    if (reached >= 2) return;
    const next = reached + 1;
    const at = stampNow();
    setFailed(false);
    setReached(next);
    setStamps((prev) => {
      const copy = [...prev];
      copy[next] = at;
      return copy;
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TransferTrack
        label="To Fernwork Supply"
        reference="Ref WP-4471-QA"
        amount={AMOUNT}
        format={money}
        reached={reached}
        stamps={stamps}
        failed={failed}
        failureMessage="Fernwork Supply refused the hop. Nothing left the account."
        onRetry={advance}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={advance}
          className="flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Advance
        </button>
        <button
          type="button"
          onClick={() => setFailed(true)}
          className="flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Fail the hop
        </button>
        <button
          type="button"
          onClick={() => {
            setReached(0);
            setFailed(false);
            setStamps([OPENED_AT]);
          }}
          className="flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {failed ? (
          <>
            Failed after{" "}
            <span className="text-danger">
              {["sent", "on its way", "landed"][reached]}
            </span>{" "}
            · retry offered
          </>
        ) : (
          <>
            <span className="text-signal">
              {["sent", "on its way", "landed"][reached]}
            </span>{" "}
            · stamped{" "}
            <span className="text-signal">
              {stamps.filter(Boolean).join(", ")}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
