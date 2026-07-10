"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { TurnWord } from "@/registry/ui/turn-word";

/** The two committed modes KQ-106 turns between — equal length, one shared R. */
const MODES = ["MEASURE", "CONFIRM"] as const;

/**
 * TurnWord dressed as the KQ-106 mode plate: a bezel with corner registration
 * ticks, the word itself as the switch, and a status line that mirrors every
 * commanded turn. The shared R at position six holds still while the six
 * letters that differ turn in cascade.
 */
export function TurnWordDemo() {
  // KQ-106 boots in MEASURE; the readout mirrors each turn as it is issued.
  const [mode, setMode] = React.useState<0 | 1>(0);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4 sm:p-5">
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
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-label text-ink-2">MODE PLATE</p>
          <p className="text-label text-ink-3 tabular-nums">KQ-106</p>
        </div>

        {/* The plate proper — the word is the whole control. */}
        <div className="flex justify-center py-7 sm:py-8">
          <TurnWord
            words={MODES}
            defaultActive={0}
            onTurn={setMode}
            aria-label="Mode plate: MEASURE or CONFIRM"
          />
        </div>

        <p
          role="status"
          className="border-hairline text-label text-ink-3 border-t pt-3"
        >
          READS &middot;{" "}
          <span className="text-cobalt-bright">
            {mode === 1 ? MODES[1] : MODES[0]}
          </span>
        </p>

        <p className="text-ink-3 mt-2 font-mono text-[10px] tracking-[0.15em] uppercase">
          KQ-106 &middot; Turn Word &middot; 07 cells &middot; P 700 &middot;
          &zeta; 0.83
        </p>

        <p className="text-ink-3 mt-3 text-center text-xs">
          Press the word - letters that differ turn in cascade.
        </p>
      </div>
    </div>
  );
}
