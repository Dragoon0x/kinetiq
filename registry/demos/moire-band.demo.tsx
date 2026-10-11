"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MoireBand } from "@/registry/ui/moire-band";

export const tweaks = defineTweaks({
  wireCount: {
    kind: "range",
    label: "Wires",
    default: 40,
    min: 16,
    max: 72,
    step: 4,
  },
  twist: {
    kind: "range",
    label: "Twist",
    default: 6,
    min: -20,
    max: 20,
    step: 1,
    unit: "°",
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** The fringes in a few words, for the status line. */
const look = (degrees: number) => {
  const a = Math.abs(degrees);
  return a < 3
    ? "broad calm fringes"
    : a < 9
      ? "steady fringes"
      : "fine racing fringes";
};

/**
 * Waylight Optics: a hero for their lens fitting service, set over two
 * ribbons of wire whose crossing the visitor tunes with the pointer.
 */
export function MoireBandDemo({
  chrome = true,
  // The band is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [twist, setTwist] = React.useState(values.twist ?? 6);
  // The tweak moves the band; the band reports back what the hand did.
  const [seen, setSeen] = React.useState(values.twist);
  if (seen !== values.twist) {
    setSeen(values.twist);
    setTwist(values.twist ?? 6);
  }

  const band = (
    <MoireBand
      onValueChange={setTwist}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-5">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-3.5 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Optics
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, measured twice
          </p>
          {chrome ? (
            <button
              type="button"
              className="mt-2.5 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Book a fitting
            </button>
          ) : null}
        </div>
      </div>
    </MoireBand>
  );

  if (!chrome) return <div className="flex w-full">{band}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {band}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">twist {twist.toFixed(1)}°</span> ·{" "}
        {look(twist)}
      </p>
    </div>
  );
}
