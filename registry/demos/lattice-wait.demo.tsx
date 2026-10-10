"use client";

import * as React from "react";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LatticeWait,
  type LatticeWaitStatus,
} from "@/registry/ui/lattice-wait";

export const tweaks = defineTweaks({
  grid: {
    kind: "range",
    label: "Grid",
    default: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "ember", "rose"],
    names: { cobalt: "Cobalt", signal: "Signal", ember: "Ember", rose: "Rose" },
  },
});

/** How long the pretend sync takes, and how long the card rests on its mark. */
const SYNC_MS = 4800;
const REST_MS = 2600;

const button =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fieldline Desktop syncing a notebook: the lattice weaves while notes come
 * down, and collapses into a check when the last one lands.
 */
export function LatticeWaitDemo({
  chrome = true,
  // The loader is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<LatticeWaitStatus>("loading");
  const [run, setRun] = React.useState(0);

  // The pretend sync: done after a few seconds. On a gallery card it loops,
  // so the card always shows the weave.
  React.useEffect(() => {
    if (status === "loading") {
      const id = window.setTimeout(() => setStatus("success"), SYNC_MS);
      return () => window.clearTimeout(id);
    }
    if (!chrome) {
      const id = window.setTimeout(() => setStatus("loading"), REST_MS);
      return () => window.clearTimeout(id);
    }
  }, [status, chrome, run]);

  const card = (
    <div className="flex w-full items-center gap-4 rounded-4 border border-hairline bg-card px-4 py-3.5">
      <LatticeWait
        size="lg"
        status={status}
        label="Syncing notes"
        successLabel="Notes synced"
        errorLabel="Sync failed"
        {...values}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {status === "success"
            ? "Notebook up to date"
            : status === "error"
              ? "Sync paused"
              : "Syncing 24 notes"}
        </p>
        <p className="truncate text-xs text-ink-3">
          {status === "error"
            ? "Fieldline Desktop is offline"
            : "From Fieldline Desktop"}
        </p>
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-xs justify-center">{card}</div>;
  }

  const grid = values.grid ?? tweaks.grid.default;
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="w-full max-w-xs self-center">{card}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "loading"
              ? "weaving"
              : status === "success"
                ? "synced"
                : "failed"}
          </span>
          {` · ${grid}×${grid} lattice`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setStatus("loading");
              setRun((r) => r + 1);
            }}
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Replay
          </button>
          <button
            type="button"
            className={button}
            onClick={() => setStatus("error")}
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            Fail
          </button>
        </div>
      </div>
    </div>
  );
}
