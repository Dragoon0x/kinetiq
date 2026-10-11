"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultDrumSeries, DrumPlotter } from "@/registry/ui/drum-plotter";

export const tweaks = defineTweaks({
  paperSpeed: {
    kind: "range",
    label: "Speed",
    default: 36,
    min: 12,
    max: 96,
    step: 4,
    unit: "px/s",
  },
  inkColor: {
    kind: "choice",
    label: "Ink",
    default: "red",
    options: ["red", "blue", "green", "violet"],
    names: { red: "Red", blue: "Blue", green: "Green", violet: "Violet" },
  },
  gridStyle: {
    kind: "choice",
    label: "Paper",
    default: "graph",
    options: ["graph", "ruled", "dots", "plain"],
    names: { graph: "Graph", ruled: "Ruled", dots: "Dots", plain: "Plain" },
  },
});

/**
 * Gaugeworks cold store B: temperature, humidity and compressor vibration,
 * four readings a second, on one recorder that changes pens between them.
 */
export function DrumPlotterDemo({
  chrome = true,
  // The recorder is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [series, setSeries] = React.useState("temp");
  const current = defaultDrumSeries.find((s) => s.id === series);
  const index = defaultDrumSeries.findIndex((s) => s.id === series);
  const ink = values.inkColor ?? tweaks.inkColor.default;
  const rack = tweaks.inkColor.options;
  const inkName = rack[(rack.indexOf(ink) + Math.max(0, index)) % rack.length];

  const recorder = (
    <DrumPlotter
      value={series}
      onValueChange={setSeries}
      label="Gaugeworks cold store B"
      className="h-full"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 216 }}>
        {recorder}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · cold store B
        </p>
        <p className="text-sm font-medium text-foreground">
          Live, four readings a second
        </p>
      </div>
      <div className="w-full" style={{ height: 220 }}>
        {recorder}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          plotting {(current?.label ?? "").toLowerCase()}
        </span>{" "}
        · {inkName} ink · {values.paperSpeed ?? tweaks.paperSpeed.default} px/s
      </p>
    </div>
  );
}
