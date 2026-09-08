"use client";

import * as React from "react";

import { VirtualMint, type MintPhase } from "@/registry/ui/virtual-mint";

const WALLET_CAP = 4;

export function VirtualMintDemo() {
  const [phase, setPhase] = React.useState<MintPhase>("idle");
  const [held, setHeld] = React.useState(1);
  const [last, setLast] = React.useState("4417");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Coldbrook Bank · single use
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {held}/{WALLET_CAP}
        </span>
      </div>

      <VirtualMint
        label="Waylight virtual cards"
        maxCards={WALLET_CAP}
        onPhaseChange={setPhase}
        onMint={(card) => {
          setHeld((previous) => Math.min(WALLET_CAP, previous + 1));
          setLast(card.number.slice(-4));
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Mint <span className="text-cobalt-bright">{phase}</span> · latest{" "}
        <span className="tabular-nums">{last}</span> · wallet{" "}
        <span className="tabular-nums">
          {held} of {WALLET_CAP}
        </span>
      </p>
    </div>
  );
}
