"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FinalityRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Blocks seen on top of the transaction. Clamped to `finality` for display. */
  confirmations: number;
  /** Confirmations that count as final. @default 12 */
  finality?: number;
  /** Visible caption over the ring. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Returns 0–1. The default halves the remaining doubt per block. */
  certaintyFor?: (confirmations: number, finality: number) => number;
  /** The sum being secured; omit it and the line is not drawn. */
  amount?: number;
  /** Formats `amount`. */
  format?: (value: number) => string;
  /** Ticker printed after the amount. @default "BSN" */
  asset?: string;
  /** Word under the figure before finality. @default "Settling" */
  pendingLabel?: string;
  /** Word under the seal once final. @default "Final" */
  finalLabel?: string;
  /** Fires once, from the effect that sees the crossing into finality. */
  onFinal?: () => void;
  /** @default "md" */
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/**
 * Each block halves the doubt left in the transaction, and finality is the one
 * place the figure is allowed to be exact.
 */
const defaultCertainty = (confirmations: number, finality: number): number => {
  if (confirmations >= finality) return 1;
  if (confirmations <= 0) return 0;
  return 1 - 0.5 ** confirmations;
};

/** The notch at the top is the part of finality still owed. */
const NOTCH = 0.06;
const SWEEP = 1 - NOTCH;
/** Puts the path's start at twelve o'clock with the notch centred on it. */
const START = -90 + (NOTCH * 360) / 2;

const RADIUS = 40;
const TICK_INNER = 46;
const TICK_OUTER = 49.5;

const SIZE_CLASS = { sm: "size-28", md: "size-36" } as const;
const FIGURE_CLASS = { sm: "text-sm", md: "text-lg" } as const;

