"use client";

import * as React from "react";

import { Play, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { ErrandToasts, type ErrandTask } from "@/registry/ui/errand-toasts";

export const tweaks = defineTweaks({
  corner: {
    kind: "choice",
    label: "Corner",
    default: "bottom-right",
    options: ["bottom-right", "bottom-left", "top-right", "top-center"],
    names: {
      "bottom-right": "Bottom R",
      "bottom-left": "Bottom L",
      "top-right": "Top R",
      "top-center": "Top",
    },
  },
  borderStyle: {
    kind: "choice",
    label: "Border",
    default: "line",
    options: ["line", "band", "dotted"],
    names: { line: "Line", band: "Band", dotted: "Dotted" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** Two errands that finished before the page opened: they fold into a count. */
const EARLIER: ErrandTask[] = [
  {
    id: "backup",
    kind: "backup",
    title: "Backing up readings",
    state: "done",
    progress: 1,
    result: {
      title: "Nightly backup finished",
      detail: "2.1 GB · kept for 30 days",
      action: { id: "view", label: "View" },
    },
  },
  {
    id: "sync",
    kind: "sync",
    title: "Syncing calibration",
    state: "done",
    progress: 1,
    result: {
      title: "Calibration synced",
      detail: "60 sensors · Harbour line",
      action: { id: "view", label: "View" },
    },
  },
];

type Job = {
  id: string;
  /** When it starts, in ticks of 100ms. */
  at: number;
  /** Ticks of unknown progress before it can measure itself. */
  unknownFor?: number;
  /** Progress per tick. */
  rate: number;
  /** Fails here on its first run. */
  failAt?: number;
  base: ErrandTask;
  done: ErrandTask["result"];
  detail: (p: number) => string;
};

const JOBS: Job[] = [
  {
    id: "readings",
    at: 12,
    rate: 0.026,
    base: {
      id: "readings",
      kind: "export",
      title: "Exporting readings",
      state: "running",
      progress: 0,
    },
    done: {
      title: "Readings exported",
      detail: "gaugeworks-readings-7d.csv · 50.2 MB",
      action: { id: "open", label: "Open" },
    },
    detail: (p) =>
      `${Math.round(p * 50)} of 50 MB · about ${Math.max(1, Math.round((1 - p) * 4))} s left`,
  },
  {
    id: "photos",
    at: 5,
    rate: 0.034,
    failAt: 0.62,
    base: {
      id: "photos",
      kind: "upload",
      title: "Uploading site photos",
      state: "running",
      progress: 0,
    },
    done: {
      title: "18 photos uploaded",
      detail: "Pier 4 · added to the site log",
      action: { id: "view", label: "View" },
    },
    detail: (p) => `Pier 4 · ${Math.round(p * 18)} of 18 photos`,
  },
  {
    id: "sensors",
    at: 0,
    unknownFor: 14,
    rate: 0.04,
    base: {
      id: "sensors",
      kind: "import",
      title: "Importing sensors.csv",
      state: "running",
      progress: null,
      detail: "Reading the file",
    },
    done: {
      title: "412 sensors imported",
      detail: "3 skipped as duplicates",
      action: { id: "view", label: "View" },
    },
    detail: (p) => `${Math.round(p * 412)} of 412 sensors`,
  },
];

type Run = { t: number; started: number; failed: boolean; retried: boolean };

/**
 * A Gaugeworks console where three errands run at once: a readings export
 * that finishes with Open, a photo upload that drops at 62% until Retry, and
 * a sensor import that cannot measure itself at first. The script runs only
 * while the demo is in view.
 */
export function ErrandToastsDemo({
  chrome = true,
  // The toasts are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [tick, setTick] = React.useState(-1);
  const [runs, setRuns] = React.useState<Record<string, Run>>({});
  const [extra, setExtra] = React.useState<ErrandTask[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (!root) return;
    const io = new IntersectionObserver((e) =>
      setInView(e.some((x) => x.isIntersecting)),
    );
    io.observe(root);
    return () => io.disconnect();
  }, [root]);

  // One clock for the whole script, running only in view.
  React.useEffect(() => {
    if (!inView) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 100);
    return () => window.clearInterval(id);
  }, [inView]);

  const tasks: ErrandTask[] = [...EARLIER];
  let running = 0;
  // In the order they started: the newest is drawn on top.
  for (const job of [...JOBS].sort((a, b) => a.at - b.at)) {
    const run = runs[job.id];
    const startedAt = run?.started ?? job.at;
    if (tick < startedAt) continue;
    const elapsed = tick - startedAt;
    const unknown =
      !run?.retried && job.unknownFor !== undefined && elapsed < job.unknownFor;
    const measured = elapsed - (run?.retried ? 0 : (job.unknownFor ?? 0));
    const p = unknown ? null : Math.min(1, Math.max(0, measured * job.rate));
    const fails =
      job.failAt !== undefined &&
      !run?.retried &&
      p !== null &&
      p >= job.failAt;
    if (fails) {
      tasks.push({
        ...job.base,
        state: "failed",
        progress: job.failAt,
        detail: job.detail(job.failAt ?? 0),
        error: "The connection dropped at 62%.",
      });
    } else if (p !== null && p >= 1) {
      tasks.push({ ...job.base, state: "done", progress: 1, result: job.done });
    } else {
      running += 1;
      tasks.push({
        ...job.base,
        progress: p,
        detail: p === null ? job.base.detail : job.detail(p),
      });
    }
  }
  tasks.push(
    ...extra.map((x) => {
      const startedAt = runs[x.id]?.started ?? 0;
      const p = Math.min(1, Math.max(0, (tick - startedAt) * 0.05));
      return p >= 1
        ? {
            ...x,
            state: "done" as const,
            progress: 1,
            result: {
              title: "Readings exported",
              detail: "gaugeworks-readings-24h.csv · 7.2 MB",
              action: { id: "open", label: "Open" },
            },
          }
        : {
            ...x,
            progress: p,
            detail: `${Math.round(p * 7.2 * 10) / 10} of 7.2 MB`,
          };
    }),
  );

  const export1 = tasks.find((t) => t.id === "readings");
  const photos = tasks.find((t) => t.id === "photos");
  const started = tasks.length > EARLIER.length;
  const line = note
    ? note
    : photos?.state === "failed"
      ? "upload failed · retry"
      : export1?.state === "done"
        ? "export ready · open"
        : export1?.state === "running"
          ? `${running} running · export ${Math.round((export1.progress ?? 0) * 100)}%`
          : started
            ? `${running} running`
            : "waiting to start";

  const toasts = (
    <ErrandToasts
      key={round}
      tasks={tasks}
      max={chrome ? 3 : 2}
      doneTimeout={chrome ? 12000 : 0}
      onAction={(id, action) => setNote(`${action} · ${id}`)}
      onRetry={(id) => {
        setNote(null);
        setRuns((r) => ({
          ...r,
          [id]: { t: tick, started: tick, failed: false, retried: true },
        }));
      }}
      onDismiss={(id) => setNote(`dismissed ${id}`)}
      {...values}
    />
  );

  const frame = (
    <div
      ref={setRoot}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-card",
        chrome ? "h-[300px]" : "h-[208px]",
      )}
    >
      <div
        aria-hidden
        className="flex h-10 items-center justify-between gap-3 border-b border-hairline px-4"
      >
        <span className="truncate text-[13px] font-semibold">
          Gaugeworks · Harbour line
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3">
          60 sensors
        </span>
      </div>
      <div aria-hidden className="flex flex-col opacity-55">
        {[
          "Pier 4 gauge",
          "North basin",
          "Lock gate 2",
          "Tide station",
          "Pier 1 gauge",
          "Outfall",
        ].map((name, i) => (
          <div
            key={name}
            className="flex h-9 items-center gap-4 border-b border-hairline px-4 text-[12px]"
          >
            <span className="w-28 truncate font-medium">{name}</span>
            <span className="font-mono text-ink-3 tabular-nums">
              {(1.42 + i * 0.37).toFixed(2)} m
            </span>
            <span className="ml-auto text-ink-3">{i + 2} min ago</span>
          </div>
        ))}
      </div>
      {toasts}
    </div>
  );

  if (!chrome) return <div className="w-full">{frame}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const id = `export-${extra.length + 1}`;
            setExtra((e) => [
              ...e,
              {
                id,
                kind: "export",
                title: "Exporting 24 hours",
                state: "running",
                progress: 0,
              },
            ]);
            setRuns((r) => ({
              ...r,
              [id]: {
                t: tick,
                started: Math.max(0, tick),
                failed: false,
                retried: false,
              },
            }));
            setNote(null);
          }}
          className={button}
        >
          <Play aria-hidden className="size-3.5" />
          Start export
        </button>
        <button
          type="button"
          onClick={() => {
            setTick(-1);
            setRuns({});
            setExtra([]);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span> · F6 reaches the toasts
      </p>
    </div>
  );
}
