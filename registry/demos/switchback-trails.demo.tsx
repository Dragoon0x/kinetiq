"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SwitchbackTrails } from "@/registry/ui/switchback-trails";

export const tweaks = defineTweaks({
  exposure: {
    kind: "range",
    label: "Exposure",
    default: 0,
    min: -2,
    max: 2,
    step: 0.5,
    unit: "EV",
  },
  traffic: {
    kind: "range",
    label: "Traffic",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dusk: {
    kind: "range",
    label: "Dusk",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const ev = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)} EV`;

/**
 * Fieldline Camera's night-pass lesson: hold the shutter over the Harrow
 * road at dusk and let the traffic draw the hairpins.
 */
export function SwitchbackTrailsDemo({
  chrome = true,
  // The view is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [shot, setShot] = React.useState<{
    seconds: number;
    cars: number;
  } | null>(null);
  const exposure = values.exposure ?? tweaks.exposure.default;

  if (!chrome) {
    return (
      <div className="relative flex h-[232px] w-full">
        <SwitchbackTrails label="Hold to expose the Harrow road" {...values} />
        <p className="pointer-events-none absolute top-3 left-4 font-mono text-[10px] tracking-[0.08em] text-[oklch(0.95_0.02_80)] uppercase">
          Fieldline Camera · press and hold
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Camera · Night pass
        </p>
        <p className="text-base font-medium text-foreground">
          The Harrow road at dusk
        </p>
      </div>
      <div className="h-[200px] w-full sm:h-[280px]">
        <SwitchbackTrails
          label="Hold to expose the Harrow road"
          open={open}
          onOpenChange={setOpen}
          onExpose={setShot}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-signal">shutter open</span> · release to
            develop
          </>
        ) : shot ? (
          <>
            <span className="text-signal">developed · {shot.seconds} s</span> ·{" "}
            {shot.cars} {shot.cars === 1 ? "car" : "cars"} · {ev(exposure)}
          </>
        ) : (
          <>
            <span className="text-signal">hold to open the shutter</span> ·{" "}
            {ev(exposure)}
          </>
        )}
      </p>
    </div>
  );
}
