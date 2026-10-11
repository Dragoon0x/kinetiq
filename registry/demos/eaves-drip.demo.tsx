"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EavesDrip } from "@/registry/ui/eaves-drip";

export const tweaks = defineTweaks({
  rainRate: {
    kind: "range",
    label: "Rain",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pixel: {
    kind: "range",
    label: "Pixel",
    default: 3,
    min: 2,
    max: 6,
    step: 1,
    unit: "px",
  },
  puddle: {
    kind: "range",
    label: "Puddle",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const arrow = (w: number) => (w > 0.05 ? "→" : w < -0.05 ? "←" : "·");

/**
 * Fieldline Weather's hourly card for a cottage on Fen Lane: light rain for
 * the next two hours, drawn as the rain on its own roof.
 */
export function EavesDripDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [wind, setWind] = React.useState(0.3);
  const [fill, setFill] = React.useState(0);
  const [gust, setGust] = React.useState<-1 | 1 | null>(null);

  const scene = (
    <EavesDrip
      label="Rain on the cottage roof"
      className="h-52 w-full"
      sound={sound}
      onWindChange={(w) => {
        setWind(w);
        setGust(null);
      }}
      onPuddleChange={setFill}
      onGust={setGust}
      {...values}
    >
      <div className="pointer-events-none flex h-full flex-col items-end p-3 text-right">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Fen Lane · next 2 h
        </p>
        <p className="text-base leading-tight font-semibold tracking-tight">
          Light rain · 11°
        </p>
      </div>
    </EavesDrip>
  );

  if (!chrome) return <div className="flex w-full">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {gust
            ? `gust ${gust > 0 ? "→" : "←"} · spray lifted`
            : `wind ${Math.abs(wind).toFixed(1)} ${arrow(wind)}`}
        </span>{" "}
        · puddle {Math.round(fill * 100)}%
      </p>
    </div>
  );
}
