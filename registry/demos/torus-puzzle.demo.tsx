"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  TorusPuzzle,
  type TorusPuzzleHandle,
} from "@/registry/ui/torus-puzzle";

export const tweaks = defineTweaks({
  grid: {
    kind: "range",
    label: "Grid",
    default: 6,
    min: 3,
    max: 8,
    step: 1,
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 600,
    min: 200,
    max: 1500,
    step: 100,
    unit: "ms",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const chip =
  "inline-flex h-8 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:border-cobalt-bright/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The sign in Coldbrook's lobby: a ring of light that slides itself apart
 * and back together while people wait — and anyone may have a go.
 */
export function TorusPuzzleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const puzzle = React.useRef<TorusPuzzleHandle | null>(null);
  const [solved, setSolved] = React.useState(true);
  const [steps, setSteps] = React.useState(0);

  const board = (
    <TorusPuzzle
      ref={puzzle}
      label="Coldbrook lobby sign"
      sound={sound}
      onSolvedChange={setSolved}
      onDistanceChange={setSteps}
      className={chrome ? "w-56" : "w-52"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full justify-center">{board}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · lobby
        </p>
        <p className="text-base font-medium text-foreground">
          The sign that solves itself
        </p>
      </div>
      <div className="self-center">{board}</div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => puzzle.current?.scramble()}
        >
          Scramble
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => puzzle.current?.solve()}
        >
          Solve
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{solved ? "solved" : "scrambled"}</span> ·{" "}
        {solved ? (
          "drag a row or a column"
        ) : (
          // The count moves every step; the grid's own name carries it for
          // assistive technology, so the status only speaks the state.
          <span aria-hidden>
            {steps} {steps === 1 ? "step" : "steps"} from home
          </span>
        )}
      </p>
    </div>
  );
}
