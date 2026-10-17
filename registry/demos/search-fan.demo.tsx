"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SearchFan } from "@/registry/ui/search-fan";

export const tweaks = defineTweaks({
  fanAngle: {
    kind: "range",
    label: "Fan angle",
    default: 8,
    min: 0,
    max: 16,
    step: 1,
    unit: "°",
  },
  scanSpeed: {
    kind: "range",
    label: "Skim",
    default: 700,
    min: 300,
    max: 1500,
    step: 100,
    unit: "ms",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/**
 * An agent researching Basinworks water pricing: three queries, eight
 * results from invented sites, and the third query rate limited.
 */
export function SearchFanDemo({
  chrome = true,
  // The search is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState("searching basinworks water pricing");
  const [kept, setKept] = React.useState(0);

  const surface = (
    <SearchFan
      key={round}
      onComplete={() => setNote("search done · 4 kept by the agent")}
      onKeep={(r) => {
        setKept((k) => k + 1);
        setNote(`you kept ${r.domain}`);
      }}
      onDiscard={(r) => {
        setKept((k) => k - 1);
        setNote(`you dropped ${r.domain}`);
      }}
      onStop={() => setNote("search stopped")}
      onOpenResult={(r) => setNote(`open ${r.domain}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setNote("searching basinworks water pricing");
            setKept(0);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span>
        {` · overrides ${kept >= 0 ? "+" : "−"}${Math.abs(kept)}`}
      </p>
    </div>
  );
}
