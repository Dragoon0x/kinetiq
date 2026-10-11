"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  FluteBubbles,
  type FluteBubblesFizz,
} from "@/registry/ui/flute-bubbles";

export const tweaks = defineTweaks({
  streams: {
    kind: "range",
    label: "Streams",
    default: 7,
    min: 2,
    max: 16,
    step: 1,
  },
  fizz: {
    kind: "range",
    label: "Fizz",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "straw",
    options: ["straw", "rose", "amber", "water"],
    names: { straw: "Straw", rose: "Rosé", amber: "Amber", water: "Water" },
  },
});

/**
 * Coldbrook Cellars' tasting card for the 2019 cuvée: one flute, poured and
 * left to talk for itself.
 */
export function FluteBubblesDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<FluteBubblesFizz>("lively");
  const [taps, setTaps] = React.useState(0);
  const [pours, setPours] = React.useState(0);

  const glass = (
    <FluteBubbles
      sound={sound}
      onTap={() => setTaps((n) => n + 1)}
      onTopUp={() => setPours((n) => n + 1)}
      onFizzChange={setState}
      className="h-full w-full"
      {...values}
    />
  );

  const kicker = (
    <p className="truncate text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
      Coldbrook Cellars · Cuvée 19
    </p>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col gap-2" style={{ height: 548 }}>
        {kicker}
        <div className="relative w-full flex-1 overflow-clip">{glass}</div>
      </div>
    );
  }

  const streams = Math.round(values.streams ?? tweaks.streams.default);

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {kicker}
      <div className="relative w-full overflow-clip" style={{ height: 440 }}>
        {glass}
      </div>
      <p className="text-center text-xs text-ink-2">
        Brut nature, nine years on the lees. A fine, persistent bead.
      </p>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">fizz {state}</span> · {streams}{" "}
        {streams === 1 ? "stream" : "streams"} · tapped {taps} · topped up{" "}
        {pours}
      </p>
    </div>
  );
}
