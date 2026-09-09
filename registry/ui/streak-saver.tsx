"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StreakWeek = {
  id: string;
  /** The week's date, as it should read ("3 Aug"). */
  label: string;
  saved: boolean;
};

export type StreakSaverProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Oldest first; the last entry is the current week. */
  weeks: StreakWeek[];
  /** The weekly contribution, printed on the Save button. */
  amount: number;
  /** Fires from the Save press for the current week. */
  onSave?: (weekId: string) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the saver; printed as the heading and read as the list's label. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the card exists to show.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** A miss is drawn, not merely dimmed — hatching survives both themes. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--hairline-strong) 0 1px, transparent 1px 5px)";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`, on the same beat as the cell
 * lighting. Hidden from assistive technology: the status sentence carries the
 * number, so no reader wades through ten faces per column.
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
        // Keyed from the right so the units column keeps its identity when the
        // count gains or loses a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
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

/**
 * Consecutive saved weeks counted back from the newest saved cell. An open
 * current week does not break the run — it only leaves it at risk.
 */
function streakOf(weeks: StreakWeek[]): number {
  let end = weeks.length - 1;
  if (end >= 0 && !weeks[end]!.saved) end -= 1;
  let run = 0;
  while (end >= 0 && weeks[end]!.saved) {
    run += 1;
    end -= 1;
  }
  return run;
}

