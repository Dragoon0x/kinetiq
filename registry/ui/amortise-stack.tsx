"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AmortiseSplit = {
  /** The level payment for the period. */
  payment: number;
  /** The share of the payment that is interest. */
  interest: number;
  /** The share of the payment that reduces the balance. */
  principal: number;
  /** What is still owed after the payment. */
  balance: number;
};

export type AmortiseStackProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Amount borrowed, in major units. */
  principal: number;
  /** Annual interest rate as a percentage. */
  rate: number;
  /** Number of monthly payments. */
  periods: number;
  /** Controlled period index, 0-based. */
  value?: number;
  /** Initial period index for uncontrolled usage. @default 0 */
  defaultValue?: number;
  /** Fires from the pointer or key event that moved the cursor. */
  onValueChange?: (period: number, split: AmortiseSplit) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the chart for assistive technology. */
  label: string;
  className?: string;
};

/**
 * An explicit locale: a server and a client formatting in different locales
 * would print different strings for the same figure, which is a hydration
 * mismatch on the numbers the chart exists to show.
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

/** Page keys move a year of periods. */
const PAGE_STEP = 12;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const EMPTY_SPLIT: AmortiseSplit = {
  payment: 0,
  interest: 0,
  principal: 0,
  balance: 0,
};

/**
 * Level-payment amortisation: the payment is fixed, so each period's interest
 * is the running balance at the monthly rate and the remainder is principal.
 */
function buildSchedule(
  principal: number,
  rate: number,
  periods: number,
): AmortiseSplit[] {
  const count = Math.max(1, Math.floor(periods));
  const monthly = rate / 100 / 12;
  const payment =
    monthly === 0
      ? principal / count
      : (principal * monthly) / (1 - Math.pow(1 + monthly, -count));
  let balance = principal;
  const rows: AmortiseSplit[] = [];
  for (let index = 0; index < count; index += 1) {
    const interest = balance * monthly;
    const paid = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - paid);
    rows.push({ payment, interest, principal: paid, balance });
  }
  return rows;
}

/**
 * A figure whose digits roll to their new value on `snap`. Each column is a
 * ten-face strip moved by a percentage of its own height, so one `y` moves
 * exactly one digit. Columns are keyed from the right so the units keep their
 * identity when the figure gains or loses a digit. Hidden from assistive
 * technology: the slider's `aria-valuetext` already carries the amount.
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
 * A loan as one stacked bar per payment: interest on top, principal beneath.
 * The payment is level, so every bar stands the same height and the boundary
 * between the two shares is what moves — down, period by period, as interest
 * gives way to principal. Bars rise from the baseline on `glide` in a
 * `cascade`, so the shrinking interest wedge reads as a shape before any
 * figure is read.
 *
 * Scrubbing across the chart — hovering, dragging, or arrowing — moves the
 * cursor to a period on `snap` and re-reads its split beneath: interest,
 * principal and the balance still owed roll their digits on `snap`, and a
 * ratio bar re-proportions on `glide`. The chart is one `role="slider"` over
 * the periods: Left and Right step, Home and End jump, Page keys move a year.
 * Under reduced motion the bars stand at full height, the cursor swaps to its
 * period, and the digits swap in place.
 */
export function AmortiseStack({
  ref,
  principal,
  rate,
  periods,
  value,
  defaultValue = 0,
  onValueChange,
  format = defaultFormat,
  label,
  className,
}: AmortiseStackProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const schedule = React.useMemo(
    () => buildSchedule(principal, rate, periods),
    [principal, rate, periods],
  );
  const count = schedule.length;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const index = Math.min(
    count - 1,
    Math.max(0, isControlled ? value : uncontrolled),
  );
  const split = schedule[index] ?? EMPTY_SPLIT;

  const select = (next: number) => {
    const clamped = Math.min(count - 1, Math.max(0, next));
    const row = schedule[clamped];
    if (clamped === index || !row) return;
    if (!isControlled) setUncontrolled(clamped);
    onValueChange?.(clamped, row);
  };

  const periodAt = (clientX: number, rect: DOMRect) =>
    Math.floor(((clientX - rect.left) / rect.width) * count);

  // A press remembers where it started; the pointer is only taken once it has
  // travelled, so a click still focuses and a synthetic sweep never throws.
  const grab = React.useRef<{ x: number } | null>(null);
  const captured = React.useRef(false);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      PageUp: index + PAGE_STEP,
      PageDown: index - PAGE_STEP,
      Home: 0,
      End: count - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  const stagger = cascade(count);
  const interestShare = split.payment > 0 ? split.interest / split.payment : 0;
  const cursorLeft = `${((index + 0.5) / count) * 100}%`;

  const valueText = `Period ${index + 1} of ${count}: interest ${format(
    split.interest,
  )}, principal ${format(split.principal)}, balance ${format(split.balance)}`;

  const figures = [
    {
      key: "interest",
      name: "Interest",
      amount: split.interest,
      tone: "text-warn",
    },
    {
      key: "principal",
      name: "Principal",
      amount: split.principal,
      tone: "text-cobalt-bright",
    },
    {
      key: "balance",
      name: "Balance",
      amount: split.balance,
      tone: "text-ink",
    },
  ] as const;

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
          Period {index + 1} of {count}
        </span>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        aria-valuetext={valueText}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          grab.current = { x: event.clientX };
          captured.current = false;
          event.currentTarget.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width > 0) select(periodAt(event.clientX, rect));
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
          select(periodAt(event.clientX, rect));
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
          "relative h-28 cursor-crosshair rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <div aria-hidden className="flex h-full items-end gap-px">
          {schedule.map((row, period) => {
            const share = row.payment > 0 ? row.interest / row.payment : 0;
            const active = period === index;
            return (
              <motion.span
                key={period}
                className="flex h-full min-w-0 flex-1 origin-bottom flex-col overflow-hidden rounded-t-[2px]"
                initial={motionSafe ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.glide, delay: period * stagger }
                    : { duration: 0 }
                }
              >
                <span
                  className={cn(
                    "block w-full transition-colors",
                    active ? "bg-warn" : "bg-warn/55",
                  )}
                  style={{ height: `${share * 100}%` }}
                />
                <span
                  className={cn(
                    "block w-full flex-1 transition-colors",
                    active ? "bg-cobalt-bright" : "bg-cobalt-bright/55",
                  )}
                />
              </motion.span>
            );
          })}
        </div>

        {/* The cursor is a hairline the full height of the chart, so a period
            eight pixels wide still shows exactly where the reading is taken. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-ink"
          initial={false}
          animate={{ left: cursorLeft }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {figures.map((figure) => (
          <div key={figure.key} className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {figure.name}
            </span>
            <span
              className={cn(
                "font-mono text-sm leading-none font-medium",
                figure.tone,
              )}
            >
              <Rolling text={format(figure.amount)} motionSafe={motionSafe} />
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div
          aria-hidden
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-cobalt-bright"
        >
          <motion.span
            className="block h-full bg-warn"
            initial={false}
            animate={{ width: `${interestShare * 100}%` }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-warn"
            />
            Interest
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-cobalt-bright"
            />
            Principal
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">
            {format(split.payment)} / mo
          </span>
        </div>
      </div>
    </div>
  );
}
