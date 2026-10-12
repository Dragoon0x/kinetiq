"use client";

import * as React from "react";

import { Activity, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultHeartbeatJobs,
  defaultHeartbeatNow,
  defaultHeartbeatPaused,
  HeartbeatLedger,
  type HeartbeatJob,
  type HeartbeatStatus,
  readHeartbeat,
  summariseHeartbeats,
} from "@/registry/ui/heartbeat-ledger";

export const tweaks = defineTweaks({
  strip: {
    kind: "choice",
    label: "Strip",
    default: "ticks",
    options: ["ticks", "dots", "bars"],
    names: { ticks: "Ticks", dots: "Dots", bars: "Bars" },
  },
  windowHours: {
    kind: "range",
    label: "Window",
    default: 24,
    min: 6,
    max: 72,
    step: 6,
    unit: "h",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const MIN = 60_000;
const ORDER = { missing: 0, late: 1, healthy: 2, paused: 3 } as const;

/**
 * Fieldline's nightly jobs the morning after: the invoice batch is late and
 * the roster export has gone quiet. Each Beat moves the clock five minutes
 * and has the most overdue job report in.
 */
export function HeartbeatLedgerDemo({
  chrome = true,
  // The ledger is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [jobs, setJobs] = React.useState<HeartbeatJob[]>(defaultHeartbeatJobs);
  const [now, setNow] = React.useState(defaultHeartbeatNow);
  const [paused, setPaused] = React.useState<string[]>(defaultHeartbeatPaused);
  const [status, setStatus] = React.useState<HeartbeatStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [beats, setBeats] = React.useState(0);
  const [lastReport, setLastReport] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const beat = () => {
    const next = now + 5 * MIN;
    // The job most in need reports first: missing, then late, then the rest.
    const target = [...jobs]
      .filter((job) => !paused.includes(job.id))
      .map((job) => readHeartbeat(job, next))
      .sort((a, b) => ORDER[a.state] - ORDER[b.state])[0]?.job;
    setNow(next);
    if (!target) return;
    const took =
      (target.beats[target.beats.length - 1]?.durationMs ?? 30_000) *
      (0.9 + (beats % 5) * 0.05);
    setJobs((list) =>
      list.map((job) =>
        job.id === target.id
          ? {
              ...job,
              beats: [...job.beats, { at: next, durationMs: Math.round(took) }],
            }
          : job,
      ),
    );
    setBeats((n) => n + 1);
    setLastReport(target.name);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setJobs(defaultHeartbeatJobs);
    setNow(defaultHeartbeatNow);
    setPaused(defaultHeartbeatPaused);
    setStatus("ready");
    setFailNext(false);
    setBeats(0);
    setLastReport(null);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <HeartbeatLedger height={540} {...values} />
      </div>
    );
  }

  const summary = summariseHeartbeats(jobs, now, paused);
  const buttonClass =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <HeartbeatLedger
        jobs={jobs}
        now={now}
        paused={paused}
        onPauseChange={setPaused}
        status={status}
        onRetry={reload}
        height={520}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {summary.healthy} healthy · {summary.late} late · {summary.missing}{" "}
            missing
          </span>
          {lastReport
            ? ` · ${lastReport} reported`
            : ` · ${beats} ${beats === 1 ? "beat" : "beats"} added`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={beat}
            aria-disabled={status !== "ready" || undefined}
            className={buttonClass}
          >
            <Activity aria-hidden className="size-3.5" />
            Beat
          </button>
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={failNext}
              onChange={(event) => setFailNext(event.target.checked)}
              className="size-3.5 accent-(--accent)"
            />
            Fail next load
          </label>
          <button type="button" onClick={reload} className={buttonClass}>
            Reload
          </button>
          <button type="button" onClick={reset} className={buttonClass}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
