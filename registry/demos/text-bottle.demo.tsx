"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TextBottle, type TextBottleState } from "@/registry/ui/text-bottle";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 0,
    min: -120,
    max: 120,
    step: 5,
    unit: "°",
  },
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  charset: {
    kind: "choice",
    label: "Type",
    default: "ascii",
    options: ["ascii", "blocks", "dots", "binary"],
    names: { ascii: "ASCII", blocks: "Blocks", dots: "Dots", binary: "Binary" },
  },
});

const SAY: Record<TextBottleState, string> = {
  resting: "still",
  sloshing: "sloshing",
  pouring: "pouring",
  refilling: "refilling",
  empty: "empty",
};

/**
 * Basinworks Spring Water, bottle 03: still water you can tip out and watch
 * refill. The angle lives here, seeded from the tilt tweak, so a drag or a key
 * moves it and the tweak can still set it.
 */
export function TextBottleDemo({
  chrome = true,
  sound,
  tilt = 0,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(tilt);
  const [seen, setSeen] = React.useState(tilt);
  if (seen !== tilt) {
    setSeen(tilt);
    setAngle(tilt);
  }
  const [state, setState] = React.useState<{
    state: TextBottleState;
    level: number;
  }>({ state: "resting", level: 0.7 });

  const bottle = (
    <TextBottle
      label="Basinworks still water, bottle 03"
      sound={sound}
      {...values}
      tilt={angle}
      onTiltChange={setAngle}
      onStateChange={(next, level) => setState({ state: next, level })}
      onLevelChange={(level) => setState((s) => ({ ...s, level }))}
      className="h-full"
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 556 }}>
        {bottle}
      </div>
    );
  }

  const pct = Math.round(state.level * 100);
  const lean =
    Math.abs(angle) < 3
      ? "upright"
      : `tilted ${Math.abs(angle)}° ${angle > 0 ? "right" : "left"}`;
  const rest =
    state.state === "pouring"
      ? `${pct}% left`
      : state.state === "empty"
        ? "stand it up to refill"
        : `${lean} · ${pct}% full`;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks Spring Water · Bottle 03
        </p>
        <p className="text-sm font-medium text-foreground">
          Still water, typed by hand
        </p>
      </div>
      <div className="w-full" style={{ height: 380 }}>
        {bottle}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{SAY[state.state]}</span> · {rest}
      </p>
    </div>
  );
}
