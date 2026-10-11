"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AcrylicPour } from "@/registry/ui/acrylic-pour";

export const tweaks = defineTweaks({
  cells: {
    kind: "range",
    label: "Cells",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "tide",
    options: ["tide", "ember", "moss", "dusk"],
    names: { tide: "Tide", ember: "Ember", moss: "Moss", dusk: "Dusk" },
  },
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Studio: a small pour still wet on the bench — tip it to let the
 * paint run, tap for the next one.
 */
export function AcrylicPourDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seed, setSeed] = React.useState(12);
  const [flowing, setFlowing] = React.useState(false);
  const [poured, setPoured] = React.useState(false);

  const pour = (
    <AcrylicPour
      label="Fernworks pour"
      className={chrome ? "h-60" : "h-[208px]"}
      seed={seed}
      onSeedChange={(s) => {
        setSeed(s);
        setPoured(true);
      }}
      onFlowChange={(f) => {
        setFlowing(f);
        if (!f) setPoured(false);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{pour}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Fernworks Studio</p>
        <p className="font-mono text-[11px] text-ink-3 tabular-nums">
          Pour no. {seed} · acrylic on canvas
        </p>
      </div>
      {pour}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {poured ? "new pour" : flowing ? "flowing" : "level"}
        </span>
        {` · pour ${seed} · drag to tilt`}
      </p>
    </div>
  );
}
