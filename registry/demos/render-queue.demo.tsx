"use client";

import * as React from "react";

import { RenderQueue } from "@/registry/ui/render-queue";

/** Where the job stands as the seeded clock runs, in ms. */
const FIRST = { at: 0, position: 3, estimate: 48 };
const STEPS = [
  FIRST,
  { at: 1400, position: 2, estimate: 31 },
  { at: 2900, position: 1, estimate: 14 },
];
const START = 4200;
const RENDER_MS = 2600;
const END = START + RENDER_MS;
const TICK = 40;

/** A smoothstep is polynomial, so it paints alike on both sides. */
const ease = (t: number) => Math.round(t * t * (3 - 2 * t) * 1000) / 1000;
const ORDINALS = ["", "1st", "2nd", "3rd"];

export function RenderQueueDemo() {
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [left, setLeft] = React.useState(false);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = clock + TICK;
        setClock(next);
        if (next >= END) setPlaying(false);
      }, TICK);
    };
    // A hidden tab holds the queue where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, clock]);

  let step = FIRST;
  for (const candidate of STEPS) if (candidate.at <= clock) step = candidate;
  const rendering = clock >= START;
  const position = rendering ? 0 : step.position;
  // The estimate ticks down a second at a time between places in line.
  const estimate = rendering
    ? 0
    : Math.max(1, step.estimate - Math.floor((clock - step.at) / 1000));
  const progress = rendering
    ? ease(Math.min(1, (clock - START) / RENDER_MS))
    : 0;
  const done = clock >= END;

  const queue = () => {
    setClock(0);
    setLeft(false);
    setStarted(true);
    setPlaying(true);
  };

  const leave = () => {
    setPlaying(false);
    setLeft(true);
  };

  const line = left
    ? ["Left the queue", "", ""]
    : done
      ? ["Done ·", "rendered", ""]
      : rendering
        ? ["Rendering ·", `${Math.round(progress * 100)}%`, ""]
        : started
          ? [
              "Waiting ·",
              ORDINALS[position] ?? `${position}th`,
              `· about ${estimate} s`,
            ]
          : ["Press queue", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {left ? (
        <div className="flex items-center rounded-3 border border-dashed border-hairline-strong px-3 py-4 text-sm text-ink-3">
          Left the queue
        </div>
      ) : (
        <RenderQueue
          label="Render job"
          title="Poster render"
          model="Fernworks Model 3"
          position={position}
          estimateSeconds={estimate}
          progress={progress}
          done={done}
          onCancel={leave}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={queue}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {started ? "Queue again" : "Queue"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
