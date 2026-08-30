"use client";

import * as React from "react";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RunStatus = "done" | "running" | "failed" | "queued";

export type RunItem = {
  id: string;
  text: string;
  status: RunStatus;
  /** Small trailing detail — a count, a percentage, a filename. */
  detail?: string;
};

export type RunTask = {
  id: string;
  title: string;
  /** Rolls on the readout as children complete. */
  count?: number;
  countLabel?: string;
  status: RunStatus;
  items: RunItem[];
};

export type RunSheetFace = "capsule" | "list";

export type RunSheetProps = {
  tasks?: RunTask[];
  /** Capsule cards, or a flat rail. @default "capsule" */
  face?: RunSheetFace;
  className?: string;
};

const DEFAULT_TASKS: RunTask[] = [
  {
    id: "t1",
    title: "Verified crew rosters",
    count: 12,
    countLabel: "crews",
    status: "done",
    items: [
      {
        id: "i1",
        text: "Matched licences and rest windows",
        status: "done",
        detail: "12/12",
      },
      {
        id: "i2",
        text: "Flagged stale certifications",
        status: "failed",
        detail: "2",
      },
    ],
  },
  {
    id: "t2",
    title: "Building the reorder list",
    count: 7,
    countLabel: "SKUs",
    status: "running",
    items: [
      {
        id: "i3",
        text: "Reading the stores export",
        status: "done",
        detail: "3 files",
      },
      {
        id: "i4",
        text: "Scoring stockout risk",
        status: "running",
        detail: "68%",
      },
    ],
  },
  {
    id: "t3",
    title: "Drafting handover notes",
    count: 2,
    countLabel: "drafts",
    status: "queued",
    items: [
      { id: "i5", text: "Crane 2 hold summary", status: "queued" },
      { id: "i6", text: "Crew B swap note", status: "queued" },
    ],
  },
];

const STATUS_LABEL: Record<RunStatus, string> = {
  done: "completed",
  running: "running",
  failed: "failed",
  queued: "queued",
};

function StatusMark({ status }: { status: RunStatus }) {
  const motionSafe = useMotionSafe();
  if (status === "done")
    return (
      <Check
        aria-hidden
        className="size-3.5 text-[var(--success,var(--primary))]"
      />
    );
  if (status === "failed")
    return <X aria-hidden className="size-3.5 text-destructive" />;
  if (status === "running")
    return (
      <motion.span
        aria-hidden
        className="block size-2 rounded-full bg-primary"
        animate={motionSafe ? { opacity: [0.35, 1, 0.35] } : { opacity: 0.7 }}
        transition={
          motionSafe
            ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
            : { duration: 0 }
        }
      />
    );
  return (
    <span
      aria-hidden
      className="block size-2 rounded-full border border-hairline-strong"
    />
  );
}

/**
 * The agent's task list as a working document: parent tasks carrying a
 * rolling count, child rows carrying their own verdicts — done ticks, a
 * breathing running dot, failures shown in red rather than folded into a
 * success number. Two faces: capsules for a panel, a flat list for a
 * transcript. Statuses are carried by word and mark together, never by
 * colour alone, and counts roll on the readout because they are the part
 * that changes while you watch.
 *
 * Reduced motion: rows print in place and the running dot holds mid-beat.
 */
export function RunSheet({
  tasks = DEFAULT_TASKS,
  face = "capsule",
  className,
}: RunSheetProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(tasks.length);

  return (
    <div
      className={cn(
        "w-full max-w-md",
        face === "capsule" ? "flex flex-col gap-3" : "flex flex-col",
        className,
      )}
    >
      {tasks.map((task, index) => (
        <motion.section
          key={task.id}
          aria-label={`${task.title}, ${STATUS_LABEL[task.status]}`}
          initial={{ opacity: motionSafe ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={
            motionSafe
              ? {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: index * step,
                }
              : { duration: 0 }
          }
          className={cn(
            "min-w-0",
            face === "capsule"
              ? "rounded-3 border border-hairline bg-surface-1 p-3.5"
              : "border-b border-hairline py-3 last:border-b-0",
          )}
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="self-center">
              <StatusMark status={task.status} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {task.title}
            </span>
            {task.count !== undefined && (
              <span className="flex shrink-0 items-baseline gap-1 font-mono text-[11px] text-ink-3">
                <Readout value={task.count} size="sm" />
                {task.countLabel}
              </span>
            )}
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] tracking-[0.06em] uppercase",
                task.status === "failed" ? "text-destructive" : "text-ink-3",
              )}
            >
              {STATUS_LABEL[task.status]}
            </span>
          </div>

          <ul className="mt-2 flex flex-col gap-1 pl-5">
            {task.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-baseline gap-2">
                <span className="self-center">
                  <StatusMark status={item.status} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    item.status === "queued" ? "text-ink-3" : "text-ink-2",
                  )}
                >
                  {item.text}
                </span>
                {item.detail && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      item.status === "failed"
                        ? "text-destructive"
                        : "text-ink-3",
                    )}
                  >
                    {item.detail}
                  </span>
                )}
                <span className="sr-only">{STATUS_LABEL[item.status]}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}
