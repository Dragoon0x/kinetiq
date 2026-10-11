"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SteamWords } from "@/registry/ui/steam-words";

export const tweaks = defineTweaks({
  rise: {
    kind: "range",
    label: "Rise",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  shear: {
    kind: "range",
    label: "Shear",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PHRASES = ["warm hands", "first light", "slow pour", "one more cup"];

/**
 * The morning card at an invented café, Coldbrook: the house blend steaming
 * on the counter, the menu's small promises rising off it.
 */
export function SteamWordsDemo({
  chrome = true,
  // The steam is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);

  return (
    <div className="@container flex w-full max-w-sm flex-col gap-3">
      <div className="relative overflow-clip rounded-4 border border-hairline bg-card">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-baseline justify-between gap-3 px-5 pt-4">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Café
          </p>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Morning menu
          </p>
        </div>
        <SteamWords
          phrases={PHRASES}
          value={index}
          onValueChange={setIndex}
          label="Steam rising from the Coldbrook house blend"
          className={
            chrome
              ? "h-[420px] text-[clamp(1.6rem,10cqi,2.4rem)]"
              : "h-[540px] text-[clamp(1.6rem,10cqi,2.4rem)]"
          }
          {...values}
        />
        {chrome ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-hairline px-5 py-3">
            <p className="text-sm font-medium text-foreground">House blend</p>
            <p className="font-mono text-sm text-ink-2 tabular-nums">4.20</p>
          </div>
        ) : null}
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">steaming</span> · “{PHRASES[index]}” ·
          next “{PHRASES[(index + 1) % PHRASES.length]}”
        </p>
      ) : null}
    </div>
  );
}
