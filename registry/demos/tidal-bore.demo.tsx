"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TidalBore } from "@/registry/ui/tidal-bore";

export const tweaks = defineTweaks({
  height: {
    kind: "range",
    label: "Height",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  interval: {
    kind: "range",
    label: "Interval",
    default: 9,
    min: 4,
    max: 20,
    step: 1,
    unit: "s",
  },
});

/**
 * Coldbrook's estuary evenings: the bore runs upriver behind the booking
 * line, the pointer sets how tall it stands and a click sends the next one.
 */
export function TidalBoreDemo({
  chrome = true,
  // The river is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bores, setBores] = React.useState(1);
  const [height, setHeight] = React.useState<number | null>(null);
  const shown = height ?? values.height ?? 0.6;

  const river = (
    <TidalBore
      onBore={setBores}
      onHeightChange={setHeight}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="pointer-events-none flex size-full items-end p-3 sm:p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook · estuary evenings
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Ride the evening bore.
          </p>
        </div>
      </div>
    </TidalBore>
  );

  if (!chrome) return <div className="flex w-full">{river}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {river}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">bore {bores}</span> · height{" "}
        {shown.toFixed(2)} · every {values.interval ?? 9} s
      </p>
    </div>
  );
}
