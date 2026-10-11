"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BulbMarquee, type BulbMarqueeState } from "@/registry/ui/bulb-marquee";

export const tweaks = defineTweaks({
  bulbSize: {
    kind: "range",
    label: "Bulb size",
    default: 1,
    min: 0.6,
    max: 1.4,
    step: 0.1,
    unit: "×",
  },
  chase: {
    kind: "range",
    label: "Chase",
    default: 4,
    min: 0,
    max: 10,
    step: 1,
    unit: "/s",
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pattern: {
    kind: "choice",
    label: "Frame",
    default: "chase",
    options: ["chase", "alternate"],
    names: { chase: "Chase", alternate: "Alternate" },
  },
});

const SAY: Record<BulbMarqueeState, [string, string]> = {
  dark: ["dark", "press the sign to light it"],
  warming: ["warming", "the filaments are coming up"],
  lit: ["lit", "press the sign to relight"],
};

/**
 * The Coldbrook Playhouse marquee on the night a new show opens: the sign
 * runs its chase, fills in letter by letter and keeps the frame moving.
 */
export function BulbMarqueeDemo({
  chrome = true,
  // The sign is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<BulbMarqueeState>("dark");
  const [word, hint] = SAY[state];

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Playhouse · Friday 7:30
      </p>
      <BulbMarquee
        as="h2"
        text="Opening night"
        onStateChange={setState}
        className="text-[14.5cqw] @md:text-[min(9.2cqw,4.25rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{word}</span> · {hint}
        </p>
      ) : null}
    </div>
  );
}
