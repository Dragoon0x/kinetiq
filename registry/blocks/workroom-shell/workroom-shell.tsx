"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { StatusPip } from "@/registry/ui/status-pip";
import { WorkbenchRail } from "@/registry/ui/workbench-rail";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WorkroomPane = {
  id: string;
  title: string;
  copy: string;
  /** The pane's working rows — kept plain; the shell is about the seating. */
  rows: { id: string; label: string; state: string }[];
};

export type WorkroomShellProps = {
  workspace?: string;
  panes?: WorkroomPane[];
  /** Threads listed under the rail's own heading. */
  threads?: { id: string; label: string }[];
  className?: string;
};

const DEFAULT_PANES: WorkroomPane[] = [
  {
    id: "home",
    title: "This morning",
    copy: "The board cut itself at 05:12. Two changes since, both propagated.",
    rows: [
      { id: "r1", label: "Crane 2 hold cleared", state: "07:02" },
      { id: "r2", label: "Crew B moved to the second slot", state: "06:41" },
      { id: "r3", label: "Fieldline berth confirmed", state: "05:20" },
    ],
  },
  {
    id: "boards",
    title: "Boards",
    copy: "Four boards live. The gate board is the one the crews read.",
    rows: [
      { id: "b1", label: "Gate board", state: "live" },
      { id: "b2", label: "Crane sequence", state: "live" },
      { id: "b3", label: "Crew rest", state: "live" },
      { id: "b4", label: "Tomorrow, first cut", state: "draft" },
    ],
  },
  {
    id: "exports",
    title: "Exports",
    copy: "Everything that left the room this week, signed and dated.",
    rows: [
      { id: "x1", label: "Shift ledger — week 19", state: "filed" },
      { id: "x2", label: "Audit answer, berth 4", state: "filed" },
      { id: "x3", label: "Handover note, Friday", state: "queued" },
    ],
  },
];

const DEFAULT_THREADS = [
  { id: "t1", label: "Crane 2 hold, this morning" },
  { id: "t2", label: "Reorder list for the stores" },
  { id: "t3", label: "Crew B rest window" },
];

/**
 * The rail composed into a room: workbench-rail on one side, a content pane
 * on the other, and a crossfade between panes when the selection moves —
 * peers, not a journey. The rail keeps every behaviour it already owns
 * (travelling highlight, fold-to-spine, the printed quota); the shell only
 * decides the seating and hands selection across. On narrow surfaces the
 * rail steps out entirely — that edition is the workroom drawer's job.
 */
export function WorkroomShell({
  workspace = "North Basin Ops",
  panes = DEFAULT_PANES,
  threads = DEFAULT_THREADS,
  className,
}: WorkroomShellProps) {
  const motionSafe = useMotionSafe();
  const [activeId, setActiveId] = React.useState(panes[0]?.id ?? "home");

  const pane =
    panes.find((p) => p.id === activeId) ??
    // A thread selection has no pane of its own; it reads as the first one
    // annotated, which keeps the demo honest without inventing chat UI here.
    panes[0];

  return (
    <section className={cn("relative bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <div className="flex min-h-[420px] overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised">
          <WorkbenchRail
            workspace={workspace}
            threads={threads}
            activeId={activeId}
            onSelect={setActiveId}
            className="hidden shrink-0 border-r border-hairline sm:flex"
          />

          <div className="relative min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pane?.id}
                initial={motionSafe ? { opacity: 0 } : { opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: motionSafe ? durations.fast : 0,
                    ease: easings.exit,
                  },
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex h-full flex-col p-5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {pane?.title}
                  </h3>
                  <StatusPip
                    status="online"
                    label="On the record"
                    pulse={motionSafe}
                  />
                </div>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">
                  {pane?.copy}
                </p>

                <ul className="mt-5 flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-0">
                  {pane?.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {row.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                        {row.state}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
