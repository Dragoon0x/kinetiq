"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LotusBeads } from "@/registry/ui/lotus-beads";

export const tweaks = defineTweaks({
  beads: {
    kind: "range",
    label: "Beads",
    default: 7,
    min: 3,
    max: 14,
    step: 1,
  },
  tension: {
    kind: "range",
    label: "Tension",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "range",
    label: "Tint",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks Botanic: a close-up of a waxy leaf after rain, its beads ready
 * to be rolled together or flicked apart.
 */
export function LotusBeadsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [count, setCount] = React.useState(values.beads ?? 7);
  const [merged, setMerged] = React.useState(0);
  const [splits, setSplits] = React.useState(0);

  const leaf = (
    <LotusBeads
      key={round}
      label="Beads on the leaf"
      sound={sound}
      onBeadsChange={setCount}
      onMerge={() => setMerged((n) => n + 1)}
      onSplit={() => setSplits((n) => n + 1)}
      className="h-52 rounded-3"
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{leaf}</div>;

  const beadsText = count === 1 ? "1 bead" : `${count} beads`;
  const detail =
    merged === 0 && splits === 0
      ? "drag one into another"
      : `${merged} merged · ${splits === 1 ? "1 split" : `${splits} splits`}`;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Botanic · after rain
        </p>
        <button
          type="button"
          onClick={() => {
            setRound((n) => n + 1);
            setMerged(0);
            setSplits(0);
          }}
          className="h-8 rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
      {leaf}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{beadsText}</span> · {detail}
      </p>
    </div>
  );
}
