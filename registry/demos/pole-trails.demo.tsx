"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PoleTrails } from "@/registry/ui/pole-trails";

export const tweaks = defineTweaks({
  exposure: {
    kind: "range",
    label: "Exposure",
    default: 10,
    min: 2,
    max: 30,
    step: 1,
    unit: "min/s",
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  horizon: {
    kind: "choice",
    label: "Horizon",
    default: "ridge",
    options: ["ridge", "hills", "pines", "sea"],
    names: { ridge: "Ridge", hills: "Hills", pines: "Pines", sea: "Sea" },
  },
});

type Reading =
  | { kind: "exposing" }
  | { kind: "complete"; hours: number }
  | { kind: "fresh" }
  | { kind: "pole"; pole: [number, number] };

/**
 * Fieldline's dark-sky reserve: tonight's long exposure from the camera on
 * the north ridge, gathering while the page is open.
 */
export function PoleTrailsDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reading, setReading] = React.useState<Reading>({ kind: "exposing" });

  const frame = (
    <PoleTrails
      label="Night sky over the north ridge"
      onShutter={() => setReading({ kind: "fresh" })}
      onComplete={(hours) => setReading({ kind: "complete", hours })}
      onPoleChange={(pole) => setReading({ kind: "pole", pole })}
      className={cn("w-full rounded-3", chrome ? "h-56" : "h-52")}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{frame}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · dark-sky reserve
          </p>
          <p className="text-base font-medium text-foreground">
            Tonight from the north ridge
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] text-ink-3">
          f/2.8 · iso 800 · 14 mm
        </p>
      </div>
      {frame}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading.kind === "complete" ? (
          <>
            <span className="text-signal">exposure complete</span> ·{" "}
            {reading.hours}h of sky
          </>
        ) : reading.kind === "fresh" ? (
          <>
            <span className="text-signal">shutter closed</span> · a fresh
            exposure gathering
          </>
        ) : reading.kind === "pole" ? (
          <>
            <span className="text-signal">pole moved</span> ·{" "}
            {Math.round(reading.pole[0] * 100)}% across,{" "}
            {Math.round(reading.pole[1] * 100)}% down
          </>
        ) : (
          <>
            <span className="text-signal">exposing</span> · tap for a fresh
            frame, drag to move the pole
          </>
        )}
      </p>
    </div>
  );
}