function bestOf(weeks: StreakWeek[]): number {
  let best = 0;
  let run = 0;
  for (const week of weeks) {
    run = week.saved ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

const plural = (count: number) => (count === 1 ? "week" : "weeks");

/**
 * A weekly saving streak as a row of cells, oldest on the left and the current
 * week on the right. Saving lights the current cell — the fill lands from 0.6×
 * on `snap`, one crisp overshoot, a light switching on — while a halo blooms
 * and fades on a tween, and on the same beat the streak count rolls to the new
 * run. When the calendar advances, the oldest cell leaves on the exit ease, the
 * rest glide left one column as a `layout` move, a new outlined cell arrives
 * from the right, and a week left unsaved dims to a hatched cell on a colour
 * tween: nothing celebrates a miss. The count rolls down to zero.
 *
 * The cells are a list whose items read as sentences, the Save button is a real
 * button that stays focusable once pressed, and a status line renders the run
 * so any change — from the press or from the parent's calendar — is announced
 * once. Under reduced motion cells fade to their colour, the shift swaps, and
 * the digits swap in place; the cell still lights, the count still updates.
 */
export function StreakSaver({
  ref,
  weeks,
  amount,
  onSave,
  format = defaultFormat,
  label,
  className,
}: StreakSaverProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const savedKey = weeks
    .filter((week) => week.saved)
    .map((week) => week.id)
    .join("|");

  // The halo belongs to a cell that lit since the last committed render — from
  // the press or from the parent — so the comparison happens in render against
  // state, not in an effect, and never on mount.
  const [seen, setSeen] = React.useState<{
    key: string;
    flare: string | null;
  }>({ key: savedKey, flare: null });
  if (seen.key !== savedKey) {
    const before = new Set(seen.key.split("|"));
    const fresh = savedKey
      .split("|")
      .filter((id) => id !== "" && !before.has(id));
    setSeen({ key: savedKey, flare: fresh[fresh.length - 1] ?? null });
  }

  const current = weeks[weeks.length - 1];
  const canSave = current !== undefined && !current.saved;
  const streak = streakOf(weeks);
  const best = bestOf(weeks);
  const savedCount = weeks.filter((week) => week.saved).length;
  const putAway = savedCount * amount;

  const save = () => {
    if (!current || current.saved) return;
    onSave?.(current.id);
  };

  const sentence =
    weeks.length === 0
      ? "No weeks yet"
      : `${streak} ${plural(streak)} in a row, this week ${
          current?.saved ? "saved" : "not yet saved"
        }`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            Best {best} · {format(putAway)} put away
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span
            className={cn(
              "font-mono text-2xl leading-none font-medium transition-colors",
              streak > 0 ? "text-ink" : "text-ink-3",
            )}
          >
            <RollingNumber value={String(streak)} motionSafe={motionSafe} />
          </span>
          <span className="text-[11px] text-ink-2">in a row</span>
        </div>
      </div>

      {weeks.length === 0 ? (
        <p className="text-xs text-ink-3">No weeks yet.</p>
      ) : (
        <ol
          aria-labelledby={labelId}
          className="relative grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
          }}
        >
          {/* popLayout lifts a leaving cell out of the grid, so the survivors
              glide into their new columns at once instead of waiting for it to
              finish fading in a column that no longer exists. */}
          <AnimatePresence initial={false} mode="popLayout">
            {weeks.map((week, index) => {
              const isCurrent = index === weeks.length - 1;
              const status = week.saved
                ? "saved"
                : isCurrent
                  ? "open"
                  : "missed";
              const cellSentence = `Week of ${week.label}, ${
                status === "saved"
                  ? "saved"
                  : status === "open"
                    ? "this week, not yet saved"
                    : "missed"
              }`;
              return (
                <motion.li
                  key={week.id}
                  layout={motionSafe ? "position" : false}
                  initial={
                    motionSafe
                      ? { opacity: 0, x: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={motionSafe ? springs.glide : fade}
                  title={cellSentence}
                  // Motion owns this element's opacity for enter and exit, so
                  // the dim lives on the children: a CSS transition here would
                  // fight the spring frame by frame.
                  className="relative aspect-square min-w-0"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-0 rounded-1 border transition-colors duration-300",
                      status === "open"
                        ? "border-dashed border-hairline-strong bg-surface-2"
                        : status === "missed"
                          ? "border-hairline bg-surface-2"
                          : "border-cobalt-bright/40",
                    )}
                  />
                  <span
                    aria-hidden
                    style={{ backgroundImage: HATCH }}
                    className={cn(
                      "absolute inset-0 rounded-1 transition-opacity duration-300",
                      status === "missed" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-1 bg-cobalt-bright"
                    initial={false}
                    // Under reduced motion the light only fades up: scale is a
                    // transform that travels, and the colour is the information.
                    animate={{
                      scale: motionSafe && !week.saved ? 0.6 : 1,
                      opacity: week.saved ? 1 : 0,
                    }}
                    transition={motionSafe ? springs.snap : fade}
                  />
                  <AnimatePresence>
                    {motionSafe && seen.flare === week.id ? (
                      <motion.span
                        key="flare"
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-1 bg-cobalt-bright"
                        initial={{ opacity: 0.6, scale: 1 }}
                        animate={{ opacity: 0, scale: 1.7 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{
                          duration: durations.slow,
                          ease: easings.enter,
                        }}
                        onAnimationComplete={() =>
                          setSeen((prev) =>
                            prev.flare === week.id
                              ? { ...prev, flare: null }
                              : prev,
                          )
                        }
                      />
                    ) : null}
                  </AnimatePresence>
                  <span className="sr-only">{cellSentence}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}

      {weeks.length > 0 ? (
        <div
          aria-hidden
          className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          <span>{weeks[0]!.label}</span>
          <span>This week</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <button
          type="button"
          aria-label={
            canSave ? `Save ${format(amount)} for this week` : "Saved this week"
          }
          aria-disabled={!canSave || undefined}
          onClick={save}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-2 px-3 text-sm font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            canSave
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95"
              : "cursor-default border border-hairline-strong bg-surface-2 text-ink-2",
          )}
        >
          {canSave ? null : (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0 text-success"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                pathLength={1}
                // The tick draw is the acknowledgement: instant under reduced
                // motion, never absent.
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
          )}
          <span>{canSave ? `Save ${format(amount)}` : "Saved this week"}</span>
        </button>
        <span className="text-[11px] text-ink-3">
          {current?.saved
            ? "Next week keeps the run"
            : streak > 0
              ? "Save to keep the run"
              : "Save to start a run"}
        </span>
      </div>

      <span role="status" className="sr-only">
        {sentence}
      </span>
    </div>
  );
}
