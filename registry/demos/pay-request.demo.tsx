"use client";

import * as React from "react";

import { PayRequest } from "@/registry/ui/pay-request";

/** The Coldbrook supper, and the two ways it has been split. */
const TOTAL = 127.5;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PayRequestDemo() {
  const [ways, setWays] = React.useState(3);
  const [paid, setPaid] = React.useState(false);
  const [percent, setPercent] = React.useState(0);

  // Rounded to cents here, not in a render string: a share is a division.
  const share = Math.round((TOTAL / ways) * 100) / 100;
  const shown = share.toFixed(2);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PayRequest
        label="Coldbrook thread"
        peerName="Ines"
        paidAt="14:12"
        request={{
          id: "req-1",
          from: "peer",
          name: "Ines",
          amount: share,
          note: `Supper at the Coldbrook rooms, split ${ways === 3 ? "three" : "four"} ways`,
          time: "14:06",
        }}
        paid={paid}
        onPay={() => setPaid(true)}
        onProgressChange={setPercent}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={ways === 4 || paid}
          onClick={() => setWays(4)}
        >
          Split four ways
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => {
            setWays(3);
            setPaid(false);
            setPercent(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {shown} BSN · requested by Ines ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {paid
            ? "marked paid 14:12"
            : percent > 0
              ? `slid ${percent}%`
              : "not paid"}
        </span>
      </p>
    </div>
  );
}
