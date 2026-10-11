"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  GraphHorizon,
  defaultGraphHorizonSeries,
} from "@/registry/ui/graph-horizon";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
    unit: "/s",
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 22,
    min: 10,
    max: 40,
    step: 2,
    unit: "°",
  },
  inkColor: {
    kind: "choice",
    label: "Ink",
    default: "blue",
    options: ["blue", "green", "sepia", "graphite"],
    names: {
      blue: "Blue",
      green: "Green",
      sepia: "Sepia",
      graphite: "Graphite",
    },
  },
});

/**
 * Gaugeworks' weekly numbers on a strip of graph paper: sessions, sign-ups
 * and churn, plotted as the paper rolls in from the horizon.
 */
export function GraphHorizonDemo({
  chrome = true,
  // The chart is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [playing, setPlaying] = React.useState(true);
  const [sample, setSample] = React.useState(6);
  const series = defaultGraphHorizonSeries;
  const sessions = series[0]?.values[sample];

  const chart = (
    <GraphHorizon
      series={series}
      playing={playing}
      onPlayingChange={setPlaying}
      onSampleChange={setSample}
      label="Gaugeworks weekly product metrics"
      className="h-full w-full"
      {...values}
    >
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · weekly
      </p>
      <p className="text-sm font-medium text-foreground">Plotted as it comes</p>
    </GraphHorizon>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {chart}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · product metrics
        </p>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-background px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {playing ? "Pause" : "Roll"}
        </button>
      </div>
      <div className="w-full" style={{ height: 248 }}>
        {chart}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{playing ? "rolling" : "paused"}</span> ·
        W{sample + 1}
        {sessions === undefined ? "" : ` · sessions ${sessions.toFixed(1)}k`}
      </p>
    </div>
  );
}
