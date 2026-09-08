"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScheduledBill = {
  id: string;
  label: string;
  /** Day of the month the money leaves, 1-based. */
  day: number;
  amount: number;
};

export type ForecastLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Actual closing balances for day 1 through today, in order. */
  history: number[];
  /** Future outflows the forecast may include. @default [] */
  bills?: ScheduledBill[];
  /** Controlled ids of the bills currently in the plan. */
  enabled?: string[];
  /** Initial plan for uncontrolled usage. @default every bill */
  defaultEnabled?: string[];
  /** Fires from the click or key that toggled a bill. */
  onEnabledChange?: (ids: string[]) => void;
  /** Fires from the same event with the newly priced projection. */
  onProjectionChange?: (projection: BalanceProjection) => void;
  /** Days on the x axis. @default 30 */
  days?: number;
  /** Average daily spend carried through the forecast. @default 0 */
  dailyBurn?: number;
  /** Formats every money figure. */
  format?: (value: number) => string;
  /** Plot height in px; the width is fluid. @default 132 */
  height?: number;
  /** Names the chart; printed above it. @default "Balance forecast" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, which is a
 * hydration mismatch on the figure the chart exists to project.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Fixed viewBox width — the plot scales to its container via `w-full`. */
const VIEW_W = 300;

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Attributes are rounded before they are written: a server and a browser can
 *  differ in the last digits of a division, and a differing attribute is a
 *  hydration error. */
const round = (value: number) => Number(value.toFixed(2));

export type BalanceProjection = {
  /** One point per day from today to the end of the axis. */
  points: { day: number; value: number }[];
  /** The balance on the last day of the axis. */
  closing: number;
  /** The first day the balance goes below zero, or null if it never does. */
  shortDay: number | null;
};

/**
 * Walks the plan forward from the last actual balance. Pure and exported, so a
 * host can price a plan — for a summary line, a warning, a saved scenario —
 * without mounting a second chart to ask.
 */
export function projectBalance(
  history: number[],
  bills: ScheduledBill[],
  enabled: Set<string>,
  days: number,
  dailyBurn: number,
): BalanceProjection {
  const today = history.length;
  let balance = history[today - 1] ?? 0;
  const points = [{ day: today, value: balance }];
  let shortDay: number | null = null;
  for (let day = today + 1; day <= days; day += 1) {
    balance -= dailyBurn;
    for (const bill of bills) {
      if (bill.day === day && enabled.has(bill.id)) balance -= bill.amount;
    }
    if (shortDay === null && balance < 0) shortDay = day;
    points.push({ day, value: balance });
  }
  return { points, closing: balance, shortDay };
}

/**
 * Where the balance is heading. Everything up to today is a solid stroke of what
 * happened; everything past it is the same stroke dashed, because a forecast is
 * a claim and should not be drawn like a fact.
 *
 * Toggling a scheduled bill re-prices the plan and the dashed half draws itself
 * again: a clip rectangle sweeps open from today's dot to the end of the month
 * on `glide`, which is what lets the line keep its dashes — animating
 * `pathLength` would have taken `strokeDasharray` over for its own reveal. The
 * closing figure counts to its new value through a motion value on `snap`, and
 * today's dot holds a slow `drift` breath, reversing between two keyframes, so
 * the eye finds the seam between fact and forecast without anything flashing. A
 * projection that crosses zero shades the band below the axis and marks the day
 * it happens in `danger`.
 *
 * Every bill is a real `switch` in the tab order, and the plot is a `role="img"`
 * whose label reads the projection as a sentence; a polite status announces each
 * new closing balance once per toggle rather than once per frame. Under reduced
 * motion the forecast swaps rather than sweeps and the dot does not breathe, but
 * the line still moves where the money moves it.
 */
