"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MemoryAgeItem = {
  id: string;
  /** The remembered fact, one line. */
  text: string;
  /** Days since it was last used, supplied by the host. */
  age: number;
};

export type MemoryAgeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The facts in any order; the list sorts freshest first. */
  items: MemoryAgeItem[];
  /** Days at which a memory is at its faintest. @default 30 */
  horizon?: number;
  /** Labels an age. @default today / Nd / Nw */
  formatAge?: (days: number) => string;
  /** Fires from a row's Refresh button; set that item's age to 0. */
  onRefresh?: (id: string) => void;
  /** Names the list. */
  label: string;
  className?: string;
};

export type MemoryAgeState = "fresh" | "fading" | "faint";

/** Fresh for the first third of the horizon, faint once past it. */
export function memoryAgeState(age: number, horizon: number): MemoryAgeState {
  const ratio = age / Math.max(1, horizon);
  return ratio < 1 / 3 ? "fresh" : ratio < 1 ? "fading" : "faint";
}

/** The oldest memory keeps 35 percent of its ink: faint, still legible. */
const inkFor = (age: number, horizon: number) =>
  Number(
    (1 - 0.65 * Math.min(Math.max(0, age) / Math.max(1, horizon), 1)).toFixed(
      3,
    ),
  );

const defaultFormatAge = (days: number) =>
  days < 1
    ? "today"
    : days < 7
      ? `${Math.round(days)}d`
      : `${Math.round(days / 7)}w`;

const LEGEND: MemoryAgeState[] = ["fresh", "fading", "faint"];

/**
 * A list of remembered facts whose ink fades with age. Each row's opacity is
 * `1 − 0.65 · min(age / horizon, 1)`, tweened on `durations.base`, so the
 * oldest sit at 35 percent — faint but legible — and the list sorts freshest
 * first. When the host answers a Refresh by dropping a row's age, a wash
 * sweeps the row: a soft cobalt band travels left to right on a
 * `durations.slow` tween while the ink returns to full, and the row rises to
 * the top with `layout` on `glide` — a FLIP move that travels rather than
 * blinking into its slot.
 *
 * Fading is stated in words as well: every row names its text, its age label
 * and whether it is fresh, fading or faint, and the Refresh control is a real
 * button. Under reduced motion opacity still tracks age on a tween, because
 * fading is information; the wash becomes a tint that fades in and out with
 * no travel, and the reorder runs on a tween instead of a spring.
 */
export function MemoryAge({
  ref,
  items,
  horizon = 30,
  formatAge = defaultFormatAge,
  onRefresh,
  label,
  className,
}: MemoryAgeProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const sorted = [...items].sort((a, b) => a.age - b.age);

  // Rows whose age fell since the last committed list were refreshed: the
  // wash is keyed by a counter so a second refresh of the same row sweeps
  // again, and the status re-announces.
  const [ages, setAges] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.age])),
  );
  const [wash, setWash] = React.useState<{ ids: string[]; n: number } | null>(
    null,
  );
  const changed =
    items.length !== Object.keys(ages).length ||
    items.some((item) => ages[item.id] !== item.age);
  if (changed) {
    const refreshed = items.filter((item) => {
      const before = ages[item.id];
      return before !== undefined && item.age < before;
    });
    setAges(Object.fromEntries(items.map((item) => [item.id, item.age])));
    if (refreshed.length > 0) {
      const ids = refreshed.map((item) => item.id);
      setWash((prev) => ({ ids, n: (prev?.n ?? 0) + 1 }));
    }
  }
  const washed = wash ? items.filter((item) => wash.ids.includes(item.id)) : [];
  const spoken =
    washed.length === 1
      ? `Refreshed ${washed[0]?.text}, moved to the top`
      : `Refreshed ${washed.length} memories, moved to the top`;

  const layoutSpring = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
      </div>

      <ul aria-labelledby={labelId} className="flex flex-col gap-1.5 px-3">
        {sorted.map((item) => {
          const state = memoryAgeState(item.age, horizon);
          const ink = inkFor(item.age, horizon);
          const ageLabel = formatAge(item.age);
          return (
            <motion.li
              key={item.id}
              layout
              transition={{ layout: layoutSpring }}
              aria-label={`${item.text}, ${ageLabel}, ${state}`}
              className="relative flex items-center gap-2.5 rounded-2 border border-hairline bg-surface-2 py-2 pr-2 pl-3"
            >
              {/* The wash lives in its own clipped layer so the row itself
                  never clips the Refresh button's focus ring. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-2"
              >
                {wash?.ids.includes(item.id) ? (
                  <motion.span
                    key={wash.n}
                    initial={
                      motionSafe
                        ? { left: "-40%", opacity: 1 }
                        : { left: "0%", opacity: 0 }
                    }
                    animate={
                      motionSafe
                        ? { left: "100%", opacity: 1 }
                        : { left: "0%", opacity: [0, 1, 0] }
                    }
                    transition={
                      motionSafe
                        ? { duration: durations.slow, ease: easings.enter }
                        : { duration: durations.slow, ease: easings.move }
                    }
                    className={cn(
                      "absolute inset-y-0 bg-cobalt-wash",
                      motionSafe ? "w-2/5" : "w-full",
                    )}
                  />
                ) : null}
              </span>

              <motion.span
                initial={false}
                animate={{ opacity: ink }}
                transition={{ duration: durations.base, ease: easings.move }}
                className="relative flex min-w-0 flex-1 items-center gap-2.5"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                />
                <span
                  className="min-w-0 flex-1 truncate text-sm text-foreground"
                  title={item.text}
                >
                  {item.text}
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
                  {ageLabel}
                </span>
              </motion.span>

              <button
                type="button"
                aria-label={`Refresh: ${item.text}`}
                onClick={() => onRefresh?.(item.id)}
                className={cn(
                  "relative flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Refresh
              </button>
            </motion.li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {LEGEND.map((state, index) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full bg-foreground"
              style={{ opacity: inkFor((index * horizon) / 2, horizon) }}
            />
            {state}
          </span>
        ))}
        <span className="ml-auto">Fades over {horizon} days</span>
      </div>

      <span role="status" className="sr-only">
        {washed.length > 0 ? <span key={wash?.n}>{spoken}</span> : null}
      </span>
    </div>
  );
}
