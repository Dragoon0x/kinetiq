"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultDryingPrints, DryingLine } from "@/registry/ui/drying-line";

export const tweaks = defineTweaks({
  sway: {
    kind: "range",
    label: "Sway",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sag: {
    kind: "range",
    label: "Sag",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pegs: {
    kind: "choice",
    label: "Pegs",
    default: "wood",
    options: ["wood", "binder", "film"],
    names: { wood: "Wood", binder: "Binder", film: "Film" },
  },
});

/**
 * The Coldbrook darkroom on a Tuesday afternoon: the morning's prints drying
 * on the line under the safelight.
 */
export function DryingLineDemo({
  chrome = true,
  // The darkroom is quiet: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [out, setOut] = React.useState<number | null>(null);

  const line = (
    <DryingLine
      label="Tuesday's prints"
      value={index}
      onValueChange={setIndex}
      onUnclip={setOut}
      className={chrome ? "h-[232px] w-full" : "h-[208px] w-full"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{line}</div>;

  const shown = out ?? index;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Coldbrook Darkroom
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Tuesday · fibre prints, drying
        </p>
      </div>
      {line}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          print {shown + 1} of {defaultDryingPrints.length}
        </span>
        {` · ${(defaultDryingPrints[shown]?.caption ?? "").toLowerCase()} · ${
          out === null ? "on the line" : "unclipped"
        }`}
      </p>
    </div>
  );
}
