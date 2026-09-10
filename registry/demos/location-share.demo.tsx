"use client";

import * as React from "react";

import { LocationShare } from "@/registry/ui/location-share";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

/** A seeded walk, in percentages of the map box. No clock, no randomness. */
const WALK = [
  8, 84, 16, 79, 24, 74, 33, 70, 41, 63, 48, 57, 55, 52, 62, 46, 70, 41, 76, 35,
  82, 29, 88, 24, 93, 18,
];

const POINTS = Array.from({ length: WALK.length / 2 }, (_, i) => ({
  x: (WALK[i * 2] ?? 0) / 100,
  y: (WALK[i * 2 + 1] ?? 0) / 100,
}));

const LEGS = [
  { at: 0, place: "Basin Quay" },
  { at: 4, place: "Fernworks Yard" },
  { at: 8, place: "Waylight Lane" },
  { at: 11, place: "Coldbrook Depot" },
];

const TOTAL = 900;
const STEP_SECONDS = 70;
const START_MINUTES = 14 * 60 + 5;

const timeOf = (minutes: number) => {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${hh}:${mm < 10 ? "0" : ""}${mm}`;
};

export function LocationShareDemo() {
  const [tick, setTick] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [stopped, setStopped] = React.useState(false);
  const [bonus, setBonus] = React.useState(0);

  const step = Math.min(tick, POINTS.length - 1);
  const elapsed = tick * STEP_SECONDS;
  const secondsLeft = Math.max(0, TOTAL + bonus - elapsed);
  const ended = stopped || secondsLeft === 0;
  const point = POINTS[step];
  const place =
    LEGS.filter((leg) => leg.at <= step).at(-1)?.place ?? "Basin Quay";

  React.useEffect(() => {
    if (!running || ended) return;
    const id = window.setInterval(() => {
      // A share that ran on while the tab was away would report a walk nobody
      // took, so the tick simply skips a hidden document.
      if (document.hidden) return;
      setTick((count) => count + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [running, ended]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ol role="list" className="flex flex-col gap-2">
        <li>
          <LocationShare
            person="Ines Aguiar"
            position={point ?? { x: 0.08, y: 0.84 }}
            trail={POINTS.slice(0, step + 1)}
            place={place}
            secondsLeft={secondsLeft}
            totalSeconds={TOTAL + bonus}
            status={ended ? "ended" : "live"}
            lastSeenTime={timeOf(START_MINUTES + Math.floor(elapsed / 60))}
            onStop={() => {
              setStopped(true);
              setRunning(false);
            }}
            onExtend={(seconds) => setBonus((held) => held + seconds)}
            label="Ines Aguiar is sharing a live location"
          />
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning(!running)}
          disabled={ended}
          className={chip}
        >
          {running ? "Pause" : "Walk"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTick(0);
            setRunning(false);
            setStopped(false);
            setBonus(0);
          }}
          disabled={tick === 0 && !stopped && bonus === 0}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ended ? "Ended · last seen " : `Live · ${place} · `}
        <span className="text-signal">
          {ended
            ? timeOf(START_MINUTES + Math.floor(elapsed / 60))
            : `${Math.ceil(secondsLeft / 60)} min left`}
        </span>
      </p>
    </div>
  );
}
