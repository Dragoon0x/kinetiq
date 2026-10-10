"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CometKnob } from "@/registry/ui/comet-knob";

export const tweaks = defineTweaks({
  detents: {
    kind: "range",
    label: "Detents",
    default: 12,
    min: 0,
    max: 24,
    step: 4,
  },
  tail: {
    kind: "range",
    label: "Tail",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const clock = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The steep dial on a Coldbrook kettle: four minutes round the dial, a tick
 * at every notch, and a comet of light wherever it is turned.
 */
export function CometKnobDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [steep, setSteep] = React.useState(120);
  const [turning, setTurning] = React.useState(false);
  const detents = values.detents ?? tweaks.detents.default;

  const knob = (
    <div className="flex flex-col items-center gap-2">
      <CometKnob
        label="Steep"
        min={0}
        max={240}
        value={steep}
        onValueChange={(v) => {
          setSteep(v);
          setTurning(true);
        }}
        onValueCommit={() => setTurning(false)}
        format={clock}
        sound={sound}
        {...values}
      />
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook kettle · green tea · 80°
      </p>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{knob}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="self-center">{knob}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {turning ? "turning" : `steep ${clock(steep)}`}
        </span>
        {detents > 0 ? ` · ${detents} detents` : " · smooth"}
      </p>
    </div>
  );
}
