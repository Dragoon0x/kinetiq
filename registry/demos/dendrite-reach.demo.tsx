"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { DendriteReach } from "@/registry/ui/dendrite-reach";

export const tweaks = defineTweaks({
  branching: {
    kind: "range",
    label: "Branching",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pulse: {
    kind: "range",
    label: "Pulse",
    default: 0.3,
    min: 0,
    max: 2,
    step: 0.1,
    unit: "Hz",
  },
  stain: {
    kind: "choice",
    label: "Stain",
    default: "green",
    options: ["green", "magenta", "cyan", "amber"],
    names: { green: "Green", magenta: "Magenta", cyan: "Cyan", amber: "Amber" },
  },
});

const chip =
  "inline-flex h-8 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:border-cobalt-bright/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Gaugeworks' neuro lab: culture 7 under the scope on day three, its cells
 * reaching for each other and passing signals across.
 */
export function DendriteReachDemo({
  chrome = true,
  // The culture is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [culture, setCulture] = React.useState(7);
  const [junctions, setJunctions] = React.useState(0);
  const [fired, setFired] = React.useState<number | null>(null);

  const scope = (
    <DendriteReach
      label={`Culture ${culture}`}
      seed={culture}
      onJunctionsChange={setJunctions}
      onFire={(cell, cause) => {
        // Only the visitor's own stimulus is narrated; the culture's own
        // chatter would make the status line talk all the time.
        if (cause === "stimulus") setFired(cell);
      }}
      className={cn("w-full rounded-3", chrome ? "h-56" : "h-52")}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{scope}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks · neuro lab
          </p>
          <p className="text-base font-medium text-foreground">
            Culture {culture}, day three under the scope
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCulture((c) => c + 1);
            setFired(null);
          }}
          className={chip}
        >
          New culture
        </button>
      </div>
      {scope}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {junctions} {junctions === 1 ? "junction" : "junctions"}
        </span>
        {fired === null
          ? " · point to cue the tips, click to stimulate"
          : ` · cell ${fired + 1} stimulated`}
      </p>
    </div>
  );
}
