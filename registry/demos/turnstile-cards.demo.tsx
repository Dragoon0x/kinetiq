"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTurnstileCards,
  TurnstileCards,
} from "@/registry/ui/turnstile-cards";

export const tweaks = defineTweaks({
  wings: {
    kind: "range",
    label: "Wings",
    default: 4,
    min: 3,
    max: 6,
    step: 1,
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glass: {
    kind: "range",
    label: "Glass",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Stays: six rooms for the weekend, each on a wing of the
 * turnstile in the lobby. Push the wings round to look at the next one.
 */
export function TurnstileCardsDemo({
  chrome = true,
  // The turnstile is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [room, setRoom] = React.useState(0);
  const card = defaultTurnstileCards[room];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <TurnstileCards
          label="Rooms for the weekend"
          value={room}
          onValueChange={setRoom}
          height={520}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Stays
        </p>
        <p className="text-base font-medium text-foreground">
          Pick a room for the weekend
        </p>
      </div>
      <div className="rounded-4 border border-hairline bg-surface-1">
        <TurnstileCards
          label="Rooms for the weekend"
          value={room}
          onValueChange={setRoom}
          height={420}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{card?.caption ?? card?.alt}</span> ·{" "}
        {room + 1} of {defaultTurnstileCards.length} · push the wings round
      </p>
    </div>
  );
}
