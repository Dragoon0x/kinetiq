"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HeatHold, type HeatHoldState } from "@/registry/ui/heat-hold";

export const tweaks = defineTweaks({
  hold: {
    kind: "range",
    label: "Hold",
    default: 1600,
    min: 600,
    max: 3000,
    step: 200,
    unit: "ms",
  },
  shimmer: {
    kind: "range",
    label: "Shimmer",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.1,
  },
  colors: {
    kind: "choice",
    label: "Heat",
    default: "kiln",
    options: ["kiln", "forge", "gas"],
    names: { kiln: "Kiln", forge: "Forge", gas: "Gas" },
  },
});

/**
 * Coldbrook Pottery's kiln control: holding the button fires batch 14, and
 * letting go early lets the kiln cool without firing.
 */
export function HeatHoldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<HeatHoldState>("idle");
  const [fired, setFired] = React.useState(0);
  const hold = values.hold ?? tweaks.hold.default;

  const panel = (
    <div className="flex w-full max-w-sm min-w-0 flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Kiln 2 · Batch 14</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Cone 6 · 1,222 °C
        </p>
      </div>
      <p className="text-xs text-ink-3">38 glazed pieces, loaded and vented.</p>
      <HeatHold
        label="Hold to fire batch 14"
        doneLabel="Batch 14 fired"
        onHeatChange={setState}
        onConfirm={() => setFired((n) => n + 1)}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{panel}</div>;
  }

  const seconds = Number((hold / 1000).toFixed(1));
  const reading =
    state === "heating"
      ? "heating · let go to cool"
      : state === "cooling"
        ? "cooling · not fired"
        : state === "fired"
          ? `fired · batch 14 is in${fired > 1 ? ` · ${fired} firings` : ""}`
          : `hold to fire · ${seconds} s`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading}
      </p>
    </div>
  );
}
