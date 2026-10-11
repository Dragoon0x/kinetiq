"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { GelScroller } from "@/registry/ui/gel-scroller";

export const tweaks = defineTweaks({
  cues: {
    kind: "choice",
    label: "Cues",
    default: "spectrum",
    options: ["spectrum", "dusk", "neon", "theatre"],
    names: {
      spectrum: "Spectrum",
      dusk: "Dusk",
      neon: "Neon",
      theatre: "Theatre",
    },
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  roll: {
    kind: "range",
    label: "Roll",
    default: 4,
    min: 1,
    max: 10,
    step: 0.5,
    unit: "f/s",
  },
});

const NAMES: Record<string, string[]> = {
  spectrum: [
    "deep blue",
    "lavender",
    "magenta",
    "red",
    "amber",
    "straw",
    "green",
    "cyan",
  ],
  dusk: ["amber", "rose", "lavender", "deep blue", "peach"],
  neon: ["magenta", "cyan", "lime", "violet", "hot red"],
  theatre: ["open white", "bastard amber", "steel blue", "pale rose"],
};

/**
 * Fieldline Hall's lighting desk in Act II: six floor washes on scrollers,
 * rolling through their gels until the operator takes a cue.
 */
export function GelScrollerDemo({
  chrome = true,
  // The rig is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [cue, setCue] = React.useState<number | null>(null);
  const set = values.cues ?? "spectrum";
  const names = NAMES[set] ?? NAMES.spectrum ?? [];
  // A new list of gels starts the strips rolling again.
  const [seen, setSeen] = React.useState(set);
  if (seen !== set) {
    setSeen(set);
    setCue(null);
  }

  const stage = (
    <div className="relative w-full">
      <GelScroller
        value={cue}
        onValueChange={setCue}
        label="Fieldline Hall cues"
        className={cn("w-full rounded-3", chrome ? "h-64" : "h-52")}
        {...values}
      />
      <p className="pointer-events-none absolute top-10 left-3 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-white/75 uppercase backdrop-blur-sm">
        Fieldline Hall · Act II
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{stage}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {stage}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {cue === null ? (
          <>
            <span className="text-signal">rolling</span> · {set} · click to take
            a cue
          </>
        ) : (
          <>
            <span className="text-signal">cue {cue + 1}</span> ·{" "}
            {names[cue] ?? "gel"} · held, click it again to roll
          </>
        )}
      </p>
    </div>
  );
}
