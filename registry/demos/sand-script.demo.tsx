"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SandScript } from "@/registry/ui/sand-script";

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
  grain: {
    kind: "range",
    label: "Grain",
    default: 2,
    min: 1,
    max: 3,
    step: 0.5,
    unit: "px",
  },
  tone: {
    kind: "choice",
    label: "Beach",
    default: "dune",
    options: ["dune", "ash", "coral"],
    names: { dune: "Dune", ash: "Ash", coral: "Coral" },
  },
});

const PHRASES = [
  "Counting the tide",
  "Clearing the transfer",
  "Writing the receipt",
];

/**
 * A Waylight Pay transfer settling: the status is written in the sand while
 * the money moves, and the receipt line stays once it has landed.
 */
export function SandScriptDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(true);
  const [index, setIndex] = React.useState(0);

  const transfer = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Pay · transfer 88-204
      </p>
      <SandScript
        phrases={PHRASES}
        active={active}
        doneText="Transfer settled"
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{transfer}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {transfer}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {active ? (
            <>
              <span className="text-signal">writing</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · draw in the sand
            </>
          ) : (
            <>
              <span className="text-signal">settled</span> · receipt written
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setActive((on) => !on)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {active ? "Finish" : "Start again"}
        </button>
      </div>
    </div>
  );
}
