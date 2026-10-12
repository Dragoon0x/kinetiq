"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPaintMatrixJobs,
  defaultPaintMatrixSelection,
  PaintMatrix,
  type PaintMatrixPair,
} from "@/registry/ui/paint-matrix";

export const tweaks = defineTweaks({
  cellShape: {
    kind: "choice",
    label: "Cells",
    default: "tile",
    options: ["tile", "dot", "bar"],
    names: { tile: "Tile", dot: "Dot", bar: "Bar" },
  },
  heatScale: {
    kind: "range",
    label: "Heat",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const jobsIn = (pairs: PaintMatrixPair[]) => {
  if (pairs.length === 0) return defaultPaintMatrixJobs.length;
  const keys = new Set(pairs.map((p) => `${p.rowId}::${p.columnId}`));
  return defaultPaintMatrixJobs.filter((j) =>
    keys.has(`${j.rowId}::${j.columnId}`),
  ).length;
};

/**
 * Fieldline's dispatch board: six sites against five job statuses. Paint
 * the blocked work across sites, or a whole site's queue, and the jobs list
 * follows once the stroke is done.
 */
export function PaintMatrixDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pairs, setPairs] = React.useState<PaintMatrixPair[]>(
    defaultPaintMatrixSelection,
  );
  const [delta, setDelta] = React.useState<number | null>(null);

  if (!chrome) {
    return (
      <div className="w-full">
        <PaintMatrix className="h-[548px]" {...values} />
      </div>
    );
  }

  const jobs = jobsIn(pairs);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PaintMatrix
        className="h-[460px]"
        selection={pairs}
        onSelectionChange={(next) => {
          setDelta(next.length - pairs.length);
          setPairs(next);
        }}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {pairs.length === 0 ? (
            <>
              <span className="text-signal">nothing painted</span> · all {jobs}{" "}
              jobs
            </>
          ) : (
            <>
              <span className="text-signal">
                {pairs.length} {pairs.length === 1 ? "pair" : "pairs"}
              </span>{" "}
              · {jobs} {jobs === 1 ? "job" : "jobs"}
              {delta ? ` · last stroke ${delta > 0 ? "+" : ""}${delta}` : ""}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setPairs(defaultPaintMatrixSelection);
            setDelta(null);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
