"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NacreousSky } from "@/registry/ui/nacreous-sky";

export const tweaks = defineTweaks({
  sunAngle: {
    kind: "range",
    label: "Sun angle",
    default: 0,
    min: -60,
    max: 60,
    step: 5,
    unit: "°",
  },
  thinness: {
    kind: "range",
    label: "Thinness",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  saturation: {
    kind: "range",
    label: "Saturation",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Observatory's evening log: the sky over the dome after sunset,
 * the night's first note written across it.
 */
export function NacreousSkyDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const rest = values.sunAngle ?? tweaks.sunAngle.default;
  const [sun, setSun] = React.useState(rest);
  const [restSeen, setRestSeen] = React.useState(rest);
  if (rest !== restSeen) {
    setRestSeen(rest);
    setSun(rest);
  }

  const sky = (
    <NacreousSky onSunAngleChange={setSun} {...values}>
      <div className="@container flex size-full flex-col p-4">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Waylight Observatory · Evening log
        </p>
        <p
          className="mt-1 max-w-[18ch] font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.125rem, 4.4cqw, 1.875rem)",
            lineHeight: 1.08,
          }}
        >
          Colour at the edge of the cloud.
        </p>
      </div>
    </NacreousSky>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {sky}
      </div>
    );
  }

  const thin = values.thinness ?? tweaks.thinness.default;
  const sat = values.saturation ?? tweaks.saturation.default;
  const where =
    sun === 0
      ? "sun centred"
      : `sun ${Math.abs(sun)}° ${sun > 0 ? "right" : "left"}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="w-full" style={{ height: 224 }}>
        {sky}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{where}</span> ·{" "}
        {thin >= 0.7
          ? "gossamer edges"
          : thin <= 0.3
            ? "heavy veils"
            : "thin edges"}{" "}
        ·{" "}
        {sat >= 0.7
          ? "vivid pastel"
          : sat <= 0.25
            ? "pearl white"
            : "soft pastel"}
      </p>
    </div>
  );
}
