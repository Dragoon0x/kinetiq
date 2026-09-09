"use client";

import * as React from "react";

import { GenerateProgress } from "@/registry/ui/generate-progress";

/** Fernworks Model 3 writing a shift brief for Fieldline, in three stages. */
const STAGES = [
  { id: "understand", label: "Understanding", note: "Reading 4 files" },
  { id: "draft", label: "Drafting", note: "Writing 3 sections" },
  { id: "refine", label: "Refining", note: "Tightening the wording" },
];

/** Stage lengths in ms; drafting is the visibly slow one. */
const LENGTHS = [1400, 2600, 1600];
const END = LENGTHS.reduce((sum, length) => sum + length, 0);
const TICK = 40;

export function GenerateProgressDemo() {
  const [clock, setClock] = React.useState(0);
  const [started, setStarted] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);

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
    // A hidden tab holds the run where it is and resumes on return.
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

  // Map the clock onto a stage and its fraction.
  let stage = started ? STAGES.length : -1;
  let progress = 0;
  if (started) {
    let left = clock;
    for (let index = 0; index < LENGTHS.length; index += 1) {
      const length = LENGTHS[index] ?? 1;
      if (left < length) {
        stage = index;
        progress = left / length;
        break;
      }
      left -= length;
    }
  }
  const done = started && stage >= STAGES.length;
  const current = STAGES[stage];

  const generate = () => {
    setClock(0);
    setStarted(true);
    setPlaying(true);
  };

  const line = done
    ? ["Done ·", `${STAGES.length} stages`, ""]
    : current
      ? [
          `${current.label} ·`,
          `stage ${stage + 1} of ${STAGES.length}`,
          `· ${Math.round(progress * 100)}%`,
        ]
      : ["Press generate ·", `${STAGES.length} stages`, ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GenerateProgress
        label="Shift brief · Fernworks Model 3"
        stages={STAGES}
        stage={stage}
        progress={progress}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {started ? "Generate again" : "Generate"}
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
