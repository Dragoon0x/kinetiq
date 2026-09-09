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

export type RepaymentArcProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Principal plus every scheduled interest charge; the full arc. */
  total: number;
  /** Principal repaid so far; the cobalt share. */
  paidPrincipal: number;
  /** Interest paid so far; the warn share. */
  paidInterest: number;
  /** Instalments made. */
  paidCount: number;
  /** Instalments in the schedule. */
  count: number;
  /** The next due date in its own words, printed at the frontier. */
  nextDue: string;
  /** The next instalment, printed under the arc when given. */
  nextAmount?: number;
  /** Formats every amount the arc prints. */
  format?: (value: number) => string;
  /** Names the meter; printed above the arc. @default "Repayment" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the figure in the middle of the arc.
 */
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** Arc geometry in viewBox units. 240° open at the bottom, the hub sitting low
 *  so the due-date label clears the box at either end of the sweep. */
const VB_W = 168;
const VB_H = 116;
const HUB_X = 84;
const HUB_Y = 74;
const R = 50;
/** Label radius: outside the stroke with room for the text's own height. */
const LABEL_R = R + 13;
const A0 = -120;
const SWEEP = 240;

/**
 * Node and the browser can differ in the last digits of sin and cos, and a
 * mismatched attribute is a hydration error — so every trigonometric coordinate
 * is rounded before it reaches the markup.
 */
const round3 = (value: number) => Number(value.toFixed(3));
const round6 = (value: number) => Number(value.toFixed(6));

const radial = (t: number, radius: number) => {
  const angle = ((A0 + t * SWEEP) * Math.PI) / 180;
  return {
    x: round3(Math.sin(angle) * radius),
    y: round3(-Math.cos(angle) * radius),
  };
};

const ARC_PATH = (() => {
  const a = radial(0, R);
  const b = radial(1, R);
  return `M${round3(HUB_X + a.x)} ${round3(HUB_Y + a.y)}A${R} ${R} 0 1 1 ${round3(HUB_X + b.x)} ${round3(HUB_Y + b.y)}`;
})();

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A figure that counts to its new value on `glide` through a motion value, so
 * the roll runs outside React and re-renders nothing. Hidden from assistive
 * technology: the meter's `aria-valuetext` already carries every figure, once.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

/**
 * How far through the loan you are. The whole cost of the loan — principal plus
 * every scheduled interest charge — is one 240° arc, filling clockwise with what
 * has actually been repaid. The fill is two strokes on the same path: principal
 * in cobalt from the start and interest in warn continuing from where the
 * principal ends (`pathOffset` on a `pathLength={1}` path), so the split of the
 * money so far reads at a glance. Both shares are motion values animated
 * together on `glide` — a quantity accumulating, so no overshoot — and their
 * sum places the frontier: a marker riding the arc with the next due date just
 * outside it. When a payment lands the frontier travels with the fill, and the
 * date swaps to the next one only once the spring has settled, so the label
 * never names a date the arc has not yet reached.
 *
 * It is a `role="meter"` whose `aria-valuetext` reads paid of total, the split,
 * the instalment count and the next due date; nothing here takes focus. Under
 * reduced motion the shares set their lengths on a short tween — the arc still
 * fills, because how far through you are is information — and the date swaps
 * at once.
 */
