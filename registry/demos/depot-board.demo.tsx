"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DepotBoard } from "@/registry/ui/depot-board";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  cells: {
    kind: "range",
    label: "Cells",
    default: 14,
    min: 8,
    max: 20,
    step: 1,
  },
  ripple: {
    kind: "range",
    label: "Ripple",
    default: 28,
    min: 0,
    max: 80,
    step: 4,
    unit: "ms",
  },
});

const DEPARTURES = [
  "Coldbrook\n09:15 plat 4",
  "Basin Quay\n09:42 plat 2",
  "Fern Hill\n10:05 on time",
  "Waylight\n10:30 delayed",
];

/**
 * Waylight Rail's concourse board: the next departures clatter past, and a
 * press brings the next one round.
 */
export function DepotBoardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [settled, setSettled] = React.useState<number | null>(null);

  const board = (
    <DepotBoard
      messages={DEPARTURES}
      index={index}
      onIndexChange={(i) => {
        setIndex(i);
        setSettled(null);
      }}
      onComplete={setSettled}
      caption={
        <>
          <span>Waylight Rail · departures</span>
          <span className="text-signal">Concourse B</span>
        </>
      }
      label="Waylight Rail departures"
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{board}</div>;

  const [place = "", when = ""] = (DEPARTURES[index] ?? "").split("\n");
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {board}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {settled === index ? "settled" : "flipping"}
          </span>{" "}
          · {index + 1} of {DEPARTURES.length} · {place} {when}
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex((i) => (i + 1) % DEPARTURES.length);
            setSettled(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Next
        </button>
      </div>
    </div>
  );
}