const round = (value: number): number => Number(value.toFixed(3));

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap`. The column is ten
 * faces tall, so a `y` of its own height times ten moves exactly one digit, and
 * keying from the right keeps the units column's identity when the number
 * gains or loses one.
 */
function RollDigits({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
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
 * How sure the chain is. The ring is open at the top: the notch is the part of
 * finality still owed, and every confirmation extends the arc on `glide`,
 * because a quantity arriving should settle without overshoot. Its tick draws
 * on `flick`, the acknowledgement spring.
 *
 * The last block is the one that behaves differently. Reaching `finality` fills
 * the remaining sweep *and* closes the notch in a single move on `snap`, whose
 * one crisp overshoot is the ring shutting; the stroke crosses to success and
 * the centre gives up its probability for a drawn check, because at finality
 * the number is no longer a probability. Until then the certainty figure rolls
 * its digits on `snap` inside a fixed five-character box, so a rolling readout
 * never shifts the layout under it.
 *
 * It reports as a `role="progressbar"` carrying the count and a spoken
 * `aria-valuetext`, and it runs no clock of its own — blocks arrive as a prop.
 * Under reduced motion the arc still fills and the digits still change, on a
 * tween instead of a spring, because how settled a transfer is cannot be
 * decoration.
 */
export function FinalityRing({
  ref,
  confirmations,
  finality = 12,
  label,
  certaintyFor = defaultCertainty,
  amount,
  format = defaultFormat,
  asset = "BSN",
  pendingLabel = "Settling",
  finalLabel = "Final",
  onFinal,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: FinalityRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const total = Math.max(1, Math.round(finality));
  const seen = Math.max(0, Math.min(total, Math.round(confirmations)));
  const isFinal = seen >= total;

  // The arc's last move both fills the remaining sweep and swallows the notch,
  // so closing the ring is one animation rather than two fighting each other.
  const drawn = isFinal ? 1 : (seen / total) * SWEEP;

  const certainty = Math.max(0, Math.min(1, certaintyFor(seen, total)));
  const figure = (certainty * 100).toFixed(2);

  const ticks = React.useMemo(
    () =>
      Array.from({ length: total }, (_, index) => {
        const fraction = ((index + 0.5) / total) * SWEEP;
        const radians = ((START + fraction * 360) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        // Node and the browser can disagree in the last digits of sin and cos,
        // and a mismatched attribute is a hydration error — so round first.
        return {
          x1: round(50 + TICK_INNER * cos),
          y1: round(50 + TICK_INNER * sin),
          x2: round(50 + TICK_OUTER * cos),
          y2: round(50 + TICK_OUTER * sin),
        };
      }),
    [total],
  );

  const finalRef = React.useRef(isFinal);
  const onFinalRef = React.useRef(onFinal);
  React.useEffect(() => {
    onFinalRef.current = onFinal;
  });
  // Blocks land as a prop, so this effect is the only observer of the crossing.
  // It writes no state — it just tells the host what it saw.
  React.useEffect(() => {
    if (finalRef.current === isFinal) return;
    finalRef.current = isFinal;
    if (isFinal) onFinalRef.current?.();
  }, [isFinal]);

  const arcTransition = motionSafe
    ? isFinal
      ? springs.snap
      : springs.glide
    : { duration: durations.base, ease: easings.enter };

  const valueText = isFinal
    ? `${seen} of ${total} confirmations, final`
    : `${seen} of ${total} confirmations, ${figure} percent certain`;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col items-center gap-3", className)}
    >
      {label ? (
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
      ) : null}

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={seen}
        aria-valuetext={valueText}
        className={cn("relative shrink-0", SIZE_CLASS[size])}
      >
        <svg viewBox="0 0 100 100" aria-hidden className="size-full">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            className="text-hairline-strong"
            stroke="currentColor"
            strokeWidth="6"
            pathLength={1}
            strokeDasharray={`${SWEEP} ${NOTCH}`}
            transform={`rotate(${START} 50 50)`}
          />

          <g className="text-hairline-strong">
            {ticks.map((tick, index) => (
              <line
                key={index}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Each landed block draws its own tick rather than fading one in:
              a draw is the same acknowledgement the arc is making, one beat
              earlier and one ring further out. */}
          <g
            className={cn(
              "transition-colors",
              isFinal ? "text-success" : "text-cobalt-bright",
            )}
          >
            {ticks.map((tick, index) => (
              <motion.line
                key={index}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                initial={false}
                animate={{ pathLength: index < seen ? 1 : 0 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            ))}
          </g>

          <motion.circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            className={cn(
              "transition-colors",
              isFinal ? "text-success" : "text-cobalt-bright",
            )}
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform={`rotate(${START} 50 50)`}
            initial={{ strokeDashoffset: 1 }}
            animate={{ strokeDashoffset: 1 - drawn }}
            transition={arcTransition}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {/* Both readouts share one grid cell and cross-fade in place: a
              swap that unmounts one of them would let the word beneath
              re-centre for the length of the exit. */}
          <span aria-hidden className="grid place-items-center">
            <motion.svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="col-start-1 row-start-1 size-6 text-success"
              initial={false}
              animate={{ opacity: isFinal ? 1 : 0 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <motion.path
                d="M5.5 12.5 10 17l8.5-9"
                pathLength={1}
                initial={false}
                animate={{ pathLength: isFinal ? 1 : 0 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </motion.svg>
            <motion.span
              className={cn(
                "col-start-1 row-start-1 flex items-baseline font-mono font-medium text-foreground",
                FIGURE_CLASS[size],
              )}
              initial={false}
              animate={{ opacity: isFinal ? 0 : 1 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {/* Five characters, always: the box is what stops a rolling
                  figure from nudging the word underneath it. */}
              <span className="flex w-[5ch] justify-end">
                <RollDigits value={figure} motionSafe={motionSafe} />
              </span>
              <span className="text-ink-3">%</span>
            </motion.span>
          </span>

          <span
            className={cn(
              "font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
              isFinal ? "text-success" : "text-ink-3",
            )}
          >
            {isFinal ? finalLabel : pendingLabel}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-1">
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {seen} of {total} blocks
        </span>
        {amount !== undefined ? (
          <span className="font-mono text-xs font-medium text-foreground tabular-nums">
            {format(amount)} {asset}
          </span>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {isFinal ? `${finalLabel}. ${seen} of ${total} confirmations.` : ""}
      </span>
    </div>
  );
}
