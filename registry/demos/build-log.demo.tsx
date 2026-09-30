"use client";

import * as React from "react";

import {
  BuildLog,
  type BuildReading,
  type BuildStep,
  type StepStatus,
} from "@/registry/ui/build-log";

/** Basinworks / dock-worker, build 812 — a seeded script of log lines. */
const NAMES = ["Fetch", "Install", "Compile", "Test", "Pack"] as const;
const SECONDS = [3, 26, 18, 41, 7] as const;

type Entry = [step: number, text: string, level?: "warn" | "error"];

const SCRIPT: Entry[] = [
  [0, "cloning dock-worker at f30d71b"],
  [0, "3 files changed since the last build"],
  [1, "resolving 214 packages"],
  [1, "reusing 198 from the yard cache"],
  [1, "linking 16 packages"],
  [2, "type-checking 84 files"],
  [2, "emitting to build/dock"],
  [2, "0 errors"],
  [3, "holds_spec: 34 checks"],
  [3, "queue_spec: retried a flaky check", "warn"],
  [3, "ledger_spec: 21 checks"],
  [4, "packing 2.14.0"],
  [4, "wrote dock-worker-2.14.0.tar"],
];

const FAIL_TAIL: Entry[] = [
  [3, "holds_spec: 2 of 34 checks failed", "error"],
  [3, "the ledger closed before the run", "error"],
];

const toSteps = (
  seen: Entry[],
  done: boolean,
  failing: boolean,
): BuildStep[] => {
  const reached = seen[seen.length - 1]?.[0] ?? -1;
  return NAMES.map((name, index) => {
    const lines = seen
      .filter((entry) => entry[0] === index)
      .map((entry, place) => ({
        id: `${index}-${place}`,
        text: entry[1],
        level: entry[2],
      }));
    const empty = lines.length === 0;
    // A step is done once the script has moved past it; the run's last step
    // carries the verdict.
    const status: StepStatus = empty
      ? "waiting"
      : index < reached
        ? "passed"
        : done
          ? failing
            ? "failed"
            : "passed"
          : "running";
    const full = SECONDS[index] ?? 0;
    const running = status === "running";
    return {
      id: name.toLowerCase(),
      name,
      status,
      seconds: empty ? undefined : running ? Math.round(full * 0.6) : full,
      lines,
    };
  });
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BuildLogDemo() {
  const [failing, setFailing] = React.useState(false);
  const [seen, setSeen] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [reading, setReading] = React.useState<BuildReading | null>(null);

  // A hidden tab throttles timers, so the build holds where it is rather than
  // printing ten lines the moment it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const script = failing
    ? [...SCRIPT.filter((entry) => entry[0] <= 3), ...FAIL_TAIL]
    : SCRIPT;
  const done = seen >= script.length;

  React.useEffect(() => {
    if (!playing || hidden || done) return;
    const timer = window.setTimeout(() => setSeen((n) => n + 1), 520);
    return () => window.clearTimeout(timer);
  }, [playing, hidden, done]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BuildLog
        label="dock-worker · build 812"
        steps={toSteps(script.slice(0, seen), done, failing)}
        onBuildChange={setReading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!playing && done) setSeen(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : done ? "Run again" : "Run build"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={seen > 0 && !done}
          onClick={() => {
            setFailing(!failing);
            setSeen(0);
            setPlaying(false);
          }}
        >
          {failing ? "Clean run" : "Fail in Test"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {reading ? `Step ${reading.index} of ${NAMES.length}` : "—"}
        </span>
        {reading
          ? ` · ${reading.phase} · ${seen} lines · ${reading.seconds} s`
          : ""}
      </p>
    </div>
  );
}
