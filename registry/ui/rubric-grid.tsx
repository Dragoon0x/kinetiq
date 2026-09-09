"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RubricCriterion = {
  id: string;
  name: string;
  /** One short line under the name saying what the criterion asks. */
  hint?: string;
};

export type RubricGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rows, top to bottom. */
  criteria: RubricCriterion[];
  /** Score levels per criterion, 1 to `levels`. @default 4 */
  levels?: number;
  /** Column-header words for the levels; falls back to the numbers. */
  levelLabels?: string[];
  /** Controlled scores keyed by criterion id; absent keys are unscored. */
  value?: Record<string, number>;
  /** Initial scores for uncontrolled usage. @default {} */
  defaultValue?: Record<string, number>;
  /** Fires from the click or key that scored or cleared a criterion. */
  onValueChange?: (scores: Record<string, number>) => void;
  /** Names the grid for assistive technology. */
  label: string;
  className?: string;
};

const NO_SCORES: Record<string, number> = {};
/** The name column's share of the row in fr units; a level column is one. */
const NAME_SHARE = 2.4;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`. The column is ten faces
 * tall, so a `y` of one tenth moves exactly one digit; it is hidden from
 * assistive technology because the status line already speaks the total.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when
        // the total gains a digit.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.25em] items-center justify-center"
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

/**
 * A rubric as a real grid: a row per criterion, a cell per level. Scoring a
 * level fills the row with a bar — a wash growing from the left edge to the
 * chosen level on `glide`, because a score is a quantity settling rather
 * than a switch flipping — and the chosen cell takes the primary fill.
 * Pressing the chosen level again clears the row and the bar drains. The
 * total beneath rolls its digits on `snap`; criteria still to score carry a
 * hollow ring that breathes until they are, and once every row is scored
 * the rings go still and a Complete chip lands on `snap`.
 *
 * Arrow keys walk the cells (Left and Right across levels, Up and Down
 * across criteria), Home and End jump to the ends of a row, Space and Enter
 * score or clear. Under reduced motion the bar swaps to its length on a
 * tween, nothing breathes — the hollow ring and the word "unscored" carry
 * the state — and the digits swap in place.
 */
export function RubricGrid({
  ref,
  criteria,
  levels = 4,
  levelLabels,
  value,
  defaultValue = NO_SCORES,
  onValueChange,
  label,
  className,
}: RubricGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<Record<string, number>>(defaultValue);
  const isControlled = value !== undefined;
  const scores = isControlled ? value : uncontrolled;

  const levelCount = Math.max(1, Math.floor(levels));
  const levelList = Array.from({ length: levelCount }, (_, index) => index + 1);
  const levelWord = (level: number) =>
    levelLabels?.[level - 1] ?? String(level);

  const cellRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(0);
  const at = (row: number, col: number) => row * levelCount + col;

  // What was said last lives in state so the live region speaks once per
  // change rather than re-reading the whole grid.
  const [announcement, setAnnouncement] = React.useState("");

  const scoredCount = criteria.filter((c) => scores[c.id] !== undefined).length;
  const total = criteria.reduce((sum, c) => sum + (scores[c.id] ?? 0), 0);
  const possible = criteria.length * levelCount;
  const complete = criteria.length > 0 && scoredCount === criteria.length;

  const score = (criterion: RubricCriterion, level: number) => {
    const clearing = scores[criterion.id] === level;
    const next = { ...scores };
    if (clearing) delete next[criterion.id];
    else next[criterion.id] = level;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);

    const nextTotal = criteria.reduce(
      (sum, item) => sum + (next[item.id] ?? 0),
      0,
    );
    const allScored = criteria.every((item) => next[item.id] !== undefined);
    setAnnouncement(
      clearing
        ? `${criterion.name} cleared`
        : allScored
          ? `All criteria scored, ${nextTotal} of ${possible}`
          : `${criterion.name} scored ${level} of ${levelCount}`,
    );
  };

  const moveTo = (row: number, col: number) => {
    const clampedRow = Math.min(criteria.length - 1, Math.max(0, row));
    const clampedCol = Math.min(levelCount - 1, Math.max(0, col));
    const index = at(clampedRow, clampedCol);
    setFocused(index);
    cellRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    row: number,
    col: number,
    criterion: RubricCriterion,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(row, col + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(row, col - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveTo(row + 1, col);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(row - 1, col);
        break;
      case "Home":
        event.preventDefault();
        moveTo(row, 0);
        break;
      case "End":
        event.preventDefault();
        moveTo(row, levelCount - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        score(criterion, col + 1);
        break;
      default:
        break;
    }
  };

  const fill = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  const columns = {
    gridTemplateColumns: `minmax(0, ${NAME_SHARE}fr) repeat(${levelCount}, minmax(2rem, 1fr))`,
  };

  return (
    <div
      ref={ref}
      className={cn(
        "@container flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div
        role="grid"
        aria-labelledby={labelId}
        className="flex flex-col gap-1"
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>

        <div role="row" className="grid gap-1" style={columns}>
          <div role="columnheader" className="flex h-6 items-center">
            <span className="sr-only">Criterion</span>
          </div>
          {levelList.map((level) => (
            <div
              key={level}
              role="columnheader"
              title={levelWord(level)}
              className="flex h-6 min-w-0 items-center justify-center px-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {/* A narrow card has no room for the words, and a cut word is
                  worse than its initial; the full word stays in the title
                  and in the cell's own name. */}
              <span className="@[22rem]:hidden" aria-hidden>
                {levelWord(level).slice(0, 1)}
              </span>
              <span className="hidden truncate @[22rem]:inline">
                {levelWord(level)}
              </span>
            </div>
          ))}
        </div>

        {criteria.map((criterion, row) => {
          const current = scores[criterion.id];
          const scored = current !== undefined;
          // The wash ends at the chosen level's right edge: the name column
          // is NAME_SHARE of the row's fr units, each level one.
          const fraction = scored
            ? Number(
                ((NAME_SHARE + current) / (NAME_SHARE + levelCount)).toFixed(3),
              )
            : 0;
          return (
            <div
              key={criterion.id}
              role="row"
              className="relative grid gap-1 rounded-2"
              style={columns}
            >
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 origin-left rounded-2 bg-cobalt-wash"
                initial={false}
                animate={{ scaleX: fraction }}
                transition={fill}
              />

              <div
                role="rowheader"
                className="relative flex min-w-0 items-center gap-2 py-1.5 pl-2"
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full border-[1.5px] transition-colors duration-200",
                    scored
                      ? "border-cobalt-bright bg-cobalt-bright"
                      : "border-ink-3 bg-transparent",
                  )}
                  initial={false}
                  animate={{ opacity: scored || !motionSafe ? 1 : 0.35 }}
                  // Unscored rings breathe on a slow reverse tween: an
                  // opacity cue, so it survives a still page.
                  transition={
                    scored || !motionSafe
                      ? { duration: durations.fast }
                      : {
                          duration: durations.page,
                          ease: easings.move,
                          repeat: Infinity,
                          repeatType: "reverse",
                        }
                  }
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    title={criterion.name}
                    className="truncate text-xs font-medium text-foreground"
                  >
                    {criterion.name}
                  </span>
                  {criterion.hint ? (
                    <span
                      title={criterion.hint}
                      className="truncate text-[11px] text-ink-3"
                    >
                      {criterion.hint}
                    </span>
                  ) : null}
                  <span className="sr-only">
                    {scored
                      ? `, scored ${current} of ${levelCount}`
                      : ", unscored"}
                  </span>
                </span>
              </div>

              {levelList.map((level, col) => {
                const index = at(row, col);
                const chosen = current === level;
                return (
                  <div
                    key={level}
                    role="gridcell"
                    aria-selected={chosen}
                    className="relative flex min-w-0 items-center justify-center py-1"
                  >
                    <button
                      ref={(node) => {
                        cellRefs.current[index] = node;
                      }}
                      type="button"
                      aria-pressed={chosen}
                      aria-label={`${criterion.name}, ${levelWord(level)}`}
                      tabIndex={focused === index ? 0 : -1}
                      onFocus={() => setFocused(index)}
                      onClick={() => score(criterion, level)}
                      onKeyDown={(event) =>
                        handleKeyDown(event, row, col, criterion)
                      }
                      className={cn(
                        "flex h-7 w-full max-w-9 items-center justify-center rounded-2 border font-mono text-xs tabular-nums transition-colors duration-150 outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        chosen
                          ? "border-primary bg-primary text-primary-foreground"
                          : scored && level < current
                            ? "border-cobalt-bright/40 bg-surface-0 text-ink-2"
                            : "border-hairline-strong bg-surface-0 text-ink-3 hover:border-cobalt-bright/60 hover:text-foreground",
                      )}
                    >
                      {level}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex h-7 items-center justify-between gap-3 border-t border-hairline pt-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px]">
          <AnimatePresence mode="wait" initial={false}>
            {complete ? (
              <motion.span
                key="complete"
                className="inline-flex h-5 shrink-0 items-center rounded-full bg-success/15 px-1.5 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
                initial={
                  motionSafe ? { scale: 1.2, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                Complete
              </motion.span>
            ) : (
              <motion.span
                key="remaining"
                className="truncate text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                {criteria.length - scoredCount} to score
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-center font-mono text-sm">
          <span className="font-medium text-foreground">
            <RollingNumber value={String(total)} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3 tabular-nums">
            {" / "}
            {possible}
          </span>
          <span className="sr-only">
            Total {total} of {possible}
          </span>
        </span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
