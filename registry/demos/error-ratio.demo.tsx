"use client";

import * as React from "react";

import {
  ErrorRatio,
  type RatioLevel,
  type RatioSide,
} from "@/registry/ui/error-ratio";

const TICK_MS = 1600;

/** One seeded window of Coldbrook's ledger-api: four calm minutes, a gate that
 *  starts refusing holds, then a recovery. Nothing here reads a clock. */
const FIRST = { good: 4512, bad: 14 };

const SCRIPT: { good: number; bad: number }[] = [
  FIRST,
  { good: 4488, bad: 12 },
  { good: 4530, bad: 19 },
  { good: 4471, bad: 15 },
  { good: 4402, bad: 96 },
  { good: 4180, bad: 286 },
  { good: 4098, bad: 341 },
  { good: 4260, bad: 128 },
  { good: 4440, bad: 41 },
  { good: 4501, bad: 13 },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function ErrorRatioDemo() {
  const [index, setIndex] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [held, setHeld] = React.useState<RatioSide | null>(null);
  const [level, setLevel] = React.useState<RatioLevel>("steady");

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next >= SCRIPT.length) {
          setRunning(false);
          return current;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const windowData = SCRIPT[index] ?? FIRST;
  const total = windowData.good + windowData.bad;
  const percent = ((windowData.bad / total) * 100).toFixed(2);
  const atEnd = index === SCRIPT.length - 1;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ErrorRatio
        good={windowData.good}
        bad={windowData.bad}
        label="ledger-api requests"
        windowLabel="last 60 s"
        held={held}
        onHeldChange={setHeld}
        onLevelChange={setLevel}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            if (atEnd) setIndex(0);
            setRunning((was) => !was);
          }}
        >
          {running ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={running || atEnd}
          onClick={() => setIndex((current) => current + 1)}
        >
          Step
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={index === 0 && !running}
          onClick={() => {
            setRunning(false);
            setIndex(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Window {index + 1} of {SCRIPT.length} ·{" "}
        <span className="text-signal tabular-nums">{percent}%</span> · {level}
        {held ? ` · held on ${held}` : ""}
      </p>
    </div>
  );
}
