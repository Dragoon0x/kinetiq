"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SwatchMixer } from "@/registry/ui/swatch-mixer";

export const tweaks = defineTweaks({
  pigments: {
    kind: "range",
    label: "Pigments",
    default: 4,
    min: 3,
    max: 6,
    step: 1,
  },
  swirl: {
    kind: "range",
    label: "Swirl",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  readout: {
    kind: "choice",
    label: "Readout",
    default: "hex",
    options: ["hex", "oklch"],
    names: { hex: "Hex", oklch: "OKLCH" },
  },
});

/** Three parts cobalt to one of chalk: the project's colour today. */
const START = "#5b84d0";

/**
 * A project's label colour in Fernworks: mix it by hand, and the theme takes
 * whatever the well holds.
 */
export function SwatchMixerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [colour, setColour] = React.useState(START);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="w-full"
        aria-label="Project label"
      >
        <SwatchMixer
          label="Label colour"
          name="labelColour"
          hint="Drag a pigment into the well. Pull a colour off the rim to take it out."
          required
          value={colour}
          onValueChange={setColour}
          sound={sound}
          {...values}
        />
      </form>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {colour ? (
            <>
              <span className="text-signal">label colour {colour}</span> · saved
              to the Fernworks theme
            </>
          ) : (
            <>
              <span className="text-signal">well empty</span> · drag a pigment
              in
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
