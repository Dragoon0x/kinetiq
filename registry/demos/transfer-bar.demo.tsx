"use client";

import * as React from "react";

import { TransferBar } from "@/registry/ui/transfer-bar";

const FILES = [
  { id: "survey", label: "site-survey-04.tiff", total: 18_400_000 },
  { id: "plan", label: "fernworks-canopy-plan.pdf", total: 6_200_000 },
  { id: "ridge", label: "ridge-scan.zip", total: 41_900_000 },
];

/** This upload drops its connection the first time it is tried. */
const FLAKY_ID = "plan";
/** A queued file shows an idle bar rather than inventing a fourth status. */
const BAR_STATUS = {
  queued: "active",
  active: "active",
  done: "done",
  error: "error",
} as const;
const TICK_MS = 90;
const TICKS_PER_FILE = 34;

type Job = (typeof FILES)[number] & {
  done: number;
  status: keyof typeof BAR_STATUS;
  tries: number;
};

const START: Job[] = FILES.map((file) => ({
  ...file,
  done: 0,
  status: "queued",
  tries: 0,
}));

/** One slice of the queue: start the next file, or advance the current one. */
function advance(jobs: Job[]): Job[] {
  const active = jobs.find((job) => job.status === "active");
  if (!active) {
    const queued = jobs.find((job) => job.status === "queued");
    if (!queued) return jobs;
    return jobs.map((job) =>
      job === queued ? { ...job, status: "active" as const } : job,
    );
  }
  const done = Math.min(
    active.total,
    active.done + active.total / TICKS_PER_FILE,
  );
  const drops =
    active.id === FLAKY_ID && active.tries === 0 && done > active.total * 0.62;
  const status = drops ? "error" : done >= active.total ? "done" : "active";
  return jobs.map((job) => (job === active ? { ...job, done, status } : job));
}

export function TransferBarDemo() {
  const [jobs, setJobs] = React.useState<Job[]>(START);
  const [started, setStarted] = React.useState(false);

  const stalled = jobs.some((job) => job.status === "error");
  // The queue holds while one upload is stopped, so the clock stops with it.
  const pending =
    started && !stalled && jobs.some((job) => job.status !== "done");

  React.useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setJobs(advance), TICK_MS);
    return () => window.clearInterval(timer);
  }, [pending]);

  const retry = (id: string) =>
    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? { ...job, status: "active" as const, tries: job.tries + 1 }
          : job,
      ),
    );

  const doneCount = jobs.filter((job) => job.status === "done").length;
  const state = !started
    ? "ready"
    : stalled
      ? "one stopped"
      : doneCount === jobs.length
        ? "all uploaded"
        : "uploading";

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {jobs.map((job) => (
        <TransferBar
          key={job.id}
          label={job.label}
          progress={job.done / job.total}
          status={BAR_STATUS[job.status]}
          bytes={{ done: job.done, total: job.total }}
          onRetry={() => retry(job.id)}
        />
      ))}

      <button
        type="button"
        onClick={() => {
          setJobs(START);
          setStarted(true);
        }}
        className="inline-flex h-9 w-fit items-center rounded-2 border border-input px-4 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {started ? "Restart upload" : "Start upload"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fernworks ·{" "}
        <span className="text-signal tabular-nums">{doneCount}</span> of{" "}
        {jobs.length} · {state}
      </p>
    </div>
  );
}
