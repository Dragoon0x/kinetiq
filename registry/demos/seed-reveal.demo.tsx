"use client";

import * as React from "react";

import { SeedReveal } from "@/registry/ui/seed-reveal";

const PHRASE = [
  "harbour",
  "lantern",
  "gravel",
  "meadow",
  "cinder",
  "willow",
  "anchor",
  "pebble",
  "thicket",
  "marrow",
  "quarry",
  "bramble",
];

export function SeedRevealDemo() {
  const [seen, setSeen] = React.useState(0);
  const [copy, setCopy] = React.useState<"none" | "copied" | "blocked">("none");
  const [run, setRun] = React.useState(0);

  const armed = seen >= PHRASE.length;
  const state = copy === "none" ? (armed ? "copy armed" : "copy locked") : copy;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Waylight Wallet · backup 1 of 2
        </span>
        <button
          type="button"
          onClick={() => {
            setSeen(0);
            setCopy("none");
            setRun((count) => count + 1);
          }}
          className="flex h-8 shrink-0 items-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Start over
        </button>
      </div>

      <SeedReveal
        key={run}
        words={PHRASE}
        onSeenChange={(count) => {
          setSeen(count);
          setCopy("none");
        }}
        onCopy={(ok) => setCopy(ok ? "copied" : "blocked")}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Phrase seen{" "}
        <span className="text-signal">
          {seen} / {PHRASE.length}
        </span>{" "}
        · <span className="text-signal">{state}</span>
      </p>
    </div>
  );
}
