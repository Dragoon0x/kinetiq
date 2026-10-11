"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DripClock } from "@/registry/ui/drip-clock";

export const tweaks = defineTweaks({
  tempo: {
    kind: "choice",
    label: "Tempo",
    default: "clock",
    options: ["clock", "slow", "fast"],
    names: { clock: "Clock", slow: "Slow", fast: "Fast" },
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "ink",
    options: ["ink", "jade", "copper", "night"],
    names: { ink: "Ink", jade: "Jade", copper: "Copper", night: "Night" },
  },
});

/**
 * Basinworks' desk clock: a dark stone basin that counts the minute in
 * rings, with room for a drop of your own.
 */
export function DripClockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [second, setSecond] = React.useState<number | null>(null);
  const [added, setAdded] = React.useState(0);

  const clock = (
    <DripClock
      label="Basinworks water clock"
      sound={sound}
      onTick={(s) => setSecond(s)}
      onDrop={() => setAdded((n) => n + 1)}
      className="size-52"
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{clock}</div>;
  }

  const shown =
    second === null
      ? "0:00"
      : `0:${String(second + 1 === 60 ? 0 : second + 1).padStart(2, "0")}`;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks · water clock
      </p>
      <div className="flex justify-center">{clock}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{shown}</span> ·{" "}
        {added === 0
          ? "click the water to add a drop"
          : added === 1
            ? "1 drop added"
            : `${added} drops added`}
      </p>
    </div>
  );
}
