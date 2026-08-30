"use client";

import * as React from "react";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { CodeLathe } from "@/registry/ui/code-lathe";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ToolCall =
  | { id: string; kind: "thinking"; title: string; lines: string[] }
  | {
      id: string;
      kind: "write";
      title: string;
      filename: string;
      code: string;
    }
  | {
      id: string;
      kind: "run";
      title: string;
      command: string;
      checks: string[];
    }
  | {
      id: string;
      kind: "read";
      title: string;
      target: string;
      note: string;
    };

export type FileChange = {
  id: string;
  filename: string;
  added?: number;
  removed?: number;
};

export type ToolTraceProps = {
  /** The collapsed summary, e.g. "4 tool calls, 2 messages". */
  summary?: string;
  calls?: ToolCall[];
  /** The change chips under the run; overflow folds into "+N more". */
  changes?: FileChange[];
  /** Change chips shown before the overflow count. @default 3 */
  maxChanges?: number;
  defaultOpen?: boolean;
  className?: string;
};

const DEFAULT_CALLS: ToolCall[] = [
  {
    id: "c1",
    kind: "thinking",
    title: "Planning the reshuffle",
    lines: [
      "Crane 2's hold lands inside the rig-test window.",
      "Crew B is clear from 10:15, so the swap costs nothing.",
    ],
  },
  {
    id: "c2",
    kind: "write",
    title: "Write 2 lines",
    filename: "reshuffle.ts",
    code: "+ const window = holds.clip(rigTest.window)\n+ return swap(crewB, { into: window })",
  },
  {
    id: "c3",
    kind: "run",
    title: "Recut and verify",
    command: "waylight cut --yard north",
    checks: ["cut in 0.8s", "2 boards updated", "0 conflicts"],
  },
  {
    id: "c4",
    kind: "read",
    title: "Read board",
    target: "north-r3.board",
    note: "Nine slots, crane 2 clear, rig test protected.",
  },
];

const DEFAULT_CHANGES: FileChange[] = [
  { id: "f1", filename: "reshuffle.ts", added: 2 },
  { id: "f2", filename: "north.board", added: 4, removed: 4 },
  { id: "f3", filename: "handover.md", added: 8 },
  { id: "f4", filename: "crews.ts", added: 1, removed: 1 },
];

/**
 * A tool run folded into a chip: collapsed, one line says what happened —
 * "4 tool calls, 2 messages" — and open, the run replays as its parts: a
 * thinking note, a code write on the lathe, a command with its checks
 * printing, a read with what was seen. File-change chips close the run with
 * +/− counts and an honest "+N more" overflow. The point is proportion:
 * agents work loudly, and a transcript that prints every tool call at full
 * height buries the answer the run was for.
 *
 * The code write composes code-lathe (presented whole, diff gutters on), so
 * the snippet is copyable and complete for assistive tech from first paint.
 *
 * Reduced motion: the drawer opens instantly and parts print in place.
 */
export function ToolTrace({
  summary = "4 tool calls, 2 messages",
  calls = DEFAULT_CALLS,
  changes = DEFAULT_CHANGES,
  maxChanges = 3,
  defaultOpen = false,
  className,
}: ToolTraceProps) {
  const motionSafe = useMotionSafe();
  const panelId = React.useId();
  const [open, setOpen] = React.useState(defaultOpen);
  const step = cascade(calls.length);

  const shown = changes.slice(0, maxChanges);
  const overflow = changes.length - shown.length;

  return (
    <div className={cn("w-full max-w-md", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-3 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        <span>{summary}</span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: motionSafe ? 0 : 1 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: 0 }
            }
            className="overflow-hidden"
          >
            <ol className="mt-3 flex flex-col gap-3">
              {calls.map((call, index) => (
                <motion.li
                  key={call.id}
                  initial={{
                    opacity: motionSafe ? 0 : 1,
                    y: motionSafe ? distances.nudge : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: index * step,
                        }
                      : { duration: 0 }
                  }
                  className="min-w-0 rounded-3 border border-hairline p-3"
                >
                  <p className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-medium text-ink">
                      {call.title}
                    </span>
                    {call.kind === "write" && (
                      <span className="truncate font-mono text-[11px] text-ink-3">
                        {call.filename}
                      </span>
                    )}
                    {call.kind === "read" && (
                      <span className="truncate font-mono text-[11px] text-ink-3">
                        {call.target}
                      </span>
                    )}
                  </p>

                  {call.kind === "thinking" && (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {call.lines.map((line) => (
                        <li
                          key={line}
                          className="text-sm leading-relaxed text-ink-2"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}

                  {call.kind === "write" && (
                    <div className="mt-2">
                      <CodeLathe
                        code={call.code}
                        filename={call.filename}
                        diff
                        stream={false}
                        copyable={false}
                        className="text-[12px]"
                      />
                    </div>
                  )}

                  {call.kind === "run" && (
                    <div className="mt-1.5 font-mono text-[12px]">
                      <p className="text-ink-2">$ {call.command}</p>
                      {call.checks.map((check) => (
                        <p
                          key={check}
                          className="text-[var(--success,var(--primary))]"
                        >
                          ✓ {check}
                        </p>
                      ))}
                    </div>
                  )}

                  {call.kind === "read" && (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {call.note}
                    </p>
                  )}
                </motion.li>
              ))}
            </ol>

            {changes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {shown.map((change) => (
                  <span
                    key={change.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[11px]"
                  >
                    <span className="text-ink-2">{change.filename}</span>
                    {change.added ? (
                      <span className="text-[var(--success,var(--primary))]">
                        +{change.added}
                      </span>
                    ) : null}
                    {change.removed ? (
                      <span className="text-destructive">
                        −{change.removed}
                      </span>
                    ) : null}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="font-mono text-[11px] text-ink-3">
                    +{overflow} more
                  </span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
