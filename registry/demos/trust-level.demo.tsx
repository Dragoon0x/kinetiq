"use client";

import * as React from "react";

import { TrustLevel, type TrustChange } from "@/registry/ui/trust-level";

const LABELS = ["new", "regular", "trusted", "guide"];
const TOP = LABELS.length - 1;
const STEP = 0.34;

const round2 = (value: number) => Math.round(value * 100) / 100;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TrustLevelDemo() {
  const [level, setLevel] = React.useState(1);
  const [progress, setProgress] = React.useState(0);
  const [reading, setReading] = React.useState(1);
  const [last, setLast] = React.useState<TrustChange | null>(null);

  const add = () => {
    const next = round2(progress + STEP);
    if (next < 1) {
      setProgress(next);
    } else if (level < TOP) {
      setLevel(level + 1);
      setProgress(0);
    } else {
      setProgress(1);
    }
  };

  const take = () => {
    if (progress > 0) {
      setProgress(Math.max(0, round2(progress - STEP)));
    } else if (level > 0) {
      setLevel(level - 1);
      setProgress(round2(1 - STEP));
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TrustLevel
        name="Ines Rocha"
        handle="ines"
        room="Coldbrook"
        level={level}
        progress={progress}
        onLevelChange={setLast}
        onShownLevelChange={setReading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          disabled={level === TOP && progress >= 1}
          className={chip}
        >
          Add trust
        </button>
        <button
          type="button"
          onClick={take}
          disabled={level === 0 && progress === 0}
          className={chip}
        >
          Take trust back
        </button>
        <button
          type="button"
          onClick={() => {
            setLevel(1);
            setProgress(0);
            setLast(null);
          }}
          disabled={level === 1 && progress === 0 && last === null}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Ines · level {level + 1} {LABELS[level] ?? ""} ·{" "}
        <span className="text-signal">
          {last?.direction === "down"
            ? "lost a level"
            : `reading ${LABELS[reading] ?? ""}`}
        </span>
      </p>
    </div>
  );
}
