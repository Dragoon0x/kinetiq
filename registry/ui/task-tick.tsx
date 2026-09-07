"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TaskTickItem = {
  id: string;
  label: string;
  done: boolean;
};

export type TaskTickProps = {
  /** The tasks, in the order they should read while open. */
  items: TaskTickItem[];
  /** Fires from the checkbox that changed. */
  onToggle?: (id: string, done: boolean) => void;
  /** List label. */
  label: string;
  className?: string;
};

/**
 * The beat between the strike and the sink. Long enough for the line to finish
 * drawing, short enough that the row does not look forgotten.
 */
const SINK_MS = 280;

/**
 * A checklist that keeps its order honest. Checking draws a line through the
 * label with `pathLength` on `flick` — the strike is the acknowledgement, so it
 * lands before anything else moves — and only after a beat does the row sink
 * into the done section, a `layout` reorder on `glide` where the row travels
 * rather than blinking out of one place and into another. Unchecking floats it
 * back the same way, and the progress pill counts on `snap`.
 *
 * The beat is not a delay for its own sake: a row that leaves the instant it is
 * ticked takes the cursor's target with it, and the next tick lands on whatever
 * slid underneath. Holding the row in place until the strike is read keeps a
 * fast run of ticks pointing at the rows the reader meant.
 *
 * Every checkbox is a real input, so Tab reaches each one and Space toggles it;
 * the list is labelled and the count is announced politely. Under reduced motion
 * the strike appears complete and rows move without springs — the order still
 * changes, because the order is the information.
 */
export function TaskTick({ items, onToggle, label, className }: TaskTickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  // A toggled row keeps its old section for a beat. Storing the value it had —
  // rather than assuming the flip — means a host that ignores onToggle sees no
  // phantom move at all.
  const [held, setHeld] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (Object.keys(held).length === 0) return;
    const timer = window.setTimeout(() => setHeld({}), SINK_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  const toggle = (item: TaskTickItem) => {
    setHeld((prev) => ({ ...prev, [item.id]: item.done }));
    onToggle?.(item.id, !item.done);
  };

  const doneCount = items.filter((item) => item.done).length;
  const total = items.length;

  const ordered = items
    .map((item, index) => ({
      item,
      index,
      section: (held[item.id] ?? item.done) ? 1 : 0,
    }))
    .sort((a, b) => a.section - b.section || a.index - b.index);

  const firstDone = ordered.findIndex((entry) => entry.section === 1);

  const rowLayout = motionSafe ? ("position" as const) : false;
  const rowTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] tabular-nums">
          <motion.span
            key={doneCount}
            className="inline-block text-signal"
            initial={motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? springs.snap
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            {doneCount}
          </motion.span>
          <span className="text-ink-3">/ {total}</span>
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-ink-3">Nothing on the list.</p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
          {ordered.flatMap(({ item }, position) => {
            // The divider keeps one stable key for the life of the list, so it
            // travels with the boundary instead of remounting at each new row.
            const row = (
              <motion.li
                key={item.id}
                layout={rowLayout}
                transition={rowTransition}
              >
                <label className="flex cursor-pointer items-center gap-2.5 rounded-2 px-2 py-1.5 transition-colors hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggle(item)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                      item.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="size-3">
                      <motion.path
                        d="M3.4 8.4 6.4 11.4 12.6 4.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        initial={false}
                        animate={{ pathLength: item.done ? 1 : 0 }}
                        // The tick draw is the acknowledgement: instant under
                        // reduced motion, never absent.
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  </span>

                  {/* Shrink-wraps the text rather than filling the row, so
                      the strike ends where the word does. */}
                  <span className="relative min-w-0">
                    <span
                      title={item.label}
                      className={cn(
                        "block truncate text-sm transition-colors",
                        item.done ? "text-ink-3" : "text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                    {/* Percentage geometry and no viewBox: the strike ends
                        where the word does at any width, and its weight stays
                        1.4px instead of being scaled by a stretched viewBox. */}
                    <svg
                      aria-hidden
                      className="pointer-events-none absolute inset-0 size-full overflow-visible text-ink-3"
                    >
                      <motion.line
                        x1="0"
                        y1="50%"
                        x2="100%"
                        y2="50%"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        pathLength={1}
                        initial={false}
                        animate={{ pathLength: item.done ? 1 : 0 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  </span>
                </label>
              </motion.li>
            );
            return position === firstDone && firstDone > 0
              ? [
                  <motion.li
                    key="section-done"
                    aria-hidden
                    layout={rowLayout}
                    transition={rowTransition}
                    className="flex items-center gap-2 px-2 pt-2 pb-1"
                  >
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Done
                    </span>
                    <span className="h-px flex-1 bg-hairline" />
                  </motion.li>,
                  row,
                ]
              : [row];
          })}
        </ul>
      )}

      <span role="status" className="sr-only">
        {doneCount} of {total} done
      </span>
    </div>
  );
}
