"use client";

import * as React from "react";

import { CardFan, type FanCard } from "@/registry/ui/card-fan";
import { cn } from "@/registry/lib/utils";

/** Fixed protocol deck — ids, labels, one-line mono effects; never random. */
const PROTOCOLS = [
  { id: "surge", label: "SURGE", effect: "DRIVE +40" },
  { id: "damp", label: "DAMP", effect: "GAIN X0.5" },
  { id: "phase", label: "PHASE", effect: "FIELD +90" },
  { id: "lock", label: "LOCK", effect: "AXES HELD" },
  { id: "vent", label: "VENT", effect: "HEAT OUT" },
] as const;

const CARDS: FanCard[] = PROTOCOLS.map((protocol) => ({
  id: protocol.id,
  label: protocol.label,
  content: (
    <span className="font-mono text-[9px] tracking-[0.12em] text-ink-3 uppercase">
      {protocol.effect}
    </span>
  ),
}));

/**
 * CardFan as the KQ-115 protocol hand: five protocol cards fanned from a
 * bezel-mounted deck, the dashed slot up top captioned as the active
 * protocol, and a status line that mirrors every play.
 */
export function CardFanDemo() {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = PROTOCOLS.find((protocol) => protocol.id === activeId);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Protocol Hand &middot; 5 Cards
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-115</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          {/* Caption for the dashed played slot at the top of the fan. */}
          <p className="text-label text-ink-3">Active Protocol</p>
          <CardFan
            cards={CARDS}
            cardWidth={96}
            onSelect={setActiveId}
            aria-label="Protocol hand"
          />
        </div>

        <p
          role="status"
          className="mt-4 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Active &middot;{" "}
          <span className="text-signal">{active?.label ?? "STANDBY"}</span>
        </p>

        <p className="mt-3 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-115 &middot; Card Fan &middot; Arc 36&deg; &middot; P 800 &middot;
          &zeta; 0.98
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Open the hand, sweep, and play a card - Escape folds it.
      </p>
    </div>
  );
}
