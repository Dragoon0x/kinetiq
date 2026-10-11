"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CartwheelDeck,
  defaultCartwheelCards,
} from "@/registry/ui/cartwheel-deck";

export const tweaks = defineTweaks({
  spin: {
    kind: "range",
    label: "Spin",
    default: 1,
    min: 1,
    max: 3,
    step: 1,
  },
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 14,
    min: 4,
    max: 32,
    step: 2,
    unit: "px",
  },
});

/**
 * Coldbrook Tea: five teas to taste, in order. Send the front card to the
 * back to move on to the next one.
 */
export function CartwheelDeckDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tea, setTea] = React.useState(0);
  const count = defaultCartwheelCards.length;
  const card = defaultCartwheelCards[tea];
  const next = defaultCartwheelCards[(tea + 1) % count];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <CartwheelDeck
          label="Teas to taste"
          value={tea}
          onValueChange={setTea}
          height={232}
          sound={sound}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Tea
        </p>
        <p className="text-base font-medium text-foreground">
          Five teas to taste
        </p>
      </div>
      <div className="rounded-4 border border-hairline bg-surface-1">
        <CartwheelDeck
          label="Teas to taste"
          value={tea}
          onValueChange={setTea}
          height={248}
          sound={sound}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{card?.caption}</span> · {tea + 1} of{" "}
        {count} · {card?.detail} · next: {next?.caption}
      </p>
    </div>
  );
}