export function RepaymentArc({
  ref,
  total,
  paidPrincipal,
  paidInterest,
  paidCount,
  count,
  nextDue,
  nextAmount,
  format = defaultFormat,
  label = "Repayment",
  className,
}: RepaymentArcProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  // Cents and six-figure shares: a total that came out of Math.pow can differ
  // in its last digits between the server and the browser, and an attribute
  // built from it would never hydrate cleanly.
  const cents = (value: number) => Math.round(value * 100) / 100;
  const span = total > 0 ? cents(total) : 1;
  const principal = cents(Math.max(0, paidPrincipal));
  const interest = cents(Math.max(0, paidInterest));
  const principalShare = round6(clamp(principal / span, 0, 1));
  const interestShare = round6(clamp(interest / span, 0, 1 - principalShare));
  const paid = principal + interest;
  const remaining = Math.max(0, total - paid);
  const percent = Math.round((principalShare + interestShare) * 100);

  // Seeded at the current shares rather than zero: an arc that sweeps up on
  // mount reports payments that never happened.
  const principalValue = useMotionValue(principalShare);
  const interestValue = useMotionValue(interestShare);
  const frontier = useTransform(
    [principalValue, interestValue],
    ([p, i]: number[]) => (p ?? 0) + (i ?? 0),
  );

  // The label lags the arc: it swaps only when the fill has settled, so the
  // date at the frontier is always the date the frontier has reached.
  const [shownDue, setShownDue] = React.useState(nextDue);
  const dueRef = React.useRef(nextDue);
  React.useEffect(() => {
    dueRef.current = nextDue;
  }, [nextDue]);

  React.useEffect(() => {
    if (!motionSafe) {
      principalValue.set(principalShare);
      interestValue.set(interestShare);
      return;
    }
    let pending = 2;
    const settle = () => {
      pending -= 1;
      if (pending === 0) setShownDue(dueRef.current);
    };
    const first = animate(principalValue, principalShare, {
      ...springs.glide,
      onComplete: settle,
    });
    const second = animate(interestValue, interestShare, {
      ...springs.glide,
      onComplete: settle,
    });
    return () => {
      first.stop();
      second.stop();
    };
  }, [
    motionSafe,
    principalShare,
    interestShare,
    nextDue,
    principalValue,
    interestValue,
  ]);

  const dueText = motionSafe ? shownDue : nextDue;

  const markerX = useTransform(frontier, (t) => radial(t, R).x);
  const markerY = useTransform(frontier, (t) => radial(t, R).y);
  const labelX = useTransform(frontier, (t) => radial(t, LABEL_R).x);
  const labelY = useTransform(frontier, (t) => radial(t, LABEL_R).y);

  const valueText = `${format(paid)} of ${format(total)} repaid, ${percent} percent: ${format(principal)} principal, ${format(interest)} interest. ${paidCount} of ${count} instalments made, next due ${nextDue}`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {paidCount} of {count} paid
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={cents(clamp(paid, 0, span))}
        aria-valuetext={valueText}
        className="relative w-full"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block w-full"
        >
          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="9"
          />
          <motion.path
            d={ARC_PATH}
            fill="none"
            stroke="var(--accent-bright)"
            strokeWidth="9"
            style={{ pathLength: principalValue }}
          />
          <motion.path
            d={ARC_PATH}
            fill="none"
            stroke="var(--warn)"
            strokeWidth="9"
            style={{ pathLength: interestValue, pathOffset: principalValue }}
          />

          {/* The marker and its label are groups translated from the hub, so
              one pair of motion values places each and no attribute is written
              from trigonometry during render. */}
          <motion.g style={{ x: markerX, y: markerY }}>
            <circle
              cx={HUB_X}
              cy={HUB_Y}
              r="4.4"
              fill="var(--bg-1)"
              stroke="var(--ink)"
              strokeWidth="2.2"
            />
          </motion.g>
          <motion.g style={{ x: labelX, y: labelY }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.text
                key={dueText}
                x={HUB_X}
                y={HUB_Y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6.5"
                fill="var(--ink)"
                className="font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {`Due ${dueText}`}
              </motion.text>
            </AnimatePresence>
          </motion.g>
        </svg>

        {/* Sized as a share of the arc, never in pixels, so the readout cannot
            grow past the ring at any width. */}
        <div className="pointer-events-none absolute inset-x-0 top-[42%] mx-auto flex w-[52%] flex-col items-center gap-1">
          <RolledMoney
            value={paid}
            format={format}
            motionSafe={motionSafe}
            className="text-lg leading-none font-semibold text-ink"
          />
          <span
            aria-hidden
            className="font-mono text-[11px] text-ink-3 tabular-nums"
          >
            of {format(total)}
          </span>
        </div>
      </div>

      <div
        aria-hidden
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2"
      >
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-cobalt-bright" />
          Principal
          <RolledMoney
            value={principal}
            format={format}
            motionSafe={motionSafe}
            className="text-ink"
          />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-warn" />
          Interest
          <RolledMoney
            value={interest}
            format={format}
            motionSafe={motionSafe}
            className="text-ink"
          />
        </span>
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between gap-3 border-t border-hairline pt-3"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] text-ink-3">Remaining</span>
          <RolledMoney
            value={remaining}
            format={format}
            motionSafe={motionSafe}
            className="text-sm font-medium text-ink"
          />
        </span>
        {nextAmount === undefined ? null : (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[11px] text-ink-3">Next instalment</span>
            <span className="font-mono text-sm font-medium text-ink tabular-nums">
              {format(nextAmount)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
