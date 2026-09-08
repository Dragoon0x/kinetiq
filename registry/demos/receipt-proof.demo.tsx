"use client";

import * as React from "react";

import { ReceiptProof, type ProofStatus } from "@/registry/ui/receipt-proof";

/** How long the climb reads before the root is stamped. */
const CHECK_MS = 900;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function ReceiptProofDemo() {
  const [leaf, setLeaf] = React.useState(3);
  const [status, setStatus] = React.useState<ProofStatus>("idle");

  // The draw is timed by the demo, not the instrument, and it clears itself.
  React.useEffect(() => {
    if (status !== "checking") return;
    const timer = window.setTimeout(() => setStatus("verified"), CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReceiptProof
        label="Basinworks receipt"
        leaves={8}
        value={leaf}
        onValueChange={(next) => {
          // A proof of one leaf is not a proof of another.
          setStatus("idle");
          setLeaf(next);
        }}
        status={status}
        seed="basin-4812907"
        amount={240}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={status !== "idle"}
          onClick={() => setStatus("checking")}
        >
          Verify
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={status === "idle"}
          onClick={() => setStatus("idle")}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Proof leaf {leaf} <span className="text-cobalt-bright">{status}</span>
      </p>
    </div>
  );
}
