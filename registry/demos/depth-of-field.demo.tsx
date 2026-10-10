"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DepthOfField } from "@/registry/ui/depth-of-field";

export const tweaks = defineTweaks({
  aperture: {
    kind: "range",
    label: "Aperture",
    default: 2.8,
    min: 1,
    max: 16,
    step: 0.5,
  },
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 1100,
    min: 300,
    max: 2400,
    step: 100,
    unit: "ms",
  },
  breath: {
    kind: "range",
    label: "Breath",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const LINE = "Every frame finds its subject.";
const WORDS = LINE.split(" ");

/**
 * Fieldline Optics launching a fast prime: the headline racks into focus
 * the way the lens does, and pointing at a word pulls focus to it.
 */
export function DepthOfFieldDemo({
  chrome = true,
  // The lens is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  const [focus, setFocus] = React.useState<number | null>(null);
  const [settled, setSettled] = React.useState(false);
  const f = values.aperture ?? tweaks.aperture.default;

  const hero = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline 35 mm · f/1.4 prime
      </p>
      <DepthOfField
        key={take}
        as="h2"
        value={focus}
        onValueChange={setFocus}
        onComplete={() => setSettled(true)}
        className="text-[clamp(1.5rem,6.2cqi,2.75rem)] leading-[1.15] font-semibold tracking-[-0.015em] text-foreground"
        {...values}
      >
        {LINE}
      </DepthOfField>
      <p className="text-sm text-ink-2">Point at a word to pull focus to it.</p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{hero}</div>;

  const word = focus === null ? null : WORDS[focus]?.replace(/[.,]$/, "");
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {hero}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">f/{f.toFixed(1)}</span> ·{" "}
          {!settled
            ? "racking focus"
            : word
              ? `focus on “${word}” · ${(focus ?? 0) + 1} of ${WORDS.length}`
              : "everything in focus"}
        </p>
        <button
          type="button"
          onClick={() => {
            setSettled(false);
            setFocus(null);
            setTake((t) => t + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
