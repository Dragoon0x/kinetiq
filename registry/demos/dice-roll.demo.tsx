"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { DiceRoll } from "@/registry/ui/dice-roll";

/** Chips kept in the history strip — the previous rolls, newest last. */
const HISTORY_MAX = 5;

/**
 * DiceRoll as a bench instrument: the allocation die under the KQ-074 bezel.
 * Hold charges, release tumbles; the readout files the landed face and the
 * strip keeps the five calls before it.
 */
export function DiceRollDemo() {
  const [rolls, setRolls] = React.useState<number[]>([]);

  const lastRoll = rolls[rolls.length - 1];
  const history = rolls.slice(0, -1).slice(-HISTORY_MAX);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
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

        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Allocation Die</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-074</span>
        </div>

        {/* No overflow clipping here — mid-tumble corners must paint freely. */}
        <div className="flex h-48 items-center justify-center">
          <DiceRoll
            aria-label="Allocation die"
            size={88}
            onRoll={(value) =>
              setRolls((prev) => [...prev, value].slice(-(HISTORY_MAX + 1)))
            }
          />
        </div>

        {/* Visible mirror of the die's polite announcement. */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <p className="text-label text-ink-2">
            Last roll &middot;{" "}
            <span className="text-signal tabular-nums">
              {lastRoll ?? "—"}
            </span>
          </p>
          <div className="flex h-6 items-center gap-1.5">
            {history.length === 0 ? (
              <span className="text-label text-ink-3">No priors</span>
            ) : (
              history.map((entry, index) => (
                <span
                  key={`${index}-${entry}`}
                  className="rounded-1 border border-hairline bg-surface-2 px-1.5 font-mono text-[10px] leading-5 text-ink-3 tabular-nums"
                >
                  {entry}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-label text-ink-3">
        Hold to charge, release to roll - the die always answers.
      </p>
    </div>
  );
}
