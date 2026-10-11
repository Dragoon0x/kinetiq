"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BiasStripes } from "@/registry/ui/bias-stripes";

export const tweaks = defineTweaks({
  angle: {
    kind: "range",
    label: "Angle",
    default: 45,
    min: 15,
    max: 75,
    step: 5,
    unit: "°",
  },
  pull: {
    kind: "range",
    label: "Pull",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "ember",
    options: ["ember", "tide", "orchard", "dusk"],
    names: { ember: "Ember", tide: "Tide", orchard: "Orchard", dusk: "Dusk" },
  },
});

/**
 * Coldbrook Textiles' spring run: a bias-cut silk shown as the cloth itself,
 * which reaches for the visitor's hand.
 */
export function BiasStripesDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ripples, setRipples] = React.useState(0);
  const angle = values.angle ?? tweaks.angle.default;
  const palette = values.palette ?? tweaks.palette.default;

  const tag = (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-0.5 rounded-2 border border-hairline bg-card/90 px-3 py-2">
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Textiles
      </span>
      <span className="text-sm font-medium text-foreground">
        Cut on the bias
      </span>
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex w-full">
        <BiasStripes label="Bias-cut silk" className="h-52 w-full" {...values}>
          {tag}
        </BiasStripes>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Textiles · spring run
        </p>
        <p className="text-base font-medium text-foreground">
          Bias-cut silk, in four dyes
        </p>
      </div>
      <BiasStripes
        label="Bias-cut silk"
        onRipple={() => setRipples((n) => n + 1)}
        className="h-60 w-full"
        {...values}
      >
        {tag}
      </BiasStripes>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {ripples === 0 ? "at rest" : `ripple ${ripples}`}
        </span>{" "}
        · {angle}° · {palette} · click to ripple
      </p>
    </div>
  );
}
