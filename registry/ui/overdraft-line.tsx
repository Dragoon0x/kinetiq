"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OverdraftReading = {
  /** The end-of-day balance; negative when overdrawn. */
  balance: number;
  /** How far below zero the balance sits, as a positive amount. */
  overdrawn: number;
  /** Fees accrued through this day. */
  fee: number;
};

export type OverdraftLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** End-of-day balances in major units, oldest first. Negative is overdrawn. */
  points: number[];
  /** The overdraft limit as a positive amount — the band's floor. */
  limit: number;
  /** Annual rate charged on the overdrawn amount, as a percentage, accrued daily. @default 19.9 */
  feeRate?: number;
  /** Controlled count of days revealed, 1..points.length. */
  day?: number;
  /** Initial count of days revealed for uncontrolled usage. @default 1 */
  defaultDay?: number;
  /** Fires from the pointer or key event that moved the day. */
  onDayChange?: (day: number, reading: OverdraftReading) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the chart for assistive technology. */
  label: string;
  className?: string;
};

/**
 * An explicit locale: a server and a client formatting in different locales
 * would print different strings for the same figure — a hydration mismatch on
 * the one number the chart exists to show.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

/** Pointer travel before a drag takes the pointer; a plain click never does. */
const CAPTURE_PX = 4;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Hatching marks the band as a place, not a value — it survives both themes. */
const HATCH =
  "repeating-linear-gradient(-45deg, var(--hairline-strong) 0 1px, transparent 1px 5px)";

/** Chart coordinates are rounded so the server and the browser print one string. */
const round = (value: number) => Number(value.toFixed(3));

/**
 * The reading for a day: its balance, how far below zero it sits, and the fees
 * accrued through it — each overdrawn day charging the overdrawn amount at
 * `feeRate` per year over 365. Exported so a host can print the same figures
 * the chart shows without waiting for an event.
 */
export function readOverdraft(
  points: number[],
  day: number,
  feeRate = 19.9,
): OverdraftReading {
  const at = Math.min(points.length, Math.max(1, day)) - 1;
  let fee = 0;
  for (let index = 0; index <= at; index += 1) {
    const value = points[index] ?? 0;
    if (value < 0) fee += (-value * feeRate) / 100 / 365;
  }
  const balance = points[at] ?? 0;
  return { balance, overdrawn: Math.max(0, -balance), fee };
}

/**
 * A figure whose digits roll to their new value on `snap`: each column is a
 * ten-face strip moved by a percentage of its own height, keyed from the right
 * so the units keep their identity when the figure changes length. Hidden from
 * assistive technology — the slider's `aria-valuetext` carries the amounts.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
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
 * A balance line over a chart whose zero sits well above the floor. The space
 * between zero and the overdraft limit is the band: hatched and quiet until the
 * line enters it. The series is revealed up to the chosen day by a clip whose
 * right edge glides to that day's x, so scrubbing forward draws the line on and
 * scrubbing back retracts it. Below zero the line turns danger and a red fill
 * drops from the zero line to the day's depth on `glide` — as far as the
 * balance goes, never past the limit. The balance and the fee accrued through
 * that day roll their digits on `snap`.
 *
 * The chart is a `role="slider"` over the days: Left and Right step, Home and
 * End jump, and hovering or dragging scrubs. Under reduced motion the clip,
 * the fill and the marker jump to their positions and the digits swap.
 */
