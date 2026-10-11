"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultPrismGateItems, PrismGate } from "@/registry/ui/prism-gate";

export const tweaks = defineTweaks({
  dispersion: {
    kind: "range",
    label: "Dispersion",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gateWidth: {
    kind: "range",
    label: "Gate",
    default: 150,
    min: 100,
    max: 220,
    step: 10,
    unit: "px",
  },
  sideTone: {
    kind: "choice",
    label: "Sides",
    default: "graphite",
    options: ["graphite", "sepia", "cyano", "paper"],
    names: {
      graphite: "Graphite",
      sepia: "Sepia",
      cyano: "Cyano",
      paper: "Paper",
    },
  },
});

/**
 * The Basinworks print room shows its "Field prints" series on one long
 * rail; the pictures only take their colour in the glass.
 */
export function PrismGateDemo({
  chrome = true,
  // The glass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [held, setHeld] = React.useState(2);
  const print = defaultPrismGateItems[held];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {chrome ? (
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks print room · field prints
        </p>
      ) : null}
      <PrismGate
        label="Field prints"
        defaultValue={2}
        onValueChange={setHeld}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">in the gate</span> · {held + 1} of{" "}
          {defaultPrismGateItems.length} ·{" "}
          {(print?.caption ?? print?.alt ?? "").toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
