"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTableSpinnerItems,
  TableSpinner,
} from "@/registry/ui/table-spinner";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 60,
    min: 30,
    max: 72,
    step: 2,
    unit: "°",
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  plateSize: {
    kind: "range",
    label: "Plate",
    default: 0.9,
    min: 0.6,
    max: 1,
    step: 0.05,
  },
});

const BUTTON =
  "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks Ceramics, the spring firing: eight pieces on the studio's
 * turntable, spun by hand to look at each in turn.
 */
export function TableSpinnerDemo({
  chrome = true,
  // The turntable is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [front, setFront] = React.useState(0);
  const items = defaultTableSpinnerItems;
  const n = items.length;

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 548 }}>
        <TableSpinner
          value={front}
          onValueChange={setFront}
          autoTurn={3600}
          label="Fernworks Ceramics, spring firing"
          className="h-full"
          {...values}
        />
      </div>
    );
  }

  const piece = items[front];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Ceramics
          </p>
          <p className="text-sm font-medium text-foreground">
            Spring firing, eight pieces
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={BUTTON}
            onClick={() => setFront((f) => (f - 1 + n) % n)}
          >
            Previous
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => setFront((f) => (f + 1) % n)}
          >
            Next
          </button>
        </div>
      </div>
      <div className="w-full" style={{ height: 420 }}>
        <TableSpinner
          value={front}
          onValueChange={setFront}
          label="Fernworks Ceramics, spring firing"
          className="h-full"
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {front + 1} of {n}
        </span>{" "}
        · {(piece?.caption ?? "").toLowerCase()}
      </p>
    </div>
  );
}
