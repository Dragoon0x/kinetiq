"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LevelVial } from "@/registry/ui/level-vial";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  length: {
    kind: "range",
    label: "Length",
    default: 360,
    min: 240,
    max: 480,
    step: 20,
    unit: "px",
  },
  marks: {
    kind: "range",
    label: "Marks",
    default: 4,
    min: 0,
    max: 8,
    step: 1,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "spirit",
    options: ["spirit", "amber", "cobalt", "clear"],
    names: {
      spirit: "Spirit",
      amber: "Amber",
      cobalt: "Cobalt",
      clear: "Clear",
    },
  },
});

/** The studio's own shorthand: L for left, R for right, C in the middle. */
const balance = (v: number) =>
  v === 0 ? "C" : v < 0 ? `L ${Math.abs(v)}` : `R ${v}`;

/**
 * The Fieldline Studio mix for episode 42: the guest mic's stereo balance,
 * 50 left to 50 right with the centre as neutral. The level is dragged,
 * tapped or stepped with the keys; Centre puts it back the way a mixer's
 * reset does, and the bubble drifts home.
 */
export function LevelVialDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pan, setPan] = React.useState(-20);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <LevelVial
        label="Guest mic balance"
        min={-50}
        max={50}
        value={pan}
        onValueChange={setPan}
        format={balance}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">guest mic</span>
            {pan === 0
              ? " · centred"
              : ` · ${Math.abs(pan)} ${pan < 0 ? "left" : "right"}`}
          </p>
          <button
            type="button"
            onClick={() => setPan(0)}
            disabled={pan === 0}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Centre
          </button>
        </div>
      ) : null}
    </div>
  );
}
