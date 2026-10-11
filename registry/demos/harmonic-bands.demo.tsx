"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HarmonicBands } from "@/registry/ui/harmonic-bands";

export const tweaks = defineTweaks({
  harmonics: {
    kind: "range",
    label: "Harmonics",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dusk",
    options: ["dusk", "tide", "ember", "moss"],
    names: { dusk: "Dusk", tide: "Tide", ember: "Ember", moss: "Moss" },
  },
  flow: {
    kind: "range",
    label: "Flow",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

const SHORT = ["f", "2f", "3f", "4f", "5f", "6f"];

/** What the chord sounds like, from where its weight sits. */
function describe(levels: number[], count: number) {
  const used = levels.slice(0, count);
  let sum = 0;
  let weighted = 0;
  let lead = 1;
  used.forEach((a, j) => {
    sum += a;
    weighted += a * (j / Math.max(1, count - 1));
    if (j > 0 && a > (used[lead] ?? 0)) lead = j;
  });
  const overtones = used.slice(1).some((a) => a >= 0.05);
  if (!overtones) return { tone: "pure tone", detail: "the fundamental alone" };
  const c = sum > 0 ? weighted / sum : 0;
  const tone =
    c < 0.22 ? "warm chord" : c < 0.45 ? "bright chord" : "brilliant chord";
  return { tone, detail: `${SHORT[lead] ?? "2f"} leads the overtones` };
}

/**
 * Fieldline Radio's station ident: the morning chord, drawn as strata of
 * colour, tuned by the presenter before the show.
 */
export function HarmonicBandsDemo({
  chrome = true,
  // The bands are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [levels, setLevels] = React.useState([1, 0.45, 0.2, 0.1, 0.06, 0.03]);
  const count = values.harmonics ?? 4;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <HarmonicBands
          className="h-[200px] w-full"
          value={levels}
          onValueChange={setLevels}
          {...values}
        />
      </div>
    );
  }

  const { tone, detail } = describe(levels, count);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Radio · Station ident
        </p>
        <p className="text-base leading-snug font-semibold text-foreground">
          Tune the morning chord
        </p>
      </div>
      <HarmonicBands
        className="h-60 w-full"
        label="Morning chord"
        value={levels}
        onValueChange={setLevels}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{tone}</span> · {detail} · drag a fader or
        use the arrow keys
      </p>
    </div>
  );
}
