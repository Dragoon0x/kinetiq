"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultHeartbeatNow,
  defaultHeartbeatPlans,
  HeartbeatLedger,
  heartbeatJobAt,
  type HeartbeatStatus,
} from "@/registry/ui/heartbeat-ledger";

export const tweaks = defineTweaks({
  stripLength: {
    kind: "range",
    label: "Beats",
    default: 24,
    min: 12,
    max: 36,
    step: 4,
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--signal)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--signal)": "Mint",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** One real second is two minutes of the night. */
const STEP_MS = 2 * 60_000;
const START_PAUSED = ["cert-check"];

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * Fernworks' night shift, replayed at two minutes a second: the invoice
 * export ticks every quarter hour, the ledger close comes in late at 02:11
 * after its grace ring runs most of the way down, and the backup snapshot
 * never checks in, so its row tips into the warning tint. The clock only runs
 * while the ledger is on screen and the page is visible.
 */
export function HeartbeatLedgerDemo({
  chrome = true,
  // The ledger is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);
  const [now, setNow] = React.useState(defaultHeartbeatNow);
  const [running, setRunning] = React.useState(true);
  const [status, setStatus] = React.useState<HeartbeatStatus>("ready");
  const [empty, setEmpty] = React.useState(false);
  const [paused, setPaused] = React.useState<string[]>(START_PAUSED);
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!inView || !running || status !== "ready") return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setNow((t) => t + STEP_MS);
    }, 1000);
    return () => window.clearInterval(id);
  }, [inView, running, status]);

  const jobs = React.useMemo(
    () =>
      empty ? [] : defaultHeartbeatPlans.map((p) => heartbeatJobAt(p, now)),
    [empty, now],
  );

  const ledger = (
    <HeartbeatLedger
      jobs={jobs}
      now={now}
      paused={paused}
      onPause={(job, isPaused) => {
        setPaused((ids) =>
          isPaused ? [...ids, job.id] : ids.filter((id) => id !== job.id),
        );
        setNote(`${isPaused ? "paused" : "resumed"} · ${job.name}`);
      }}
      onMute={(job, isMuted) =>
        setNote(`${isMuted ? "muted" : "unmuted"} · ${job.name}`)
      }
      onOpenRun={(job, beat) =>
        setNote(
          beat
            ? `opened run · ${job.name} ${clock(beat.at)}`
            : `${job.name} · no runs yet`,
        )
      }
      status={status}
      onRetry={() => setStatus("ready")}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={rootRef} className="w-full">
        {ledger}
      </div>
    );
  }

  const due = jobs.filter((j) => {
    const last = j.lastCheckIn ?? 0;
    return !paused.includes(j.id) && now >= last + j.every;
  });
  const missed = due.filter(
    (j) => now > (j.lastCheckIn ?? 0) + j.every + j.grace,
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={rootRef} className="flex w-full max-w-3xl flex-col gap-4">
      {ledger}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!running}
          onClick={() => setRunning((v) => !v)}
          className={button}
        >
          {running ? "Pause clock" : "Run clock"}
        </button>
        <button
          type="button"
          aria-pressed={status === "error"}
          onClick={() => setStatus((s) => (s === "error" ? "ready" : "error"))}
          className={cn(
            button,
            status === "error" &&
              "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail fetch
        </button>
        <button
          type="button"
          aria-pressed={empty}
          onClick={() => setEmpty((v) => !v)}
          className={button}
        >
          No jobs
        </button>
        <button
          type="button"
          onClick={() => {
            setNow(defaultHeartbeatNow);
            setRunning(true);
            setStatus("ready");
            setEmpty(false);
            setPaused(START_PAUSED);
            setNote(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "error" ? (
          <>
            <span className="text-signal">fetch failed</span> · retry to load
            check-ins
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">{clock(now)} utc</span> ·{" "}
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} ·{" "}
            {due.length - missed.length} due · {missed.length} missed
          </>
        )}
      </p>
    </div>
  );
}
