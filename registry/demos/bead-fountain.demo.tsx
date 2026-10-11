"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BeadFountain,
  type BeadFountainState,
} from "@/registry/ui/bead-fountain";

export const tweaks = defineTweaks({
  beadSize: {
    kind: "range",
    label: "Bead size",
    default: 5,
    min: 3,
    max: 9,
    step: 1,
    unit: "px",
  },
  length: {
    kind: "range",
    label: "Length",
    default: 160,
    min: 60,
    max: 300,
    step: 20,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "steel",
    options: ["steel", "brass", "copper", "black"],
    names: { steel: "Steel", brass: "Brass", copper: "Copper", black: "Black" },
  },
});

const METAL: Record<string, string> = {
  steel: "Nickel-plated steel",
  brass: "Solid brass",
  copper: "Bright copper",
  black: "Black nickel",
};

/**
 * Coldbrook Hardware's ball chain, sold by the metre: the reel is a glazed
 * pot on the counter and the visitor pulls as much as they like.
 */
export function BeadFountainDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<BeadFountainState>("rest");
  const [out, setOut] = React.useState(12);
  const total = values.length ?? 160;
  const metal = METAL[values.finish ?? "steel"] ?? METAL.steel;

  const counter = (
    <BeadFountain
      label="Ball chain in its pot"
      potPosition={0.18}
      onStateChange={setState}
      onPour={setOut}
      sound={sound}
      className="h-52 w-full rounded-3 border border-hairline bg-card"
      {...values}
    >
      <div className="@container flex size-full flex-col items-end justify-start p-4 text-right">
        <p className="max-w-full truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Hardware
        </p>
        <p
          className="mt-1 max-w-[14ch] font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.125rem, 5cqw, 1.875rem)",
            lineHeight: 1.1,
          }}
        >
          Ball chain, by the metre
        </p>
        <p className="mt-1.5 max-w-[24ch] text-xs text-ink-2">
          {metal}, No. {values.beadSize ?? 5} bead.
        </p>
      </div>
    </BeadFountain>
  );

  if (!chrome) return <div className="flex w-full">{counter}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {counter}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "pulling" ? (
          <>
            <span className="text-signal">pulling</span> · {out} of {total}{" "}
            beads out
          </>
        ) : state === "falling" ? (
          <>
            <span className="text-signal">let go</span> · coiling on the floor
          </>
        ) : state === "winding" ? (
          <>
            <span className="text-signal">winding back in</span> · {out} beads
            out
          </>
        ) : (
          <>
            <span className="text-signal">in the pot</span> · move in to pull
          </>
        )}
      </p>
    </div>
  );
}
