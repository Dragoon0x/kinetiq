"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StampCycle } from "@/registry/ui/stamp-cycle";

export const tweaks = defineTweaks({
  interval: {
    kind: "range",
    label: "Interval",
    default: 2400,
    min: 1200,
    max: 4000,
    step: 200,
    unit: "ms",
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "cobalt",
    options: ["cobalt", "vermilion", "moss", "carbon"],
    names: {
      cobalt: "Cobalt",
      vermilion: "Red",
      moss: "Moss",
      carbon: "Carbon",
    },
  },
  press: {
    kind: "range",
    label: "Press",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  frame: {
    kind: "choice",
    label: "Frame",
    default: "box",
    options: ["none", "box", "pill"],
    names: { none: "None", box: "Box", pill: "Pill" },
  },
});

const WORDS = ["Packed", "Checked", "Sealed", "Shipped"];

/**
 * A Fieldline order page's hero line: every order passes four stations, and
 * each one is stamped into the sentence as it happens.
 */
export function StampCycleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState(0);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · order 4471
        </p>
        <p className="text-[1.35rem] leading-[1.35] font-medium tracking-[-0.01em] text-foreground @md:text-[1.75rem] @xl:text-[2.4rem]">
          Every order is{" "}
          <StampCycle
            words={WORDS}
            index={at}
            onIndexChange={setAt}
            className="tracking-[0.06em] uppercase"
            sound={sound}
            {...values}
          />
        </p>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          stamp {at + 1} of {WORDS.length} · {WORDS[at]?.toLowerCase()} · press
          to stamp
        </p>
      ) : null}
    </div>
  );
}
