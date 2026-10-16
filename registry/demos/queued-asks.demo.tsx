"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw, Zap } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQueuedAsks,
  defaultQueuedJob,
  defaultQueuedThread,
  QueuedAsks,
  type QueuedAsk,
  type QueuedAsksJob,
  type QueuedAsksTurn,
} from "@/registry/ui/queued-asks";

export const tweaks = defineTweaks({
  stackDepth: {
    kind: "range",
    label: "Stack depth",
    default: 3,
    min: 1,
    max: 5,
    step: 1,
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "note",
    options: ["note", "ticket", "line"],
    names: { note: "Note", ticket: "Ticket", line: "Line" },
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

/** What the assistant answers, by ask — a fixed script, so every run reads the same. */
const ANSWERS: Record<string, string> = {
  "four-basins":
    "Ashford lost the most: 13 points of storage between 2019 and 2024, nearly all of it in late summer. Fernley held steady; Coldwater and Mardale dipped in 2022 and recovered.",
  chart:
    "One chart, four lines, monthly from January 2019. Ashford’s late-summer dips stand out from the third year on.",
  gaps: "Three gauges have gaps over a week: Mardale 4 (11 days), Ashford 2 (9 days) and Coldwater 1 (8 days).",
  board:
    "Drafted: storage fell most at Ashford, driven by summer abstraction; the other basins recovered after 2022. A line on the gauge gaps closes it.",
  sources:
    "Twenty-two gauge reports from the Basinworks archive, January 2019 to June 2024, and the 2023 abstraction licence summary.",
};

const stepFor = (p: number) =>
  p < 0.6
    ? `Reading ${Math.max(1, Math.round((p / 0.6) * 22))} of 22 gauge reports`
    : p < 0.86
      ? "Comparing the basins"
      : "Writing the answer";

const start = (item: QueuedAsk): QueuedAsksJob => ({
  id: item.id,
  prompt: item.text,
  status: "running",
  progress: 0.04,
  step: stepFor(0.04),
});

/**
 * A Basinworks storage review: the assistant works through one question
 * while the analyst lines up the next four. The demo plays the session while
 * it is on screen — each answer finishes, and the next card peels off.
 */
export function QueuedAsksDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [job, setJob] = React.useState<QueuedAsksJob | null>(defaultQueuedJob);
  const [thread, setThread] =
    React.useState<QueuedAsksTurn[]>(defaultQueuedThread);
  const [queued, setQueued] = React.useState(defaultQueuedAsks.length);
  const [event, setEvent] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.3 });
  const failRef = React.useRef(false);
  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);

  // The running answer climbs while the demo is seen and the tab is visible.
  const runningId = job?.status === "running" ? job.id : null;
  React.useEffect(() => {
    if (!runningId || !inView) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setJob((j) => {
        if (!j || j.status !== "running") return j;
        const progress = Math.min(1, (j.progress ?? 0) + 0.035);
        if (failRef.current && progress >= 0.5) {
          return {
            ...j,
            status: "failed",
            progress,
            error: "The gauge archive timed out after 30 s.",
          };
        }
        if (progress >= 1)
          return {
            ...j,
            status: "done",
            progress: 1,
            answer: ANSWERS[j.id] ?? "Done. Here is what I found.",
          };
        return { ...j, progress, step: stepFor(progress) };
      });
    }, 140);
    return () => window.clearInterval(t);
  }, [runningId, inView]);

  // A failure is reported once, from the render that sees it land.
  const failedId = job?.status === "failed" ? job.id : null;
  const [seenFailed, setSeenFailed] = React.useState(failedId);
  if (seenFailed !== failedId) {
    setSeenFailed(failedId);
    if (failedId) {
      setFailNext(false);
      setEvent("paused · gauge archive timed out");
    }
  }

  const close = (j: QueuedAsksJob | null): QueuedAsksTurn[] =>
    j
      ? [
          ...thread,
          {
            id: j.id,
            prompt: j.prompt,
            answer:
              j.status === "done"
                ? (j.answer ?? "Done.")
                : `Skipped: ${(j.error ?? "the run stopped").replace(/\.$/, "")}.`,
          },
        ]
      : thread;

  const surface = (
    <QueuedAsks
      key={round}
      job={job}
      thread={thread}
      onQueueChange={(q) => setQueued(q.length)}
      onEnqueue={(item) => setEvent(`queued · ${item.text.toLowerCase()}`)}
      onReorder={(_ids, m) => setEvent(`moved · ${m.from + 1} → ${m.to + 1}`)}
      onEditQueued={() => setEvent("edited a queued ask")}
      onCancel={(id) => {
        if (job && id === job.id) {
          setJob({ ...job, status: "failed", error: "Stopped by you." });
          setEvent("stopped · queue paused");
        } else setEvent("removed a queued ask");
      }}
      onAdvance={(next) => {
        setThread(close(job));
        setJob(start(next));
        setEvent(`peeled · ${next.text.toLowerCase().replace(/\.$/, "")}`);
      }}
      onSend={(text) => {
        setThread(close(job));
        setJob(start({ id: `ask-${thread.length + 1}`, text }));
        setEvent("sent");
      }}
      onRetry={() => {
        if (!job) return;
        setJob(start({ id: job.id, text: job.prompt }));
        setEvent("retrying");
      }}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-warn/50 aria-pressed:text-warn",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const line =
    event ??
    (job?.status === "running"
      ? `running · ${queued} queued`
      : queued
        ? `${queued} queued`
        : "all caught up");

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          <Zap aria-hidden className="size-3.5" />
          Fail the next run
        </button>
        <button
          type="button"
          onClick={() => {
            setJob(defaultQueuedJob);
            setThread(defaultQueuedThread);
            setQueued(defaultQueuedAsks.length);
            setEvent(null);
            setFailNext(false);
            setRound((r) => r + 1);
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
        <span className="text-signal">{line}</span> · basinworks research
      </p>
    </div>
  );
}