export function OverdraftLine({
  ref,
  points,
  limit,
  feeRate = 19.9,
  day,
  defaultDay = 1,
  onDayChange,
  format = defaultFormat,
  label,
  className,
}: OverdraftLineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const belowId = `${baseId}-below`;

  const count = Math.max(1, points.length);
  const floor = Math.max(1, Math.abs(limit));

  const chart = React.useMemo(() => {
    const peak = Math.max(0, ...points);
    // Headroom above the highest balance, or a band's worth when there is none.
    const top = peak > 0 ? peak * 1.15 : floor;
    const span = top + floor;
    const y = (value: number) =>
      round(((top - Math.max(-floor, value)) / span) * 100);
    const xs = points.map((_, index) =>
      round(count === 1 ? 50 : (index / (count - 1)) * 100),
    );
    const path = points
      .map(
        (value, index) => `${index === 0 ? "M" : "L"}${xs[index]} ${y(value)}`,
      )
      .join(" ");
    return { zero: y(0), xs, ys: points.map(y), path };
  }, [points, floor, count]);

  const [uncontrolled, setUncontrolled] = React.useState(defaultDay);
  const isControlled = day !== undefined;
  const current = Math.min(
    count,
    Math.max(1, isControlled ? day : uncontrolled),
  );
  const index = current - 1;

  const { balance, overdrawn, fee } = readOverdraft(points, current, feeRate);

  const select = (next: number) => {
    const clamped = Math.min(count, Math.max(1, next));
    if (clamped === current) return;
    if (!isControlled) setUncontrolled(clamped);
    onDayChange?.(clamped, readOverdraft(points, clamped, feeRate));
  };

  const dayAt = (clientX: number, rect: DOMRect) =>
    Math.round(((clientX - rect.left) / rect.width) * (count - 1)) + 1;

  // A press remembers where it started; the pointer is taken only after it
  // has travelled, so a click still focuses and a synthetic sweep never throws.
  const grab = React.useRef<{ x: number } | null>(null);
  const captured = React.useRef(false);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      Home: 1,
      End: count,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  const x = chart.xs[index] ?? 50;
  const y = chart.ys[index] ?? chart.zero;
  const depth = Math.max(0, y - chart.zero);
  const below = balance < 0;

  const fill = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  const valueText = `Day ${current} of ${count}: balance ${format(balance)}${
    below ? `, overdrawn by ${format(overdrawn)}` : ""
  }, fee accrued ${format(fee)}`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          Day {current} of {count}
        </span>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={current}
        aria-valuetext={valueText}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          grab.current = { x: event.clientX };
          captured.current = false;
          event.currentTarget.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width > 0) select(dayAt(event.clientX, rect));
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const from = grab.current;
          if (from && !captured.current) {
            if (Math.abs(event.clientX - from.x) >= CAPTURE_PX) {
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // A synthetic sweep has no live pointer to hold; the scrub
                // still follows it while it stays over the chart.
              }
              captured.current = true;
            }
          }
          select(dayAt(event.clientX, rect));
        }}
        onPointerUp={(event) => {
          if (!grab.current) return;
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Already released by the browser; nothing left to give back.
          }
          grab.current = null;
          captured.current = false;
        }}
        onPointerCancel={() => {
          grab.current = null;
          captured.current = false;
        }}
        style={{ touchAction: "pan-y" }}
        className={cn(
          "relative h-32 cursor-crosshair overflow-hidden rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {/* The band and its fill are HTML rather than SVG: the SVG is stretched
            to the box, and a hatch or a stroke drawn inside it would stretch
            with it. Percent geometry keeps both true at any width. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0"
          style={{ top: `${chart.zero}%`, backgroundImage: HATCH }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bg-danger/25"
          style={{ top: `${chart.zero}%` }}
          initial={false}
          animate={{ height: `${depth}%` }}
          transition={fill}
        />
        <span
          aria-hidden
          className="absolute right-1.5 bottom-0.5 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          Limit {format(-floor)}
        </span>

        <motion.div
          aria-hidden
          className="absolute inset-0"
          initial={false}
          animate={{ clipPath: `inset(0% ${100 - x}% 0% 0%)` }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="size-full overflow-visible"
          >
            <defs>
              <clipPath id={belowId}>
                <rect
                  x="0"
                  y={chart.zero}
                  width="100"
                  height={round(100 - chart.zero)}
                />
              </clipPath>
            </defs>
            <path
              d={chart.path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-cobalt-bright"
            />
            <path
              d={chart.path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${belowId})`}
              className="text-danger"
            />
          </svg>
        </motion.div>

        <span
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-hairline-strong"
          style={{ top: `${chart.zero}%` }}
        />

        <motion.span
          aria-hidden
          className={cn(
            "absolute size-2.5 rounded-full border-2 border-surface-1 transition-colors",
            below ? "bg-danger" : "bg-cobalt-bright",
          )}
          initial={false}
          animate={{ left: `${x}%`, top: `${y}%`, x: "-50%", y: "-50%" }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Balance
          </span>
          <span
            className={cn(
              "font-mono text-sm leading-none font-medium transition-colors",
              below ? "text-danger" : "text-ink",
            )}
          >
            <Rolling text={format(balance)} motionSafe={motionSafe} />
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Overdrawn
          </span>
          <span className="font-mono text-sm leading-none font-medium text-ink">
            <Rolling text={format(overdrawn)} motionSafe={motionSafe} />
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fee
          </span>
          <span
            className={cn(
              "font-mono text-sm leading-none font-medium transition-colors",
              fee > 0 ? "text-warn" : "text-ink",
            )}
          >
            <Rolling text={format(fee)} motionSafe={motionSafe} />
          </span>
        </div>
      </div>

      {/* Announces the crossing, not every day: the slider's valuetext already
          reads each day's figures, and a reader scrubbing quickly should hear
          "below zero" once rather than a fee per pointer move. */}
      <span className="sr-only" role="status">
        {below ? "Below zero" : ""}
      </span>
    </div>
  );
}
