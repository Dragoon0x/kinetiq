"use client";

import * as React from "react";

import { motion } from "motion/react";

import { CrankReel } from "@/registry/ui/crank-reel";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** KQ-155 spool spec: capacity and gearing never vary. */
const CAPACITY = 12;
const UNITS_PER_TURN = 2;

const pad2 = (v: number): string => String(v).padStart(2, "0");

/**
 * CrankReel dressed as the KQ-155 winch post: crank the grip clockwise to
 * wind cable onto the drum. The WOUND readout banks whole units, and the
 * freewheel note blinks back in whenever a backward turn slips the ratchet.
 */
export function CrankReelDemo() {
  // KQ-155 boots unwound; the readout mirrors each banked unit.
  const [wound, setWound] = React.useState(0);
  const [slips, setSlips] = React.useState(0);

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
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Winch Post</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-155</span>
        </div>

        <div className="flex flex-col items-center gap-4">
          <CrankReel
            defaultValue={0}
            max={CAPACITY}
            unitsPerTurn={UNITS_PER_TURN}
            spoolLabel="Cable"
            onValueChange={setWound}
            onSlip={() => setSlips((n) => n + 1)}
            aria-label="Winch cable"
          />

          <div className="flex w-full flex-col gap-2 border-t border-hairline pt-3">
            {/* Banked readout — WOUND moves per unit, never per degree. */}
            <p
              role="status"
              className="text-center text-label text-ink-3 tabular-nums"
            >
              Wound &middot;{" "}
              <span className="font-mono text-sm text-signal">
                {pad2(wound)}/{CAPACITY}
              </span>
            </p>
            {/* Freewheel note — remounts on every slip, so it blinks back in. */}
            <motion.p
              key={slips}
              initial={slips > 0 ? { opacity: 0.15 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="text-center font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase tabular-nums"
            >
              Freewheel &middot; backward slips &middot; {pad2(slips)}
            </motion.p>
          </div>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-155 &middot; Crank Reel &middot; {UNITS_PER_TURN} units/turn
          &middot; 45&deg; ratchet &middot; &zeta; 0.99
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Crank forward to wind - the freewheel only clicks backward.
      </p>
    </div>
  );
}
