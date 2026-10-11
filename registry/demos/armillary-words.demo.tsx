"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ArmillaryWords } from "@/registry/ui/armillary-words";

export const tweaks = defineTweaks({
  ringCount: {
    kind: "range",
    label: "Rings",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 26,
    min: 5,
    max: 40,
    step: 1,
    unit: "°",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "brass",
    options: ["brass", "bronze", "steel", "gilt"],
    names: { brass: "Brass", bronze: "Bronze", steel: "Steel", gilt: "Gilt" },
  },
});

const LINES = [
  "Fernworks Observatory · 1891",
  "Open Friday nights from dusk",
  "Telescope tours on the hour",
  "The dome opens at nine",
  "Members see the first light",
  "Clear skies, the Fernworks way",
];

const NUMERALS = ["I", "II", "III", "IV", "V", "VI"];

/**
 * The Fernworks Observatory's lobby piece: an armillary sphere whose rings
 * carry the week's notices. Drag to spin it; pick a ring to read it.
 */
export function ArmillaryWordsDemo({
  chrome = true,
  // The sphere is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ring, setRing] = React.useState<number | null>(null);
  const count = values.ringCount ?? 4;
  const facing = ring !== null && ring < count ? ring : null;

  const sphere = (
    <ArmillaryWords
      lines={LINES}
      value={facing}
      onValueChange={setRing}
      label="Fernworks Observatory notices"
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-sm">{sphere}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex w-full max-w-sm flex-col self-center">{sphere}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {facing === null ? (
          <>
            <span className="text-signal">turning</span> · drag to spin, pick a
            ring to read it
          </>
        ) : (
          <>
            <span className="text-signal">ring {NUMERALS[facing]} facing</span>{" "}
            · {LINES[facing]}
          </>
        )}
      </p>
    </div>
  );
}
