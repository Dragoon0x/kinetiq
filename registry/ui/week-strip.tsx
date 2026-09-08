"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

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

export type SpendDay = {
  /** One or two letters — the strip prints it under the bar. */
  label: string;
  amount: number;
};

export type SpendWeek = {
  id: string;
  label: string;
  /** Exactly seven days, Monday first. */
  days: SpendDay[];
  /** Index of today, when this is the current week. */
  todayIndex?: number;
};

export type WeekStripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Weeks oldest first. */
  weeks: SpendWeek[];
  /** Controlled week id. */
  value?: string;
  /** Initial week id; defaults to the most recent week. */
  defaultValue?: string;
  /** Fires from the swipe, the chevrons, or PageUp/PageDown that changed week. */
  onValueChange?: (id: string) => void;
  /** Fires from the press or keypress that selected a day. */
  onDayChange?: (day: SpendDay | null, index: number) => void;
  /** Draws a dashed guide; bars above it read warn. */
  dailyBudget?: number;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the strip for assistive technology. @default "Weekly spend" */
  label?: string;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** Travel before a press becomes a drag — under this, a tap is still a tap. */
const CAPTURE_PX = 4;
/** How far the strip may follow the finger. */
const MAX_PULL = 72;
/** Share of the strip's width that commits a week change. */
const COMMIT_SHARE = 0.18;
/** Seconds for one breath of today's ring. */
const PULSE_S = 1.6;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * A week of spend, seven bars in one plot. The bars draw up from the baseline
 * on `glide` in a `cascade()` — a quantity settling, so no overshoot — and
 * today's column keeps a ring that breathes on a mirrored opacity tween, which
 * moves no layout and runs only while the tab is visible.
 *
 * Swiping changes week: the pointer is captured only after 4px of travel, the
 * strip follows the finger with rubber-band resistance at the ends, and on
 * release past the threshold the same seven bars keep their identity and glide
 * to the new week's heights while the strip springs back on `snap`. Every bar
 * is scaled against the tallest day in every week, so a change of week is a
 * comparison rather than a rescale.
 *
 * Bars are buttons with a roving tabindex: Left and Right step days, Home and
 * End reach the ends of the week, PageUp and PageDown change week, Enter and
 * Space select. Under reduced motion the bars still fill — a bar height is the
 * reading — on a tween, the ring holds still, and the strip commits without
 * following the finger.
 */
