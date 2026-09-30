"use client";

import * as React from "react";

import {
  PipelineRail,
  type PipelineStage,
  type RailReading,
  type StageStatus,
} from "@/registry/ui/pipeline-rail";

/** Coldbrook / ledger-api, run 4471 — five stages on a seeded script. */
const NAMES = ["Fetch", "Build", "Test", "Pack", "Ship"] as const;
const SECONDS = [4, 22, 51, 9, 6] as const;
const NOTE =
  "Two checks failed in holds_spec: the ledger closed before the run.";

const statusOf = (mark: string | undefined): StageStatus =>
  mark === "p"
    ? "passed"
    : mark === "r"
      ? "running"
      : mark === "f"
        ? "failed"
        : "waiting";

type Frame = { marks: string; at?: number };

const START: Frame = { marks: "rwwww" };

const RUN: Frame[] = [
  START,
  { marks: "prwww", at: 0.6 },
  { marks: "pprww" },
  { marks: "ppfww" },
];

const RERUN: Frame[] = [
  { marks: "pprww" },
  { marks: "ppprw" },
  { marks: "ppppr", at: 0.5 },
  { marks: "ppppp" },
];

const build = (frame: Frame): PipelineStage[] =>
  NAMES.map((name, index) => {
    const status = statusOf(frame.marks[index]);
    const full = SECONDS[index] ?? 0;
    const running = status === "running";
    const landed = status === "passed" || status === "failed";
    return {
      id: name.toLowerCase(),
      name,
      status,
      seconds: landed
        ? full
        : running
          ? Math.round(full * (frame.at ?? 0.35))
          : undefined,
      progress: running ? frame.at : undefined,
      note: status === "failed" ? NOTE : undefined,
    };
  });

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PipelineRailDemo() {
  const [branch, setBranch] = React.useState<"run" | "rerun">("run");
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [reruns, setReruns] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState<RailReading | null>(null);

  // A hidden tab throttles timers, so the run holds where it is rather than
  // jumping several stages the moment it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const frames = branch === "run" ? RUN : RERUN;
  const last = frames.length - 1;
  const atEnd = step >= last;

  React.useEffect(() => {
    if (!playing || hidden || atEnd) return;
    const timer = window.setTimeout(
      () => setStep((current) => Math.min(last, current + 1)),
      1100,
    );
    return () => window.clearTimeout(timer);
  }, [playing, hidden, atEnd, last]);

  const stages = build(frames[Math.min(step, last)] ?? START);
  const shown = selected ?? reading?.stageId ?? null;
  const name = NAMES.find((one) => one.toLowerCase() === shown) ?? "—";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PipelineRail
        label="ledger-api · run 4471"
        stages={stages}
        onSelectedChange={setSelected}
        onRailChange={setReading}
        onRerun={() => {
          setBranch("rerun");
          setStep(0);
          setReruns((count) => count + 1);
          setPlaying(true);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!playing && atEnd) setStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause run" : atEnd ? "Replay run" : "Run"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={branch === "run" && step === 0 && reruns === 0}
          onClick={() => {
            setPlaying(false);
            setBranch("run");
            setStep(0);
            setReruns(0);
            setSelected(null);
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
          {reading ? `Stage ${reading.index} of ${NAMES.length}` : "—"}
        </span>
        {reading ? ` · ${name} · ${reading.phase} · ${reading.seconds} s` : ""}
        {reruns > 0 ? ` · ${reruns} ${reruns === 1 ? "rerun" : "reruns"}` : ""}
      </p>
    </div>
  );
}
