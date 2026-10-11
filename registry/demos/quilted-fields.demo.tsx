"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { QuiltedFields } from "@/registry/ui/quilted-fields";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  altitude: {
    kind: "range",
    label: "Altitude",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  season: {
    kind: "choice",
    label: "Season",
    default: "summer",
    options: ["spring", "summer", "harvest", "winter"],
    names: {
      spring: "Spring",
      summer: "Summer",
      harvest: "Harvest",
      winter: "Winter",
    },
  },
});

/**
 * Fieldline Aerial's survey flight over the Wold, as the hero of its landing
 * page: the quilt below, the line over it.
 */
export function QuiltedFieldsDemo({
  chrome = true,
  // The flight is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bank, setBank] = React.useState(0);

  const flight = (
    <QuiltedFields bank={bank} onBankChange={setBank} {...values}>
      <div
        className="@container flex size-full flex-col p-4"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--background) 62%, transparent), transparent 60%)",
        }}
      >
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Fieldline Aerial · Survey 14
        </p>
        <p
          className="mt-1 max-w-[16ch] font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.125rem, 4.4cqw, 1.875rem)",
            lineHeight: 1.08,
          }}
        >
          Every field, stitched in.
        </p>
      </div>
    </QuiltedFields>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {flight}
      </div>
    );
  }

  const season = values.season ?? tweaks.season.default;
  const altitude = values.altitude ?? tweaks.altitude.default;
  const metres = Math.round((40 + 360 * Math.pow(altitude, 1.3)) / 10) * 10;
  const where =
    bank === 0
      ? "wings level"
      : `banking ${Math.abs(bank)}° ${bank > 0 ? "right" : "left"}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="w-full" style={{ height: 224 }}>
        {flight}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{season}</span> · {where} · {metres} m
      </p>
    </div>
  );
}
