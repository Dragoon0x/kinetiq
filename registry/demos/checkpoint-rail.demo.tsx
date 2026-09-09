"use client";

import * as React from "react";

import { CheckpointRail, type RailStep } from "@/registry/ui/checkpoint-rail";

/** Scout, Drafter and Checker on a Waylight release note; three good states. */
// prettier-ignore
const SCRIPT: Omit<RailStep, "id">[] = [
  { agent: "Scout", text: "Read merged branches since 2.3" },
  { agent: "Scout", text: "List closed tickets, 12 found" },
  { agent: "Scout", text: "Bundle 14 sources", checkpoint: "Sources gathered" },
  { agent: "Drafter", text: "Outline six sections" },
  { agent: "Drafter", text: "Write highlights, 310 words" },
  { agent: "Drafter", text: "Save release-note.md", checkpoint: "Draft written" },
  { agent: "Checker", text: "Verify 9 links" },
  { agent: "Checker", text: "Spell and style pass" },
  { agent: "Checker", text: "Sign off", checkpoint: "Links checked" },
  { agent: "Drafter", text: "Post the note to #releases" },
];

/** Ticks of 100ms between steps. */
const STEP_EVERY = 4;

/** Which steps are shown and the generation each was minted in, so a step
 *  re-run after a rewind gets a fresh key while kept steps keep theirs. */
type Run = { shown: number; gens: number[]; gen: number };
const FRESH: Run = { shown: 0, gens: [], gen: 0 };

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CheckpointRailDemo() {
  const [run, setRun] = React.useState<Run>(FRESH);
  const [playing, setPlaying] = React.useState(false);
  const [rewinds, setRewinds] = React.useState(0);
  const [last, setLast] = React.useState<{
    label: string;
    discarded: number;
    at: number;
  } | null>(null);

  // A hidden tab pauses the script; the run should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const complete = run.shown >= SCRIPT.length;
  const running = playing && !complete;

  React.useEffect(() => {
    if (!running || !visible) return;
    // The beat lives in the closure, so the append happens once per interval
    // tick and never inside a state updater that StrictMode may run twice.
    let beat = 0;
    const timer = window.setInterval(() => {
      beat += 1;
      if (beat % STEP_EVERY !== 0) return;
      setRun((r) =>
        r.shown >= SCRIPT.length
          ? r
          : {
              ...r,
              shown: r.shown + 1,
              gens: [...r.gens.slice(0, r.shown), r.gen],
            },
      );
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const steps: RailStep[] = SCRIPT.slice(0, run.shown).map((step, index) => ({
    ...step,
    id: `${index}-${run.gens[index] ?? 0}`,
  }));

  const rewind = (stepId: string, discarded: number) => {
    const index = steps.findIndex((step) => step.id === stepId);
    if (index < 0) return;
    const target = steps[index];
    setRun((r) => ({
      shown: index + 1,
      gens: r.gens.slice(0, index + 1),
      gen: r.gen + 1,
    }));
    setRewinds((n) => n + 1);
    setLast({ label: target?.checkpoint ?? "", discarded, at: index + 1 });
  };

  const checkpoints = steps.filter((step) => step.checkpoint).length;
  const line =
    !playing && run.shown === 0
      ? "Idle · press play"
      : last && run.shown === last.at
        ? `Rewound · ${last.label} · ${last.discarded} discarded`
        : complete
          ? `Complete · ${steps.length} steps · ${checkpoints} checkpoints · ${rewinds} ${rewinds === 1 ? "rewind" : "rewinds"}`
          : `Running · ${steps.length} steps · ${checkpoints} checkpoints`;

  const reset = () => {
    setPlaying(false);
    setRun(FRESH);
    setRewinds(0);
    setLast(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CheckpointRail
        label="Release note run"
        steps={steps}
        onRewind={rewind}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setPlaying(true);
          }}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {playing || run.shown > 0 ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          disabled={run.shown === 0}
          onClick={reset}
          className={`${button} border-hairline-strong text-foreground hover:bg-accent`}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
