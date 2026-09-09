"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GraceTimerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Length of the grace period in days. */
  days: number;
  /** Days already elapsed when the timer mounts. @default 0 */
  daysUsed?: number;
  /** Runs the drain; false holds it where it stands. @default false */
  running?: boolean;
  /** Real seconds per simulated day. @default 1 */
  secondsPerDay?: number;
  /** Days remaining at which the bar turns warn. @default 5 */
  warnDays?: number;
  /** Controlled paid state. */
  paid?: boolean;
  /** Initial paid state for uncontrolled usage. @default false */
  defaultPaid?: boolean;
  /** Fires from the Pay press. */
  onPaidChange?: (paid: boolean) => void;
  /** Fires from the tick that crossed into a new day. */
  onDaysChange?: (daysLeft: number) => void;
  /** Fires from the tick that reached zero. */
  onExpire?: () => void;
  /** The statement balance the Pay button settles. */
  amount: number;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the timer. */
  label: string;
  className?: string;
};

/**
 * An explicit locale: a server and a client formatting in different locales
 * print different strings for the same figure — a hydration mismatch.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the drain. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Whole days left for a fraction of the period, never rounding a sliver up to a full day. */
const daysFor = (fraction: number, days: number) =>
  Math.max(0, Math.ceil(fraction * days - 1e-6));

/**
 * Digits that roll to their new value on `snap`; each column is a ten-face
 * strip moved by a percentage of its own height, keyed from the right. Hidden
 * from assistive technology — the meter's `aria-valuetext` carries the count.
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
 * A grace period as a bar that drains. The remainder lives in one motion value
 * animated linearly from where it stands to zero — at `secondsPerDay` a day —
 * only while `running` and the document is visible, so a hidden tab never
 * loses days it did not show. The bar reads that value directly; the day
 * figure steps down on `snap` from the tick that crosses a boundary, never
 * from render. Inside the last `warnDays` the bar and figure turn warn; at
 * zero the bar is empty, the figure turns danger and interest applies.
 *
 * Pay stops the drain where it stands: the remainder turns success and a PAID
 * seal stamps into the figure's place on `recoil`, from 1.4× with the two
 * bounces of a stamp meeting paper. The bar is a `role="meter"` of days left,
 * Pay is a real button, and a status line announces the warn window, expiry
 * and payment — not every day. Under reduced motion the bar still drains (a
 * countdown is information), the figure swaps, and the seal simply appears.
 */
export function GraceTimer({
  ref,
  days,
  daysUsed = 0,
  running = false,
  secondsPerDay = 1,
  warnDays = 5,
  paid,
  defaultPaid = false,
  onPaidChange,
  onDaysChange,
  onExpire,
  amount,
  format = defaultFormat,
  label,
  className,
}: GraceTimerProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const total = Math.max(1, days);
  const startFraction = Math.min(1, Math.max(0, 1 - daysUsed / total));

  const [uncontrolledPaid, setUncontrolledPaid] = React.useState(defaultPaid);
  const isPaid = paid ?? uncontrolledPaid;

  const remaining = useMotionValue(startFraction);
  const [daysLeft, setDaysLeft] = React.useState(() =>
    daysFor(startFraction, total),
  );
  const [expired, setExpired] = React.useState(startFraction <= 0);

  // Nothing drains in a hidden tab; the listener, not the effect body, writes.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const daysRef = useLatest(onDaysChange);
  const expireRef = useLatest(onExpire);
  // The tick compares against a mirror of the last reported count so a
  // re-render between frames cannot hand it a stale closure.
  const lastRef = React.useRef(daysLeft);

  React.useEffect(() => {
    if (!running || !visible || isPaid || expired) return;
    const left = remaining.get();
    if (left <= 0) return;
    const controls = animate(remaining, 0, {
      duration: left * total * secondsPerDay,
      ease: easings.linear,
      onUpdate: (value) => {
        const count = daysFor(value, total);
        if (count === lastRef.current) return;
        lastRef.current = count;
        setDaysLeft(count);
        daysRef.current?.(count);
      },
      onComplete: () => {
        setExpired(true);
        expireRef.current?.();
      },
    });
    return () => controls.stop();
  }, [
    running,
    visible,
    isPaid,
    expired,
    remaining,
    total,
    secondsPerDay,
    daysRef,
    expireRef,
  ]);

  const pay = () => {
    if (isPaid || expired) return;
    if (paid === undefined) setUncontrolledPaid(true);
    onPaidChange?.(true);
  };

  const warn = !isPaid && !expired && daysLeft <= warnDays;
  const tone = isPaid
    ? "bg-success"
    : expired
      ? "bg-danger"
      : warn
        ? "bg-warn"
        : "bg-cobalt-bright";
  const figureTone = isPaid
    ? "text-success"
    : expired
      ? "text-danger"
      : warn
        ? "text-warn"
        : "text-ink";

  const valueText = isPaid
    ? `Paid with ${daysLeft} days left`
    : expired
      ? "Grace period over, interest applies"
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  const announce = isPaid
    ? `Paid. Grace period stopped with ${daysLeft} days left.`
    : expired
      ? "Grace period over. Interest now applies."
      : warn
        ? `Last ${warnDays} days of the grace period.`
        : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="truncate text-xs text-ink-3">
            {expired ? "Interest now applies" : "Grace period"}
          </span>
        </span>

        {/* The figure and the seal share one cell: the seal stamps exactly
            where the count was, and the row never changes height. */}
        <span className="grid shrink-0 justify-items-end">
          <motion.span
            aria-hidden={isPaid}
            className={cn(
              "col-start-1 row-start-1 flex items-baseline gap-1 font-mono transition-colors",
              figureTone,
            )}
            initial={false}
            animate={{ opacity: isPaid ? 0 : 1 }}
            transition={fade}
          >
            <span className="text-2xl leading-none font-medium">
              <Rolling text={String(daysLeft)} motionSafe={motionSafe} />
            </span>
            <span className="text-[11px] text-ink-3">
              {expired ? "days" : daysLeft === 1 ? "day left" : "days left"}
            </span>
          </motion.span>

          {/* initial={false}: a timer that mounts already paid shows its
              seal; it does not stamp at a viewer who paid nothing just now. */}
          <AnimatePresence initial={false}>
            {isPaid ? (
              <motion.span
                key="seal"
                aria-hidden
                className="col-start-1 row-start-1 flex h-7 items-center self-center rounded-1 border-2 border-success px-2 font-mono text-xs font-bold tracking-[0.16em] text-success uppercase"
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 1.4, rotate: -8 }
                    : { opacity: 0, rotate: -8 }
                }
                animate={{ opacity: 1, scale: 1, rotate: -8 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.blink },
                      }
                    : fade
                }
              >
                Paid
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={daysLeft}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-hairline-strong"
      >
        <motion.span
          aria-hidden
          className={cn(
            "block h-full w-full rounded-full transition-colors",
            tone,
          )}
          style={{ scaleX: remaining, originX: 0 }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs text-ink-2 tabular-nums">
          Statement {format(amount)}
        </span>
        <button
          type="button"
          disabled={isPaid || expired}
          onClick={pay}
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center rounded-2 px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:pointer-events-none",
            isPaid
              ? "bg-success/15 text-success"
              : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {isPaid ? "Paid" : `Pay ${format(amount)}`}
        </button>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
