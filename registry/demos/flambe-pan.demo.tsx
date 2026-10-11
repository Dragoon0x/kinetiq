"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FlambePan, type FlambePanState } from "@/registry/ui/flambe-pan";

export const tweaks = defineTweaks({
  height: {
    kind: "range",
    label: "Height",
    default: 0.7,
    min: 0.3,
    max: 1,
    step: 0.05,
  },
  gust: {
    kind: "range",
    label: "Gust",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 52,
    min: 20,
    max: 140,
    step: 4,
    unit: "°",
  },
});

const STATUS: Record<FlambePanState, [string, string]> = {
  out: ["out", "tip the pan to catch the spirit"],
  flaring: ["flaring", "shake to feed it"],
  licks: ["blue licks", "burning down"],
};

/**
 * Coldbrook Supper Club, tableside: crêpes in orange butter, flamed at the
 * table. Tip the pan (drag up, or press it) and the brandy catches at the lip.
 */
export function FlambePanDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<FlambePanState>("out");
  const [word, note] = STATUS[state];

  const pan = (
    <FlambePan
      className="aspect-[16/10]"
      label="Flambé pan: tip it to flame the crêpes"
      onFlameChange={setState}
      sound={sound}
      {...values}
    >
      <p className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.08em] text-white/60 uppercase">
        Tableside · Coldbrook
      </p>
    </FlambePan>
  );

  if (!chrome) return <div className="w-full max-w-[340px]">{pan}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Supper Club · tableside
        </p>
        <p className="text-sm font-medium text-foreground">
          Crêpes in orange butter, flamed at your table
        </p>
      </div>
      {pan}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{word}</span> · {note}
      </p>
    </div>
  );
}
