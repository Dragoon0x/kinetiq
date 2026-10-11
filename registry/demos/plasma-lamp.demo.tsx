"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlasmaLamp } from "@/registry/ui/plasma-lamp";

export const tweaks = defineTweaks({
  tendrils: {
    kind: "range",
    label: "Tendrils",
    default: 9,
    min: 4,
    max: 16,
    step: 1,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 300,
    min: 240,
    max: 340,
    step: 5,
    unit: "°",
  },
  flicker: {
    kind: "range",
    label: "Flicker",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks' Ion Globe: a desk object you are meant to touch, sold on a
 * product card whose picture is the lamp itself.
 */
export function PlasmaLampDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [touching, setTouching] = React.useState(false);
  const [touches, setTouches] = React.useState(0);

  const lamp = (
    <PlasmaLamp
      className="size-52 shrink-0"
      sound={sound}
      onTouchChange={(on) => {
        setTouching(on);
        if (on) setTouches((n) => n + 1);
      }}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="flex w-full items-center justify-center">{lamp}</div>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-3 border border-hairline bg-card px-4 py-3">
        {lamp}
        <div className="flex max-w-[13rem] min-w-0 flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks · Desk objects
          </p>
          <p className="text-base leading-snug font-semibold text-foreground">
            Ion Globe, 8 in
          </p>
          <p className="text-sm leading-snug text-ink-2">
            Touch the glass and the arc finds your finger. Runs cool, hums
            softly.
          </p>
          <p className="font-mono text-sm text-foreground tabular-nums">
            $64.00
          </p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {touching ? (
          <>
            <span className="text-signal">arc found you</span> ·{" "}
            {touches === 1 ? "first touch" : `touch ${touches}`}
          </>
        ) : touches > 0 ? (
          <>
            <span className="text-signal">relaxing</span> · tendrils wander back
          </>
        ) : (
          <>
            <span className="text-signal">glass untouched</span> · point at it,
            or press Enter
          </>
        )}
      </p>
    </div>
  );
}
