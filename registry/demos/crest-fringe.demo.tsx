"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrestFringe } from "@/registry/ui/crest-fringe";

export const tweaks = defineTweaks({
  waves: {
    kind: "range",
    label: "Waves",
    default: 3,
    min: 1,
    max: 6,
    step: 1,
  },
  dispersion: {
    kind: "range",
    label: "Dispersion",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Aquarium, gallery 4: the wave tank as the hero of the page,
 * lit from behind, with the lamp under the visitor's hand.
 */
export function CrestFringeDemo({
  chrome = true,
  // The tank is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(8);

  const tank = (
    <CrestFringe lightAngle={angle} onLightAngleChange={setAngle} {...values}>
      <div className="@container flex size-full flex-col p-4 pr-10">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Aquarium · Gallery 4
        </p>
        <p
          className="mt-1 max-w-[18ch] font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.125rem, 4.6cqw, 1.875rem)",
            lineHeight: 1.08,
          }}
        >
          Light, bent by water.
        </p>
      </div>
    </CrestFringe>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {tank}
      </div>
    );
  }

  const dispersion = values.dispersion ?? tweaks.dispersion.default;
  const waves = Math.round(values.waves ?? tweaks.waves.default);
  const where =
    angle === 0
      ? "lamp level"
      : `lamp ${Math.abs(angle)}° ${angle > 0 ? "above" : "below"}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="w-full" style={{ height: 224 }}>
        {tank}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{where}</span> · {waves}{" "}
        {waves === 1 ? "crest" : "crests"} ·{" "}
        {dispersion === 0
          ? "one white edge on every wave"
          : "fringes sliding along the waves"}
      </p>
    </div>
  );
}
