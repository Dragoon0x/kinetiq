"use client";

import * as React from "react";

import { SeedConfirm } from "@/registry/ui/seed-confirm";

const POSITIONS = [3, 7, 11];
const ANSWERS = ["gravel", "anchor", "quarry"];

/** Caller-ordered, so the shuffle is the same on the server and the client. */
const OPTIONS = [
  "anchor",
  "willow",
  "quarry",
  "cinder",
  "gravel",
  "meadow",
  "bramble",
  "pebble",
];

export function SeedConfirmDemo() {
  const [placed, setPlaced] = React.useState<string[]>([]);
  const [misses, setMisses] = React.useState(0);
  const [done, setDone] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Waylight Wallet · backup 2 of 2
        </span>
        <button
          type="button"
          onClick={() => {
            setPlaced([]);
            setMisses(0);
            setDone(false);
          }}
          className="flex h-8 shrink-0 items-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Start over
        </button>
      </div>

      <SeedConfirm
        positions={POSITIONS}
        answers={ANSWERS}
        options={OPTIONS}
        value={placed}
        onValueChange={setPlaced}
        onMistake={() => setMisses((count) => count + 1)}
        onComplete={() => setDone(true)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Confirm{" "}
        <span className="text-signal">
          {placed.length} of {POSITIONS.length}
        </span>{" "}
        ·{" "}
        <span className="text-signal">
          {done
            ? "phrase confirmed"
            : `${misses} miss${misses === 1 ? "" : "es"}`}
        </span>
      </p>
    </div>
  );
}
