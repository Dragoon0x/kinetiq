"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ProrationBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** First day of the billing period, `YYYY-MM-DD`. */
  periodStart: string;
  /** The day the next period begins, `YYYY-MM-DD`. */
  periodEnd: string;
  /** The period's charge in major units. */
  price: number;
  /** Controlled days used. */
  value?: number;
  /** Initial days used for uncontrolled usage. @default half the period */
  defaultValue?: number;
  /** Fires from the pointer, key or click that moved the split. */
  onValueChange?: (daysUsed: number) => void;
  /** Formats both figures. */
  format?: (value: number) => string;
  /** Names the slider. @default "Plan change" */
  label?: string;
  /** @default "Used" */
  usedLabel?: string;
  /** @default "Credit" */
  creditLabel?: string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DAY_MS = 86_400_000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const DIGITS = "0123456789";
/** Pixels a press may wander before it becomes a drag. */
const SLOP = 4;
/** Unused days come back as credit: drawn as well as coloured. */
const HATCH =
  "repeating-linear-gradient(135deg, var(--hairline-strong) 0 2px, transparent 2px 7px)";

/** Days since the epoch for a `YYYY-MM-DD` string, in UTC — no clock, no zone. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : 0;
}

/** "Sep 12" for the day `offset` days after `periodStart`. */
export function dayLabel(periodStart: string, offset: number): string {
  const date = new Date((dayNumber(periodStart) + offset) * DAY_MS);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** Length of the period in days, never less than one. */
export function periodDays(periodStart: string, periodEnd: string): number {
  return Math.max(1, dayNumber(periodEnd) - dayNumber(periodStart));
}

/** Splits the price in whole cents so used + credit is always exactly the price. */
export function prorate(
  price: number,
  daysUsed: number,
  days: number,
): { used: number; credit: number } {
  const cents = Math.round(price * 100);
  const used = Math.round((cents * daysUsed) / Math.max(1, days));
  return { used: used / 100, credit: (cents - used) / 100 };
}

const clamp = (value: number, max: number) =>
  Math.min(max, Math.max(0, Math.round(value)));

/**
 * A figure whose digit columns roll on `glide` with a right-first cascade.
 * Columns are keyed from the right and exactly `1ch` wide, so a change never
 * shifts layout. Hidden from assistive technology; the value is spoken by the
 * slider's own `aria-valuetext`.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  const stagger = cascade(chars.length);
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        const key = chars.length - index;
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: (chars.length - 1 - index) * stagger,
                    }
                  : { duration: 0 }
              }
            >
              {DIGITS.split("").map((face) => (
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
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

type Gesture = { id: number; startX: number; dragging: boolean };

/**
 * A billing period as a bar from its first day to its last. The plan-change
 * date splits it: the days before are the used portion, filled in the primary
 * colour, and the days after are the credit portion, hatched, because unused
 * days come back as credit. The split is a real slider thumb. A key press or a
 * track click slides the split on `glide` — a quantity settling, no overshoot
 * — while a drag follows the pointer directly so the handle never lags the
 * hand. The date rides the thumb, and the used and credit figures beneath roll
 * on `glide` from whole cents, so they always sum to the price. On mount the
 * used portion fills in and the hatch slides in from the far end.
 *
 * The pointer is captured only after four pixels of travel, so a plain click
 * still sets the day. Left and Right move a day, Page Up and Page Down a week,
 * Home and End reach the period's ends, and `aria-valuetext` speaks the date
 * and both figures. Under reduced motion the split tweens and the digits swap.
 */
export function ProrationBar({
  ref,
  periodStart,
  periodEnd,
  price,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  label = "Plan change",
  usedLabel = "Used",
  creditLabel = "Credit",
  className,
}: ProrationBarProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const days = periodDays(periodStart, periodEnd);

  const [ownValue, setOwnValue] = React.useState(
    () => defaultValue ?? Math.round(days / 2),
  );
  const daysUsed = clamp(value ?? ownValue, days);
  const daysCredit = days - daysUsed;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const commit = (next: number) => {
    const clamped = clamp(next, days);
    if (clamped === daysUsed) return;
    if (value === undefined) setOwnValue(clamped);
    onValueChange?.(clamped);
  };

  const dayFromClientX = (clientX: number) => {
    const node = trackRef.current;
    if (!node) return daysUsed;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return daysUsed;
    return clamp(((clientX - rect.left) / rect.width) * days, days);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gesture.current) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
    // A press on the track jumps; a press on the thumb waits for travel.
    if (!(event.target as HTMLElement).closest("[role=slider]")) {
      commit(dayFromClientX(event.clientX));
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Capture only once the press has become a drag, and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(dayFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -7,
      PageUp: 7,
    };
    const step = steps[event.key];
    const next =
      step !== undefined
        ? daysUsed + step
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? days
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const { used, credit } = prorate(price, daysUsed, days);
  const percent = (daysUsed / days) * 100;
  const changeDate = dayLabel(periodStart, daysUsed);
  const valueText = `Change on ${changeDate}: ${daysUsed} ${
    daysUsed === 1 ? "day" : "days"
  } used, ${format(used)}; ${daysCredit} ${
    daysCredit === 1 ? "day" : "days"
  } credited, ${format(credit)}`;

  // A drag tracks the hand with no physics at all; everything else glides.
  const move = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.glide
      : { duration: durations.base, ease: easings.move };

  // The date pill hugs the thumb but never leaves the track's box.
  const pillShift = percent < 14 ? "0%" : percent > 86 ? "-100%" : "-50%";
  const weeks = Array.from({ length: Math.floor((days - 1) / 7) }, (_, i) =>
    Number((((i + 1) * 7 * 100) / days).toFixed(3)),
  );

  const figures = [
    { term: usedLabel, count: daysUsed, value: used, tone: "text-ink" },
    { term: creditLabel, count: daysCredit, value: credit, tone: "text-ink-2" },
  ];

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          id={labelId}
          className="truncate text-sm font-medium text-foreground"
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {days} days · {format(price)}
        </span>
      </div>

      {/* Room above for the date pill, below for the end labels. */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="relative mt-7 mb-5 touch-none select-none"
      >
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.span
            aria-hidden
            className="absolute inset-y-0 right-0"
            style={{ backgroundImage: HATCH }}
            initial={motionSafe ? { left: "100%" } : false}
            animate={{ left: `${percent}%` }}
            transition={move}
          />
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            initial={motionSafe ? { width: "0%" } : false}
            animate={{ width: `${percent}%` }}
            transition={move}
          />
        </div>

        {weeks.map((left) => (
          <span
            key={left}
            aria-hidden
            className="absolute top-full mt-1 h-1.5 w-px -translate-x-1/2 bg-hairline-strong"
            style={{ left: `${left}%` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute top-full left-0 mt-3 font-mono text-[10px] text-ink-3"
        >
          {dayLabel(periodStart, 0)}
        </span>
        <span
          aria-hidden
          className="absolute top-full right-0 mt-3 font-mono text-[10px] text-ink-3"
        >
          {dayLabel(periodStart, days)}
        </span>

        <motion.div
          className="absolute top-1/2 h-0 w-0"
          initial={false}
          animate={{ left: `${percent}%` }}
          transition={move}
        >
          <div
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={days}
            aria-valuenow={daysUsed}
            aria-valuetext={valueText}
            aria-orientation="horizontal"
            onKeyDown={onKeyDown}
            className={cn(
              "absolute top-0 left-0 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-sm outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              dragging && "cursor-grabbing",
            )}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-3.5 left-0 rounded-full border border-hairline bg-popover px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-popover-foreground tabular-nums shadow-sm"
            initial={false}
            animate={{ x: pillShift }}
            transition={move}
          >
            {changeDate}
          </motion.span>
        </motion.div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {figures.map((figure) => (
          <div key={figure.term} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-[2px]",
                  figure.term === usedLabel
                    ? "bg-cobalt-bright"
                    : "border border-hairline-strong bg-surface-2",
                )}
                style={
                  figure.term === usedLabel
                    ? undefined
                    : { backgroundImage: HATCH }
                }
              />
              <span className="truncate">
                {figure.term} ·{" "}
                <Rolling text={String(figure.count)} motionSafe={motionSafe} />
                <span className="sr-only">{figure.count}</span>{" "}
                {figure.count === 1 ? "day" : "days"}
              </span>
            </dt>
            <dd
              className={cn(
                "font-mono text-sm font-medium tabular-nums",
                figure.tone,
              )}
            >
              <Rolling text={format(figure.value)} motionSafe={motionSafe} />
              <span className="sr-only">{format(figure.value)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