export function ForecastLine({
  ref,
  history,
  bills = [],
  enabled,
  defaultEnabled,
  onEnabledChange,
  onProjectionChange,
  days = 30,
  dailyBurn = 0,
  format = (value) => money.format(value),
  height = 132,
  label = "Balance forecast",
  className,
}: ForecastLineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const clipId = `${safeId(baseId)}-forecast-clip`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultEnabled ?? bills.map((bill) => bill.id),
  );
  const isControlled = enabled !== undefined;
  const on = isControlled ? enabled : uncontrolled;
  const onSet = React.useMemo(() => new Set(on), [on]);

  const today = Math.max(1, history.length);
  const span = Math.max(days, today);
  const forecast = projectBalance(history, bills, onSet, span, dailyBurn);

  const actual = history.map((value, index) => ({
    day: index + 1,
    value,
  }));
  const values = [...history, ...forecast.points.map((point) => point.value)];
  const hi = Math.max(...values, 0);
  const lo = Math.min(...values, 0);
  const pad = (hi - lo) * 0.1 || 1;
  const top = hi + pad;
  const bottom = lo - pad;

  const x = (day: number) =>
    round(((day - 1) / Math.max(1, span - 1)) * VIEW_W);
  const y = (value: number) => round(((top - value) / (top - bottom)) * height);
  const toPath = (points: { day: number; value: number }[]) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${x(point.day)} ${y(point.value)}`,
      )
      .join(" ");

  const zeroY = y(0);
  const todayX = x(today);
  const todayValue = history[today - 1] ?? 0;

  // Re-keys the wipe: a new plan is a new drawing, not a tween of the old one.
  const signature = `${on.slice().sort().join("|")}:${history.length}:${dailyBurn}`;

  const closing = useMotionValue(forecast.closing);
  const closingText = useTransform(closing, (value) =>
    format(Math.round(value)),
  );
  React.useEffect(() => {
    if (!motionSafe) {
      closing.set(forecast.closing);
      return;
    }
    const controls = animate(closing, forecast.closing, springs.snap);
    return () => controls.stop();
  }, [closing, forecast.closing, motionSafe]);

  const toggle = (id: string) => {
    const next = onSet.has(id)
      ? on.filter((entry) => entry !== id)
      : [...on, id];
    if (!isControlled) setUncontrolled(next);
    onEnabledChange?.(next);
    // Priced from the event that caused it, so the parent never has to wait a
    // render to learn what the plan now costs.
    onProjectionChange?.(
      projectBalance(history, bills, new Set(next), span, dailyBurn),
    );
  };

  const short = forecast.shortDay;
  const summary = `Balance from day 1 to day ${span}. Actual through day ${today}, ${format(
    todayValue,
  )}. ${
    short === null
      ? `Projected to close at ${format(forecast.closing)} on day ${span}.`
      : `Projected to run short on day ${short}, closing at ${format(forecast.closing)}.`
  }`;

  const drawTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Closing day {span}
          </span>
        </div>
        <motion.span
          className={cn(
            "shrink-0 font-mono text-lg leading-none font-semibold tabular-nums transition-colors",
            forecast.closing < 0 ? "text-danger" : "text-ink",
          )}
        >
          {closingText}
        </motion.span>
      </div>

      <div
        role="img"
        aria-label={summary}
        className="relative w-full overflow-hidden rounded-2 border border-hairline bg-surface-2"
        style={{ height }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          // Fixed height, fluid width: with preserveAspectRatio="none" only the
          // x axis stretches, so a horizontal rule keeps its exact weight and
          // the strokes keep theirs through vectorEffect.
          style={{ height }}
          className="absolute inset-0 w-full"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                key={signature}
                x={todayX}
                y={0}
                height={height}
                initial={{ width: motionSafe ? 0 : VIEW_W - todayX }}
                animate={{ width: VIEW_W - todayX }}
                transition={drawTransition}
              />
            </clipPath>
          </defs>

          {lo < 0 && (
            <rect
              x="0"
              y={zeroY}
              width={VIEW_W}
              height={Math.max(0, height - zeroY)}
              className="fill-current text-danger/10"
            />
          )}
          {lo < 0 && (
            <line
              x1="0"
              y1={zeroY}
              x2={VIEW_W}
              y2={zeroY}
              strokeWidth="1"
              strokeDasharray="2 3"
              className="stroke-current text-danger/50"
            />
          )}

          <path
            d={toPath(actual)}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-current text-cobalt-bright"
          />

          <AnimatePresence initial={false}>
            <motion.path
              key={signature}
              d={toPath(forecast.points)}
              clipPath={`url(#${clipId})`}
              fill="none"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={cn(
                "stroke-current",
                short === null ? "text-ink-3" : "text-danger",
              )}
              initial={{ opacity: motionSafe ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
          </AnimatePresence>
        </svg>

        {/* Markers are HTML in percentages, not SVG: a non-uniform viewBox would
            stretch a circle into an ellipse and a glyph out of shape. */}
        <span
          aria-hidden
          style={{ left: `${(todayX / VIEW_W) * 100}%` }}
          className="pointer-events-none absolute inset-y-0 w-px bg-hairline-strong"
        />
        <motion.span
          aria-hidden
          style={{
            left: `${(todayX / VIEW_W) * 100}%`,
            top: `${(y(todayValue) / height) * 100}%`,
          }}
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cobalt-bright ring-2 ring-surface-2"
          initial={false}
          // Two keyframes reversing on the slowest spring in the house: a
          // breath, not a pulse. Ambient, so it stops under reduced motion.
          animate={motionSafe ? { scale: 1.28 } : { scale: 1 }}
          transition={
            motionSafe
              ? { ...springs.drift, repeat: Infinity, repeatType: "reverse" }
              : { duration: 0 }
          }
        />
        {short !== null && (
          <span
            aria-hidden
            style={{ left: `${(x(short) / VIEW_W) * 100}%` }}
            className="pointer-events-none absolute inset-y-0 w-px bg-danger/70"
          />
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Day 1
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 bottom-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Day {span}
        </span>
      </div>

      {bills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {bills.map((bill) => {
            const checked = onSet.has(bill.id);
            return (
              <button
                key={bill.id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={`${bill.label}, ${format(bill.amount)} on day ${bill.day}`}
                onClick={() => toggle(bill.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "border-cobalt-bright/50 bg-cobalt-wash text-ink"
                    : "border-hairline-strong bg-surface-2 text-ink-3 hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors",
                    checked ? "bg-cobalt-bright" : "bg-ink-3/50",
                  )}
                />
                <span className="max-w-40 truncate">{bill.label}</span>
                <span className="shrink-0 tabular-nums">
                  d{bill.day} · {format(bill.amount)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <span className="sr-only" role="status">
        {summary}
      </span>
    </div>
  );
}
