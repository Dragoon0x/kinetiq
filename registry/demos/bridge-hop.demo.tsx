"use client";

import * as React from "react";

import { BridgeHop, type BridgeStage } from "@/registry/ui/bridge-hop";

const STAGES: BridgeStage[] = [
  {
    id: "locked",
    label: "Locked",
    detail: "Held on Basin",
    hash: "0x4f2a91c0be17",
  },
  {
    id: "attested",
    label: "Attested",
    detail: "Signed by 9 of 12 guards",
    hash: "0xb7e3d41805aa",
  },
  {
    id: "relayed",
    label: "Relayed",
    detail: "Carried to Coldbrook",
    hash: "0x0c19bfa2734d",
  },
  {
    id: "minted",
    label: "Minted",
    detail: "Issued to the recipient",
    hash: "0x93de60175c8b",
  },
];

const AMOUNT = 420;
const OPENING = 80;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function BridgeHopDemo() {
  const [stage, setStage] = React.useState(1);
  const [arrived, setArrived] = React.useState(false);

  const word = arrived
    ? "arrived"
    : stage === 0
      ? "waiting"
      : (STAGES[stage - 1]?.label.toLowerCase() ?? "moving");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BridgeHop
        label="Basin to Coldbrook"
        stages={STAGES}
        stage={stage}
        from={{ name: "Basin", ticker: "BSN" }}
        to={{ name: "Coldbrook", ticker: "CBK" }}
        amount={AMOUNT}
        destinationBalance={arrived ? OPENING + AMOUNT : OPENING}
        onArrive={() => setArrived(true)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={stage >= STAGES.length}
          onClick={() => setStage((current) => current + 1)}
        >
          Advance
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setArrived(false);
            setStage(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Bridge <span className="text-cobalt-bright">{word}</span> · {stage}/
        {STAGES.length}
      </p>
    </div>
  );
}
