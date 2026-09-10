"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type LogLevel = "info" | "warn" | "error";

export type LogLine = {
  id: string;
  level: LogLevel;
  /** The printed clock for this line — the component never reads one itself. */
  at: string;
  message: string;
};

export type LogGroupProps = {
  ref?: React.Ref<HTMLOListElement>;
  /** The log in order. Consecutive lines with the same level and message fold. */
  lines: LogLine[];
  /** Controlled ids of the unfolded runs, keyed by each run's first line. */
  openIds?: string[];
  /** Initial unfolded runs for uncontrolled usage. */
  defaultOpenIds?: string[];
  /** Fires from the press that folded or unfolded a run. */
  onOpenChange?: (ids: string[]) => void;
  /** Fires with the run that changed, whether it is open, and its length. */
  onGroupToggle?: (id: string, open: boolean, count: number) => void;
  /** Repeats needed before a run folds. @default 2 */
  minRun?: number;
  /** Names the list for assistive technology. @default "Log" */
  label?: string;
  className?: string;
};

type Run = {
  id: string;
  level: LogLevel;
  message: string;
  lines: LogLine[];
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const LEVEL_TONE: Record<LogLevel, string> = {
  info: "text-ink-3",
  warn: "text-warn",
  error: "text-danger",
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The run length, rolling on `snap` — one crisp overshoot, the physics of an
 * indicator changing position. Hidden from assistive technology because the
 * row's own name already says how many times the line repeated.
 */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // count gains a digit and only the new column mounts.
        const key = text.length - index;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-clip [contain:paint]"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

function LineCells({ line }: { line: LogLine }) {
  return (
    <>
      <span className="w-[3.25rem] shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
        {line.at}
      </span>
      <span
        className={cn(
          "w-9 shrink-0 font-mono text-[10px] font-medium",
          LEVEL_TONE[line.level],
        )}
      >
        {line.level}
      </span>
      <span
        title={line.message}
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
      >
        {line.message}
      </span>
    </>
  );
}

type RunRowProps = {
  run: Run;
  open: boolean;
  focusable: boolean;
  rowId: string;
  membersId: string;
  motionSafe: boolean;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One folded run. It owns its own ResizeObserver so a run that grows while it
 * is open re-measures itself, rather than every run re-measuring when any one
 * of them changes.
 */
function RunRow({
  run,
  open,
  focusable,
  rowId,
  membersId,
  motionSafe,
  onToggle,
  onKeyDown,
}: RunRowProps) {
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = run.lines.length;
  const first = run.lines[0];
  const last = run.lines[count - 1];
  const stagger = cascade(count);
  const name = `${count === 2 ? "Repeated twice" : `Repeated ${count} times`} from ${first?.at ?? ""} to ${last?.at ?? ""}, ${run.level}, ${run.message}.`;

  return (
    <>
      <button
        type="button"
        id={rowId}
        tabIndex={focusable ? 0 : -1}
        aria-expanded={open}
        aria-controls={membersId}
        aria-label={name}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-2 px-1.5 py-1 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          open && "bg-surface-2",
        )}
      >
        {first ? <LineCells line={first} /> : null}
        <span className="relative flex h-4 shrink-0 items-center gap-px rounded-full border border-hairline-strong px-1.5 font-mono text-[10px] font-medium text-ink">
          {/* The ring is a separate, keyed element so a change of count can pop
              without remounting the digit columns, which would cost the roll. */}
          <AnimatePresence initial={false}>
            {motionSafe ? (
              <motion.span
                key={count}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-cobalt-bright"
                initial={{ opacity: 0.9, scale: 1 }}
                animate={{ opacity: 0, scale: 1.35 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ) : null}
          </AnimatePresence>
          <span aria-hidden className="text-ink-3">
            ×
          </span>
          <RollingCount value={count} motionSafe={motionSafe} />
        </span>
      </button>

      <motion.div
        id={membersId}
        aria-hidden={!open}
        className="overflow-clip [contain:paint]"
        initial={false}
        animate={{ height: open ? height : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.enter }
        }
      >
        <ol
          ref={listRef}
          role="list"
          className="mt-0.5 ml-[0.6rem] flex flex-col border-l border-hairline-strong pl-2"
        >
          {run.lines.map((line, index) => (
            <motion.li
              key={line.id}
              className="flex items-center gap-1.5 px-1.5 py-0.5"
              initial={false}
              animate={{
                opacity: open ? 1 : 0,
                y: open || !motionSafe ? 0 : -distances.nudge,
              }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: open ? index * stagger : 0 }
                  : { duration: durations.base, ease: easings.enter }
              }
            >
              <LineCells line={line} />
            </motion.li>
          ))}
        </ol>
      </motion.div>
    </>
  );
}

/**
 * Repeated lines, folded. Consecutive lines carrying the same level and the
 * same message collapse into one row whose count rolls on `snap` when the run
 * grows, with a ring popping off the badge so the change is visible without the
 * row moving. This folds repetition rather than filtering it: every line is
 * still there, and every fold is reversible.
 *
 * Pressing a folded row unfolds the run — a ResizeObserver measures the member
 * list and the wrapper glides to that height on `glide` while the members
 * cascade from `distances.nudge` in a `cascade()`, so a run of twelve lands
 * inside the choreography budget. Folding runs the same move on the exit ease,
 * because exits never spring.
 *
 * The log is an `<ol role="list">` of `<li>` and the folded rows carry a roving
 * tabindex: Arrow Up and Down step, Home and End jump, Right unfolds, Left
 * folds. Under reduced motion the count still rolls to its new value and the
 * run still opens, on tweens, because a count is information.
 */
export function LogGroup({
  ref,
  lines,
  openIds,
  defaultOpenIds,
  onOpenChange,
  onGroupToggle,
  minRun = 2,
  label = "Log",
  className,
}: LogGroupProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultOpenIds ?? [],
  );
  const isControlled = openIds !== undefined;
  const current = isControlled ? openIds : uncontrolled;

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const runs = React.useMemo(() => {
    const out: Run[] = [];
    for (const line of lines) {
      const last = out[out.length - 1];
      if (last && last.level === line.level && last.message === line.message) {
        last.lines.push(line);
      } else {
        out.push({
          id: line.id,
          level: line.level,
          message: line.message,
          lines: [line],
        });
      }
    }
    return out;
  }, [lines]);

  const foldable = runs.filter(
    (run) => run.lines.length >= Math.max(2, minRun),
  );
  const activeRun = Math.min(activeIndex, Math.max(0, foldable.length - 1));

  const toggle = (run: Run) => {
    const count = run.lines.length;
    const open = !current.includes(run.id);
    const next = open
      ? [...current, run.id]
      : current.filter((entry) => entry !== run.id);
    if (!isControlled) setUncontrolled(next);
    // Frozen here, in the press that caused it: a controlled host may answer
    // late, and an effect watching the derived value would never fire at all.
    setAnnouncement(
      open
        ? `Unfolded ${plural(count, "line", "lines")}.`
        : `Folded ${plural(count, "line", "lines")} into one row.`,
    );
    onOpenChange?.(next);
    onGroupToggle?.(run.id, open, count);
  };

  const focusRun = (index: number) => {
    const clamped = Math.min(foldable.length - 1, Math.max(0, index));
    const target = foldable[clamped];
    if (!target) return;
    setActiveIndex(clamped);
    document.getElementById(`${baseId}-run-${target.id}`)?.focus();
  };

  const handleKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    run: Run,
    index: number,
  ) => {
    const open = current.includes(run.id);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRun(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRun(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRun(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRun(foldable.length - 1);
    } else if (event.key === "ArrowRight" && !open) {
      event.preventDefault();
      toggle(run);
    } else if (event.key === "ArrowLeft" && open) {
      event.preventDefault();
      toggle(run);
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <ol
        ref={ref}
        role="list"
        aria-label={label}
        className="flex w-full flex-col overflow-clip rounded-3 border border-hairline bg-surface-1 p-1.5 [contain:paint]"
      >
        {runs.map((run) => {
          const count = run.lines.length;
          const first = run.lines[0];
          // A run is built from at least one line, but the index read is still
          // possibly undefined under noUncheckedIndexedAccess.
          if (!first) return null;
          if (count < Math.max(2, minRun)) {
            return (
              <li
                key={run.id}
                className="flex items-center gap-1.5 px-1.5 py-1"
              >
                <LineCells line={first} />
              </li>
            );
          }
          const index = foldable.indexOf(run);
          return (
            <li key={run.id}>
              <RunRow
                run={run}
                open={current.includes(run.id)}
                focusable={index === activeRun}
                rowId={`${baseId}-run-${run.id}`}
                membersId={`${baseId}-members-${run.id}`}
                motionSafe={motionSafe}
                onToggle={() => toggle(run)}
                onKeyDown={(event) => handleKeys(event, run, index)}
              />
            </li>
          );
        })}
      </ol>

      <AnimatePresence initial={false}>
        {runs.length === 0 ? (
          <motion.p
            key="empty"
            className="px-1.5 font-mono text-[11px] text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor() }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            No lines yet.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
