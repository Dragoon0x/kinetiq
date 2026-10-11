"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BurnerCard } from "@/registry/ui/burner-card";

export const tweaks = defineTweaks({
  flameHeight: {
    kind: "range",
    label: "Flame",
    default: 26,
    min: 12,
    max: 40,
    step: 2,
    unit: "px",
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 255,
    min: 150,
    max: 330,
    step: 5,
    unit: "°",
  },
  flutter: {
    kind: "range",
    label: "Flutter",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * The Coldbrook Supper Club's Thursday fire: a booking card with the hearth
 * burning behind it. Hover the card, or tab to its button, and the flame
 * roars up.
 */
export function BurnerCardDemo({
  chrome = true,
  // The flame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const height = Math.round((values.flameHeight ?? 26) * 1.9);

  const card = (
    <BurnerCard onActiveChange={setOpen} {...values}>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook · supper club
      </p>
      <h3 className="mt-1.5 text-base leading-snug font-medium text-foreground">
        Open fire, Thursday nights
      </h3>
      {chrome ? (
        <p className="mt-1 text-sm text-ink-2">
          Six courses cooked over the hearth, one long table.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          12 seats left
        </span>
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Book a seat
        </button>
      </div>
    </BurnerCard>
  );

  if (!chrome) return <div className="w-full max-w-80">{card}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-signal">valve open</span> · flame {height} px
          </>
        ) : (
          <>
            <span className="text-signal">valve low</span> · steady flicker
          </>
        )}
      </p>
    </div>
  );
}
