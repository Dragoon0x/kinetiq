"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DeckShuffle } from "@/registry/ui/deck-shuffle";

export const tweaks = defineTweaks({
  riffles: {
    kind: "range",
    label: "Riffles",
    default: 4,
    min: 1,
    max: 8,
    step: 1,
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 500,
    min: 0,
    max: 1200,
    step: 100,
    unit: "ms",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 9,
    min: 4,
    max: 16,
    step: 1,
    unit: "/s",
  },
});

/**
 * The Waylight Card Room's members' night: the invitation deals its own
 * headline, and every word riffles again under the pointer.
 */
export function DeckShuffleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState(0);
  const [dealt, setDealt] = React.useState(false);

  const invite = (
    <div className="@container flex w-full flex-col gap-2.5">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Card Room · Friday
      </p>
      <DeckShuffle
        key={hand}
        as="h2"
        sound={sound}
        onComplete={() => setDealt(true)}
        className="text-[clamp(1.375rem,6cqi,2.5rem)] leading-[1.35] font-semibold text-foreground"
        {...values}
      >
        Shuffle up and deal.
      </DeckShuffle>
      <p className="text-sm text-ink-2">
        Doors at eight. House rules, no stakes.
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{invite}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {invite}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{dealt ? "dealt" : "dealing"}</span>
          {dealt ? " · point at a word to riffle it" : " · cards turning"}
        </p>
        <button
          type="button"
          onClick={() => {
            setDealt(false);
            setHand((h) => h + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Deal again
        </button>
      </div>
    </div>
  );
}
