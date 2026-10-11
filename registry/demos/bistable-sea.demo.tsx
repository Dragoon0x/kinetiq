"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BistableSea } from "@/registry/ui/bistable-sea";

export const tweaks = defineTweaks({
  refresh: {
    kind: "range",
    label: "Refresh",
    default: 1,
    min: 0.25,
    max: 3,
    step: 0.25,
    unit: "Hz",
  },
  ghosting: {
    kind: "range",
    label: "Ghosting",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  swell: {
    kind: "range",
    label: "Swell",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/**
 * Basinworks Tide's harbour display: an e-paper panel that shows the swell
 * off the breakwater, a month on a charge.
 */
export function BistableSeaDemo({
  chrome = true,
  // The display is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bearing, setBearing] = React.useState(200);
  const [last, setLast] = React.useState<"partial" | "full" | null>(null);

  if (!chrome) {
    return (
      <div className="flex w-full justify-center">
        <BistableSea
          className="w-[17.5rem] max-w-full"
          value={bearing}
          onValueChange={setBearing}
          {...values}
        />
      </div>
    );
  }

  const facing = POINTS[Math.round(bearing / 22.5) % 16] ?? "N";

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 rounded-3 border border-hairline bg-card px-4 py-4">
        <BistableSea
          className="w-full max-w-[17.5rem]"
          label="Harbour swell display"
          value={bearing}
          onValueChange={setBearing}
          onRefresh={setLast}
          {...values}
        />
        <div className="flex max-w-[13rem] min-w-0 flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Tide
          </p>
          <p className="text-base leading-snug font-semibold text-foreground">
            Harbour Display, 6 in
          </p>
          <p className="text-sm leading-snug text-ink-2">
            The swell off the breakwater on paper that holds its picture without
            power. A month on a charge.
          </p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {last === "full" ? "full refresh" : "partial refresh"}
        </span>
        {last === "full"
          ? " · ghosts cleared"
          : ` · facing ${facing} ${bearing}° · drag or use the arrow keys`}
      </p>
    </div>
  );
}
