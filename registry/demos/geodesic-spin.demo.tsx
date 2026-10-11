"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GeodesicSpin } from "@/registry/ui/geodesic-spin";

export const tweaks = defineTweaks({
  frequency: {
    kind: "range",
    label: "Frequency",
    default: 2,
    min: 1,
    max: 4,
    step: 1,
  },
  inertia: {
    kind: "range",
    label: "Inertia",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  strut: {
    kind: "range",
    label: "Strut",
    default: 1.2,
    min: 0.5,
    max: 2.5,
    step: 0.1,
    unit: "px",
  },
});

/**
 * Fernworks sells garden domes as kits: the frame's frequency is the kit.
 * Spin the frame and the parts list follows it — a 4V dome is 480 struts.
 */
export function GeodesicSpinDemo({
  chrome = true,
  // The frame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const base = Math.round(values.frequency ?? 2);
  const [n, setN] = React.useState(base);

  const sphere = (
    <GeodesicSpin
      label="Dome frame"
      className="h-52 w-full"
      onFrequencyChange={(next) => setN(next)}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{sphere}</div>;

  const parts = [
    { name: "Faces", value: 20 * n * n },
    { name: "Struts", value: 30 * n * n },
    { name: "Hubs", value: 10 * n * n + 2 },
  ];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-card p-3">
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fernworks · Garden domes
            </p>
            <p className="text-sm font-medium text-foreground">
              Six-metre dome kit
            </p>
          </div>
          <p className="font-mono text-xs text-ink-2 tabular-nums">
            {n}V frame
          </p>
        </div>
        {sphere}
        <dl className="grid grid-cols-3 gap-2">
          {parts.map((part) => (
            <div
              key={part.name}
              className="flex flex-col gap-0.5 rounded-2 bg-surface-2 px-2.5 py-2"
            >
              <dt className="text-[11px] text-ink-3">{part.name}</dt>
              <dd className="font-mono text-sm text-foreground tabular-nums">
                {part.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {n}V · {20 * n * n} faces
        </span>
        {n > base ? " · split by the spin" : " · drag to spin"}
      </p>
    </div>
  );
}
