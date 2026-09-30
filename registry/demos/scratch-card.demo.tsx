"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ScratchCard } from "@/registry/ui/scratch-card";

export const tweaks = defineTweaks({
  brush: {
    kind: "range",
    label: "Brush",
    default: 18,
    min: 10,
    max: 34,
    step: 2,
    unit: "px",
  },
  autoReveal: {
    kind: "range",
    label: "Auto reveal",
    default: 60,
    min: 40,
    max: 80,
    step: 5,
    unit: "%",
  },
  flakes: { kind: "toggle", label: "Flakes", default: true },
  foil: {
    kind: "choice",
    label: "Foil",
    default: "silver",
    options: ["silver", "gold"],
    names: { silver: "Silver", gold: "Gold" },
  },
});

/** This week's rewards, one per card. */
const REWARDS = [
  {
    kind: "Cashback",
    amount: "4.20",
    note: "Added to your Waylight balance",
  },
  {
    kind: "Fee-free transfers",
    amount: "30 days",
    note: "On payments to Coldbrook Bank",
  },
  {
    kind: "Points",
    amount: "×2",
    note: "On groceries until Sunday",
  },
] as const;

/**
 * Waylight Pay's weekly reward: scratch the foil (or press Enter on it) to
 * see what came up. New card lays fresh foil over the next reward.
 */
export function ScratchCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const reward = REWARDS[round % REWARDS.length] ?? REWARDS[0];
  const autoReveal = values.autoReveal ?? tweaks.autoReveal.default;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="w-full max-w-xs self-center overflow-clip rounded-3 border border-hairline bg-card">
        <div className="flex h-9 items-center justify-between gap-3 border-b border-hairline px-3">
          <span className="truncate text-xs font-medium text-foreground">
            Waylight Pay
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Weekly reward
          </span>
        </div>
        <ScratchCard
          label="Weekly reward"
          revealed={revealed}
          onRevealedChange={setRevealed}
          onProgress={setProgress}
          className="rounded-t-none"
          sound={sound}
          {...values}
        >
          <div className="flex aspect-[16/9] flex-col items-center justify-center gap-1.5 bg-surface-1 px-4 text-center">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {reward.kind}
            </span>
            <span className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">
              {reward.amount}
            </span>
            <span className="text-xs text-ink-2">{reward.note}</span>
          </div>
        </ScratchCard>
      </div>
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {revealed ? (
              <>
                <span className="text-signal">revealed</span> · {reward.amount}{" "}
                {reward.kind.toLowerCase()}
              </>
            ) : progress > 0 ? (
              <>
                <span className="text-signal">
                  scratched {Math.round(progress * 100)}%
                </span>{" "}
                · reveals at {autoReveal}%
              </>
            ) : (
              <>
                <span className="text-signal">weekly reward</span> · scratch the
                foil
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setRound((n) => n + 1);
              setRevealed(false);
              setProgress(0);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            New card
          </button>
        </div>
      ) : null}
    </div>
  );
}
