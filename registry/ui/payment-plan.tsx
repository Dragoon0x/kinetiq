"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PaymentCadence = "weekly" | "fortnightly" | "monthly";

export type PaymentPlanProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The amount to split, in major units. */
  total: number;
  /** Controlled instalment count. */
  value?: number;
  /** Initial count for uncontrolled use. @default 3 */
  defaultValue?: number;
  /** Fires from the drag, click or key that changed the count. */
  onValueChange?: (count: number) => void;
  /** Fewest instalments. @default 2 */
  min?: number;
  /** Most instalments. @default 12 */
  max?: number;
  /** Spacing of the instalments. @default "monthly" */
  cadence?: PaymentCadence;
  /** Fraction of the total added as a plan fee. @default 0 */
  feeRate?: number;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the slider and the plan. @default "Payment plan" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure the whole control exists to show.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Travel before a press becomes a drag, so a plain click still lands. */
const SLOP = 4;

const CADENCE: Record<
  PaymentCadence,
  { each: string; unit: string; step: number }
> = {
  weekly: { each: "a week", unit: "week", step: 1 },
  fortnightly: { each: "a fortnight", unit: "week", step: 2 },
  monthly: { each: "a month", unit: "month", step: 1 },
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * A figure whose digit columns roll to their new value on `snap` — one crisp
 * overshoot, the physics of any indicator moving to a new position. Each column
 * is a ten-face strip translated by a percentage of its own height, and `1ch` in
 * a monospaced face is exactly a digit wide, so the figure can gain a column
 * without shifting what sits beside it.
 */
function RollingFigure({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = FACES.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {FACES.map((face) => (
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

/**
 * One instalment. Its height comes from a ResizeObserver on the content — which
 * fires on observe, before paint — so a row that arrives opens to a real number
 * and a row that goes closes from one, and nothing is reserved for rows the plan
 * may never have.
 */
function PlanRow({
  index,
  when,
  amountText,
  spoken,
  delay,
  motionSafe,
}: {
  index: number;
  when: string;
  amountText: string;
  spoken: string;
  delay: number;
  motionSafe: boolean;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.li
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: measured || "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: motionSafe
          ? exitFor(durations.base)
          : { duration: durations.fast, ease: easings.exit },
      }}
      transition={
        motionSafe ? { ...springs.glide, delay } : { duration: 0, delay: 0 }
      }
    >
      <div
        ref={innerRef}
        className="flex items-center gap-3 border-t border-hairline py-2"
      >
        <span className="sr-only">{spoken}</span>
        <span
          aria-hidden
          className="w-5 shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate text-xs text-ink-2"
        >
          {when}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-xs text-foreground tabular-nums"
        >
          {amountText}
        </span>
      </div>
    </motion.li>
  );
}

/**
 * A total, a slider, and the plan it makes.
 *
 * The knob glides between whole instalment counts on `snap` — a control moving
 * to a chosen stop, one crisp overshoot — and the rail and stop ticks follow it.
 * Changing the count rebuilds the plan: surviving rows hold their place, new
 * rows open from a measured height in a `cascade()` on `glide`, and rows that
 * leave close on the exit ease. The headline figure rolls its digit columns on
 * `snap`, because the per-payment number is the answer the slider is asked for.
 *
 * The split is done in whole cents — the charge is divided down and the
 * remainder handed to the earliest instalments — so the rows always sum to the
 * charge exactly and the first payment may be a cent or two larger, which the
 * caption says out loud rather than hiding. Dragging captures the pointer only
 * after 4px, inside a try/catch, so a plain click still lands on the stop it hit
 * and a synthetic sweep cannot throw. It is a real `role="slider"`: arrows step,
 * Page keys move by three, Home and End take the ends, and the announcement
 * holds during a drag so it catches up rather than babbling. Under reduced
 * motion the knob and rows move without spring and the digits swap in place.
 */
export function PaymentPlan({
  ref,
  total,
  value,
  defaultValue = 3,
  onValueChange,
  min = 2,
  max = 12,
  cadence = "monthly",
  feeRate = 0,
  format = defaultFormat,
  label = "Payment plan",
  className,
}: PaymentPlanProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const low = Math.max(1, Math.round(min));
  const high = Math.max(low, Math.round(max));

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    clamp(Math.round(defaultValue), low, high),
  );
  const isControlled = value !== undefined;
  const count = clamp(
    Math.round(isControlled ? value : uncontrolled),
    low,
    high,
  );

  const knobRef = React.useRef<HTMLSpanElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // Where the last rebuild started, so a row arriving at the end of a long jump
  // waits its turn while a single added row does not wait at all.
  const [anchor, setAnchor] = React.useState({ count, from: count });
  if (anchor.count !== count) {
    setAnchor({ count, from: Math.min(anchor.count, count) });
  }

  const commit = (next: number) => {
    const settled = clamp(Math.round(next), low, high);
    if (settled === count) return;
    if (!isControlled) setUncontrolled(settled);
    onValueChange?.(settled);
  };

  const countFromClientX = (clientX: number) => {
    const rect =
      gesture.current?.rect ?? trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return count;
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return low + fraction * (high - low);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
      rect,
    };
    setDragging(true);
    knobRef.current?.focus();
    commit(countFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(countFromClientX(event.clientX));
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : event.key === "PageUp"
            ? 3
            : event.key === "PageDown"
              ? -3
              : 0;
    const next =
      step !== 0
        ? count + step
        : event.key === "Home"
          ? low
          : event.key === "End"
            ? high
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  // Whole cents, so the rows sum to the charge exactly and no rounding is left
  // to float away between the plan and the till.
  const totalCents = Math.round(Math.max(0, total) * 100);
  const feeCents = Math.round(totalCents * Math.max(0, feeRate));
  const chargedCents = totalCents + feeCents;
  const baseCents = Math.floor(chargedCents / count);
  const extra = chargedCents - baseCents * count;

  const centsAt = (index: number) => baseCents + (index < extra ? 1 : 0);
  const firstText = format(centsAt(0) / 100);
  const restText = format(baseCents / 100);
  const each = CADENCE[cadence];

  const whenAt = (index: number) => {
    if (index === 0) return "Today";
    const amount = index * each.step;
    return `In ${amount} ${each.unit}${amount === 1 ? "" : "s"}`;
  };

  const fraction = high === low ? 1 : (count - low) / (high - low);
  const percent = `${(fraction * 100).toFixed(3)}%`;
  const stagger = cascade(count);
  const rows = Array.from({ length: count }, (_, index) => index);

  const valueText = `${count} payments of ${firstText} ${each.each}`;
  // A live region that changed on every frame of a drag would babble, so the
  // announcement holds at the last settled plan and catches up on release.
  const [announced, setAnnounced] = React.useState(valueText);
  if (!dragging && announced !== valueText) setAnnounced(valueText);

  const knobTransition = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.snap
      : { duration: 0 };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            id={labelId}
            className="block truncate text-sm font-semibold text-foreground"
          >
            {label}
          </span>
          {/* The slider's aria-valuetext and the live region below already say
              the plan out loud; the figure is the same sentence in glyphs. */}
          <span
            aria-hidden
            className="mt-1 block font-mono text-2xl leading-none font-medium text-foreground"
          >
            <RollingFigure text={firstText} motionSafe={motionSafe} />
          </span>
          <span aria-hidden className="mt-1 block text-[11px] text-ink-3">
            {extra > 0
              ? `First payment, then ${restText} × ${count - 1}`
              : `${count} payments ${each.each}`}
          </span>
        </div>
        <div aria-hidden className="shrink-0 text-right">
          <span className="block font-mono text-sm text-foreground tabular-nums">
            {format(chargedCents / 100)}
          </span>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {feeCents > 0 ? "Charged" : "Total"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* The rail is inset by half a knob, and the knob is positioned inside
            the rail, so the end stops cannot overhang the column at 342px. */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          className="relative flex h-6 cursor-pointer touch-none items-center px-2"
        >
          <span
            ref={trackRef}
            className="relative h-1.5 w-full rounded-full bg-hairline-strong"
          >
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ width: percent }}
              transition={knobTransition}
            />
            {stopsBetween(low, high).map((stop, index, all) => {
              const at = all.length === 1 ? 0 : index / (all.length - 1);
              return (
                <span
                  key={stop}
                  aria-hidden
                  style={{ left: `${(at * 100).toFixed(3)}%` }}
                  className={cn(
                    "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
                    stop <= count ? "bg-cobalt-wash" : "bg-ink-3/40",
                  )}
                />
              );
            })}

            <motion.span
              className="pointer-events-none absolute top-1/2 left-0"
              initial={false}
              animate={{ left: percent }}
              transition={knobTransition}
            >
              <span
                ref={knobRef}
                role="slider"
                tabIndex={0}
                aria-labelledby={labelId}
                aria-orientation="horizontal"
                aria-valuemin={low}
                aria-valuemax={high}
                aria-valuenow={count}
                aria-valuetext={valueText}
                onKeyDown={handleKeyDown}
                className={cn(
                  "pointer-events-auto block size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-cobalt-bright bg-background outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              />
            </motion.span>
          </span>
        </div>

        <div
          aria-hidden
          className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span>{low} payments</span>
          <span className="text-signal">{count}×</span>
          <span>{high} payments</span>
        </div>
      </div>

      <ol aria-labelledby={labelId} className="flex flex-col">
        {/* `initial={false}` so the opening plan does not deal itself out on
            mount; a row added by a later change still arrives. */}
        <AnimatePresence initial={false}>
          {rows.map((index) => (
            <PlanRow
              key={index}
              index={index}
              when={whenAt(index)}
              amountText={format(centsAt(index) / 100)}
              spoken={`Payment ${index + 1} of ${count}, ${whenAt(index).toLowerCase()}, ${format(centsAt(index) / 100)}`}
              delay={Math.max(0, index - anchor.from) * stagger}
              motionSafe={motionSafe}
            />
          ))}
        </AnimatePresence>
      </ol>

      {feeCents > 0 ? (
        <dl className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2.5">
          <dt className="text-xs text-ink-3">
            Plan fee {Number((feeRate * 100).toFixed(2))}%
          </dt>
          <dd className="font-mono text-xs text-ink-2 tabular-nums">
            {format(feeCents / 100)}
          </dd>
        </dl>
      ) : null}

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}

/** The stop ticks: one per whole instalment count the slider can land on. */
function stopsBetween(low: number, high: number) {
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}
