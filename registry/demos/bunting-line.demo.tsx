"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BuntingLine } from "@/registry/ui/bunting-line";

export const tweaks = defineTweaks({
  sag: {
    kind: "range",
    label: "Sag",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  flagShape: {
    kind: "choice",
    label: "Flags",
    default: "pennant",
    options: ["pennant", "swallow", "square", "scallop"],
    names: {
      pennant: "Pennant",
      swallow: "Swallow",
      square: "Square",
      scallop: "Scallop",
    },
  },
});

/**
 * The Fernworks summer fair, strung across the top of its listing: pluck the
 * string and the wave runs out to both pegs and back.
 */
export function BuntingLineDemo({
  chrome = true,
  // The bunting is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plucked, setPlucked] = React.useState<number | null>(null);
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const card = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks summer fair · Saturday 14 June
      </p>
      <BuntingLine
        as="h2"
        text="FAIR DAY"
        onPluck={(at) => {
          setPlucked(at);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setPlucked(null), 2200);
        }}
        {...values}
        className="text-foreground"
      />
      <p className="text-sm text-ink-2">
        Stalls on the green from ten, the brass band at noon and lanterns at
        dusk.
      </p>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-xl">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {plucked === null ? (
          <>
            <span className="text-signal">breezy</span> · press Space to pluck
            the string
          </>
        ) : (
          <>
            <span className="text-signal">plucked</span> · the wave runs to both
            ends
          </>
        )}
      </p>
    </div>
  );
}
