"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { OpticalMix } from "@/registry/ui/optical-mix";

export const tweaks = defineTweaks({
  dotSize: {
    kind: "range",
    label: "Dot size",
    default: 2.5,
    min: 2,
    max: 6,
    step: 0.5,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "field",
    options: ["field", "dusk", "press", "tide"],
    names: { field: "Field", dusk: "Dusk", press: "Press", tide: "Tide" },
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PIGMENTS: Record<string, string> = {
  field: "four pigments",
  dusk: "four pigments",
  press: "three inks",
  tide: "four pigments",
};

/**
 * The title wall of an invented exhibition at Fieldline Gallery: a summer
 * show of paintings made of points, its name painted the same way.
 */
export function OpticalMixDemo({
  chrome = true,
  // The paint is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [word, setWord] = React.useState<string | null>(null);
  const palette = values.palette ?? "field";

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Gallery · Summer rooms
        </p>
        <OpticalMix
          text="Light, one dot at a time"
          as="h2"
          onLensChange={setWord}
          className="text-[clamp(2.25rem,9cqi,3.75rem)] leading-[1.06] font-bold tracking-tight text-balance text-foreground"
          {...values}
        />
        {chrome ? (
          <p className="text-sm text-ink-2">
            Forty paintings made of nothing but points. Until 14 September.
          </p>
        ) : null}
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {word ? (
            <>
              <span className="text-signal">under the lens</span> · “
              {word.replace(/[.,;:]$/, "")}” in {PIGMENTS[palette]}
            </>
          ) : (
            <>
              <span className="text-signal">at rest</span> · {PIGMENTS[palette]}{" "}
              read as one tone
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
