"use client";

import * as React from "react";

import { RolloutWave, type RolloutReading } from "@/registry/ui/rollout-wave";

/** Waylight Pay / gate-relay 2.14.0 across 24 machines, in four waves. */
const WAVES = [0.1, 0.25, 0.5, 1];
const LAST = WAVES.length - 1;

const hostName = (index: number): string =>
  `${index < 12 ? "Coldbrook" : "Basinworks"} ${String(index + 1).padStart(2, "0")}`;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RolloutWaveDemo() {
  const [wave, setWave] = React.useState(-1);
  const [paused, setPaused] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [reading, setReading] = React.useState<RolloutReading | null>(null);

  // A hidden tab throttles timers, so the rollout holds where it is rather
  // than landing three waves the moment it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const atEnd = wave >= LAST;

  React.useEffect(() => {
    if (!playing || paused || hidden || atEnd) return;
    const timer = window.setTimeout(
      () => setWave((current) => Math.min(LAST, current + 1)),
      1400,
    );
    return () => window.clearTimeout(timer);
  }, [playing, paused, hidden, atEnd]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RolloutWave
        label="gate-relay"
        version="2.14.0"
        waves={WAVES}
        hosts={24}
        hostName={hostName}
        wave={wave}
        onWaveChange={(next) => {
          setWave(next);
          // Rolling back ends the run: the fleet should not start creeping
          // forward again a second after it was pulled off the build.
          if (next < 0) setPlaying(false);
        }}
        paused={paused}
        onPausedChange={setPaused}
        onRolloutChange={setReading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!playing && atEnd) setWave(-1);
            setPlaying(!playing);
          }}
        >
          {playing ? "Stop" : atEnd ? "Roll out again" : "Roll out"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={atEnd}
          onClick={() => setWave((current) => Math.min(LAST, current + 1))}
        >
          Land wave
        </button>
        <button
          type="button"
          className={chip}
          disabled={wave === -1 && !paused && !playing}
          onClick={() => {
            setPlaying(false);
            setPaused(false);
            setWave(-1);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {reading && reading.wave >= 0
            ? `Wave ${reading.wave + 1} of ${WAVES.length}`
            : "Baseline"}
        </span>
        {reading
          ? ` · ${Math.round(reading.share * 100)}% · ${reading.machines} of 24 machines · ${reading.phase}`
          : ""}
      </p>
    </div>
  );
}