export function WeekStrip({
  ref,
  weeks,
  value,
  defaultValue,
  onValueChange,
  onDayChange,
  dailyBudget,
  format = defaultFormat,
  label = "Weekly spend",
  className,
}: WeekStripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const lastId = weeks[weeks.length - 1]?.id ?? "";
  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? lastId,
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const index = Math.max(
    0,
    weeks.findIndex((week) => week.id === current),
  );
  const week = weeks[index] ?? weeks[0];

  const [selected, setSelected] = React.useState<number | null>(null);
  const [focusDay, setFocusDay] = React.useState(0);
  const dayRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // An ambient loop in a hidden tab is a battery leak, so the ring stops.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // One scale for every week: a change of week must compare, not rescale.
  const ceiling = weeks.reduce(
    (top, entry) =>
      entry.days.reduce((rowTop, day) => Math.max(rowTop, day.amount), top),
    Math.max(0, dailyBudget ?? 0),
  );
  const scale = ceiling > 0 ? ceiling : 1;

  const weekTotal = week
    ? week.days.reduce((sum, day) => sum + Math.max(0, day.amount), 0)
    : 0;

  const x = useMotionValue(0);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => settle.current?.stop(), []);

  /** `direction` nudges the strip the way the week moved; 0 means the finger
   *  already carried it there and the settle below finishes the job. */
  const goTo = (nextIndex: number, direction: number) => {
    const clamped = clamp(nextIndex, 0, weeks.length - 1);
    const next = weeks[clamped];
    if (!next || next.id === current) return;
    if (!isControlled) setUncontrolled(next.id);
    onValueChange?.(next.id);
    setSelected(null);
    onDayChange?.(null, -1);
    if (!motionSafe || direction === 0) return;
    // A pressed chevron gets the same directional settle the swipe leaves.
    settle.current?.stop();
    x.set(direction * distances.step);
    settle.current = animate(x, 0, springs.snap);
  };

  const pick = (dayIndex: number) => {
    const day = week?.days[dayIndex];
    if (!day) return;
    const next = selected === dayIndex ? null : dayIndex;
    setSelected(next);
    onDayChange?.(next === null ? null : day, next === null ? -1 : dayIndex);
  };

  const focusAt = (to: number) => {
    const clamped = clamp(to, 0, (week?.days.length ?? 1) - 1);
    setFocusDay(clamped);
    dayRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, dayIndex: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAt(dayIndex + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAt(dayIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt((week?.days.length ?? 1) - 1);
        break;
      case "PageUp":
        event.preventDefault();
        goTo(index - 1, -1);
        break;
      case "PageDown":
        event.preventDefault();
        goTo(index + 1, 1);
        break;
      default:
        break;
    }
  };

  const grab = React.useRef<{ x: number; width: number } | null>(null);
  const captured = React.useRef(false);

  // A pointer that gets away — capture refused, the press released off the
  // strip — must not leave the strip parked off-centre. The strip's own
  // handler runs first and clears the grab, so this only catches strays.
  React.useEffect(() => {
    const stray = () => {
      if (!grab.current) return;
      grab.current = null;
      captured.current = false;
      settle.current?.stop();
      settle.current = animate(
        x,
        0,
        motionSafe ? springs.snap : { duration: 0 },
      );
    };
    window.addEventListener("pointerup", stray);
    window.addEventListener("pointercancel", stray);
    return () => {
      window.removeEventListener("pointerup", stray);
      window.removeEventListener("pointercancel", stray);
    };
  }, [x, motionSafe]);

  const endDrag = (event: React.PointerEvent, commit: boolean) => {
    const from = grab.current;
    grab.current = null;
    const dragged = captured.current;
    captured.current = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Already released by the browser, or never captured at all.
    }
    if (!from || !dragged) return;
    const dx = event.clientX - from.x;
    const threshold = Math.max(40, from.width * COMMIT_SHARE);
    if (commit && Math.abs(dx) > threshold) {
      goTo(index + (dx < 0 ? 1 : -1), 0);
    }
    if (!motionSafe) {
      x.set(0);
      return;
    }
    settle.current?.stop();
    settle.current = animate(x, 0, springs.snap);
  };

  const budgetShare = dailyBudget ? clamp(dailyBudget / scale, 0, 1) : null;
  const overBudget =
    dailyBudget && week
      ? week.days.filter((day) => day.amount > dailyBudget).length
      : 0;
  const stagger = cascade(week?.days.length ?? 7);
  const chosen = selected === null ? null : (week?.days[selected] ?? null);
  const readout = chosen
    ? `${chosen.label} · ${format(chosen.amount)} · ${
        weekTotal > 0 ? Math.round((chosen.amount / weekTotal) * 100) : 0
      }% of the week`
    : dailyBudget
      ? `Week ${format(weekTotal)} · budget ${format(dailyBudget)} a day`
      : `Week ${format(weekTotal)}`;

  const chevron =
    "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-2 border border-hairline-strong text-ink-2 transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div role="status" className="flex min-w-0 flex-col">
          <span id={labelId} className="truncate text-sm font-semibold">
            {week?.label ?? label}
          </span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {format(weekTotal)}
            {overBudget > 0 ? ` · ${overBudget} over budget` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            disabled={index <= 0}
            onClick={() => goTo(index - 1, -1)}
            className={chevron}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
            >
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next week"
            disabled={index >= weeks.length - 1}
            onClick={() => goTo(index + 1, 1)}
            className={chevron}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
            >
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>
      </div>

      <motion.div
        role="group"
        aria-labelledby={labelId}
        style={{ x }}
        className="relative touch-pan-y select-none"
        onPointerDown={(event) => {
          grab.current = {
            x: event.clientX,
            width: event.currentTarget.getBoundingClientRect().width,
          };
          captured.current = false;
          settle.current?.stop();
        }}
        onPointerMove={(event) => {
          const from = grab.current;
          if (!from) return;
          const dx = event.clientX - from.x;
          if (!captured.current) {
            if (Math.abs(dx) < CAPTURE_PX) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // A synthetic sweep has no live pointer to capture.
            }
            captured.current = true;
          }
          if (!motionSafe) return;
          // Resistance at the ends, so a week that does not exist feels shut.
          const atEnd = dx > 0 ? index <= 0 : index >= weeks.length - 1;
          x.set(clamp(dx * (atEnd ? 0.2 : 0.85), -MAX_PULL, MAX_PULL));
        }}
        onPointerUp={(event) => endDrag(event, true)}
        onPointerCancel={(event) => endDrag(event, false)}
      >
        <div className="flex h-28 items-stretch gap-1.5">
          {(week?.days ?? []).map((day, dayIndex) => {
            const share = clamp(Math.max(0, day.amount) / scale, 0, 1);
            const over = dailyBudget !== undefined && day.amount > dailyBudget;
            const isToday = week?.todayIndex === dayIndex;
            const isChosen = selected === dayIndex;
            return (
              <button
                key={day.label + String(dayIndex)}
                ref={(node) => {
                  dayRefs.current[dayIndex] = node;
                }}
                type="button"
                tabIndex={dayIndex === focusDay ? 0 : -1}
                aria-pressed={isChosen}
                aria-label={`${day.label}, ${format(day.amount)}${
                  over
                    ? `, over the ${format(dailyBudget ?? 0)} daily budget`
                    : ""
                }${isToday ? ", today" : ""}`}
                onFocus={() => setFocusDay(dayIndex)}
                onClick={() => pick(dayIndex)}
                onKeyDown={(event) => handleKeyDown(event, dayIndex)}
                className={cn(
                  "relative flex min-w-0 flex-1 cursor-pointer items-end rounded-2 px-1 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isChosen ? "bg-cobalt-wash" : "hover:bg-accent",
                )}
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "w-full rounded-1 transition-colors",
                    over ? "bg-warn" : "bg-cobalt-bright",
                    !isChosen && !over && "opacity-80",
                  )}
                  initial={{ height: "0%" }}
                  animate={{ height: `${(share * 100).toFixed(2)}%` }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: dayIndex * stagger }
                      : { duration: durations.base, ease: easings.enter }
                  }
                />
                {isToday ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2 ring-1 ring-cobalt-bright"
                    initial={false}
                    animate={{
                      opacity: motionSafe && visible ? [0.25, 0.75] : 0.6,
                    }}
                    transition={
                      motionSafe && visible
                        ? {
                            duration: PULSE_S,
                            ease: easings.move,
                            repeat: Infinity,
                            repeatType: "mirror",
                          }
                        : { duration: durations.fast }
                    }
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {budgetShare !== null ? (
          <span
            aria-hidden
            style={{ bottom: `${(budgetShare * 100).toFixed(2)}%` }}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-hairline-strong"
          />
        ) : null}
      </motion.div>

      <div className="flex items-stretch gap-1.5">
        {(week?.days ?? []).map((day, dayIndex) => (
          <span
            key={day.label + String(dayIndex)}
            aria-hidden
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] font-medium",
              selected === dayIndex ? "text-foreground" : "text-ink-3",
            )}
          >
            {day.label}
            <span
              className={cn(
                "size-1 rounded-full",
                week?.todayIndex === dayIndex
                  ? "bg-cobalt-bright"
                  : "bg-transparent",
              )}
            />
          </span>
        ))}
      </div>

      <div className="flex items-center border-t border-hairline pt-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={readout}
            className="font-mono text-[11px] text-ink-2 tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {readout}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
