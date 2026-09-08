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
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HarvestTapProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The collected balance; its digits roll when it changes. */
  balance: number;
  /** The figure the tap starts from. Changing it reseeds the climbing readout. */
  accrued?: number;
  /** Units accrued per second while `accruing`. @default 0 */
  rate?: number;
  /** Runs the climb. Paused while the document is hidden. @default false */
  accruing?: boolean;
  /** Ticker for both figures, e.g. "BSN". */
  symbol: string;
  /** Formats every figure, in the readouts and the spoken sentences. */
  format?: (value: number) => string;
  /** Below this the Harvest button is disabled and names the threshold. @default 0 */
  minHarvest?: number;
  /** Fires from the press, carrying the figure at the moment it was pressed. */
  onHarvest?: (amount: number) => void;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * The climb is one long linear animation rather than a tick per second: an
 * interval would step the figure, and rewards do not arrive in steps.
 */
const HORIZON_SECONDS = 600;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const rewards = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => rewards.format(value);

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab has no rAF, so the tap holds rather than paying into the dark. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/**
 * A figure whose digit columns roll to their new value on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Hidden from
 * assistive technology: the same figure is printed as plain text beside it.
 */
function RollingFigure({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains a digit, and only the new column mounts.
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
 * Rewards arriving one drip at a time, and the press that empties the cup. The
 * accrued figure lives in a motion value rather than state, so it climbs
 * continuously without a render per frame: one `animate()` runs a long linear
 * ramp at `rate` a second, stopped in the effect's cleanup and re-armed
 * whenever the tap closes, the document hides, or a harvest lands — nothing
 * reads a clock during render.
 *
 * Harvesting reads that value in the press handler and does three things at
 * once: a ghost of the figure sweeps into the balance on `glide`, its travel
 * measured from the two rows rather than guessed; the balance rolls its digits
 * on `snap`; and the emptied row drops back to zero on `recoil`, whose ζ0.53
 * gives the two bounces of a tap shutting off. The figure starts climbing again
 * immediately, because the pool does not stop paying while you collect. Under
 * reduced motion the figure still climbs and the balance still changes — both
 * are information — but nothing travels or bounces.
 */
export function HarvestTap({
  ref,
  balance,
  accrued = 0,
  rate = 0,
  accruing = false,
  symbol,
  format = defaultFormat,
  minHarvest = 0,
  onHarvest,
  label,
  className,
  "aria-label": ariaLabel,
}: HarvestTapProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const thresholdId = `${baseId}-threshold`;

  const accruedMv = useMotionValue(accrued);
  const accruedText = useTransform(accruedMv, (value) =>
    format(Math.max(0, value)),
  );

  const [harvests, setHarvests] = React.useState(0);
  const [collected, setCollected] = React.useState<number | null>(null);
  const [ghost, setGhost] = React.useState<{
    id: number;
    text: string;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
  } | null>(null);

  const columnRef = React.useRef<HTMLDivElement>(null);
  const accruedFigureRef = React.useRef<HTMLSpanElement>(null);
  const balanceFigureRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    accruedMv.set(accrued);
  }, [accrued, accruedMv]);

  React.useEffect(() => {
    if (!accruing || rate <= 0 || !visible) return;
    const from = accruedMv.get();
    const controls = animate(accruedMv, from + rate * HORIZON_SECONDS, {
      duration: HORIZON_SECONDS,
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [accruing, rate, visible, harvests, accruedMv]);

  // The button's enabled state is the one thing that must follow the climbing
  // figure, so it is read as a store rather than mirrored into state — React
  // re-renders only on the frame the threshold is actually crossed.
  const subscribeAccrued = React.useCallback(
    (onChange: () => void) => accruedMv.on("change", onChange),
    [accruedMv],
  );
  const ready = React.useSyncExternalStore(
    subscribeAccrued,
    () => accruedMv.get() >= minHarvest && accruedMv.get() > 0,
    () => accrued >= minHarvest && accrued > 0,
  );

  const harvest = () => {
    const amount = Math.max(0, accruedMv.get());
    if (amount <= 0 || amount < minHarvest) return;

    if (motionSafe) {
      // Measured in the handler, never in render: the sweep travels the real
      // distance between the two rows rather than a guessed offset.
      const fromBox = accruedFigureRef.current?.getBoundingClientRect();
      const toBox = balanceFigureRef.current?.getBoundingClientRect();
      const columnBox = columnRef.current?.getBoundingClientRect();
      if (fromBox && toBox && columnBox) {
        setGhost({
          id: harvests + 1,
          text: format(amount),
          x0: Math.round(fromBox.left - columnBox.left),
          y0: Math.round(fromBox.top - columnBox.top),
          dx: Math.round(toBox.left - fromBox.left),
          dy: Math.round(toBox.top - fromBox.top),
        });
      }
    }

    accruedMv.set(0);
    setHarvests((count) => count + 1);
    setCollected(amount);
    onHarvest?.(amount);
  };

  const disabled = !ready;
  const balanceText = format(balance);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
    >
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          <motion.span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              accruing ? "bg-signal" : "bg-ink-3",
            )}
            animate={
              accruing && motionSafe && visible
                ? { opacity: [1, 0.3] }
                : { opacity: 1 }
            }
            transition={
              accruing && motionSafe && visible
                ? {
                    duration: 1.2,
                    ease: easings.move,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }
                : { duration: durations.fast }
            }
          />
          {accruing ? "Accruing" : "Paused"}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Balance
        </span>
        <span className="flex items-center gap-1.5">
          <span
            ref={balanceFigureRef}
            className="font-mono text-2xl leading-none font-medium tracking-tight"
          >
            <RollingFigure value={balanceText} motionSafe={motionSafe} />
          </span>
          <span className="font-mono text-xs text-ink-3">{symbol}</span>
          <span className="sr-only">
            Balance {balanceText} {symbol}
          </span>
        </span>
      </div>

      <div className="flex items-end gap-2 border-t border-hairline pt-3">
        <div
          ref={columnRef}
          className="relative flex min-w-0 flex-1 flex-col gap-1"
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Accrued
          </span>
          <motion.span
            key={harvests}
            ref={accruedFigureRef}
            className="flex w-fit items-center gap-1.5 font-mono text-base leading-none font-medium tabular-nums"
            initial={
              harvests === 0
                ? false
                : motionSafe
                  ? { y: -distances.step, opacity: 0 }
                  : { opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? springs.recoil
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            {/* Per-frame text is hidden from assistive technology: a figure that
                changes sixty times a second is noise, not information. The rate
                is spoken once instead, below. */}
            <motion.span aria-hidden>{accruedText}</motion.span>
            <span aria-hidden className="text-xs text-ink-3">
              {symbol}
            </span>
          </motion.span>

          <AnimatePresence>
            {ghost ? (
              <motion.span
                key={ghost.id}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 font-mono text-base font-medium whitespace-nowrap text-signal tabular-nums"
                style={{ marginLeft: ghost.x0, marginTop: ghost.y0 }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: ghost.dx, y: ghost.dy, opacity: 0 }}
                transition={{
                  ...springs.glide,
                  opacity: {
                    duration: durations.base,
                    delay: durations.base,
                    ease: easings.exit,
                  },
                }}
                onAnimationComplete={() =>
                  setGhost((current) =>
                    current && current.id === ghost.id ? null : current,
                  )
                }
              >
                {ghost.text}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={harvest}
          aria-describedby={disabled ? thresholdId : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center justify-center rounded-2 px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "bg-primary text-primary-foreground hover:opacity-90",
            "disabled:pointer-events-none disabled:border disabled:border-hairline disabled:bg-surface-2 disabled:text-ink-3",
          )}
        >
          Harvest
        </button>
      </div>

      <span id={thresholdId} className="sr-only">
        {minHarvest > 0
          ? `Harvest is available once ${format(minHarvest)} ${symbol} has accrued.`
          : `Nothing has accrued yet.`}
      </span>
      <span className="sr-only">
        {rate > 0
          ? `Accruing ${format(rate)} ${symbol} per second while the tap is open.`
          : "The tap is closed."}
      </span>
      {/* Announced on the harvest, never per tick. */}
      <span role="status" className="sr-only">
        {collected === null
          ? ""
          : `Harvested ${format(collected)} ${symbol}. Balance ${balanceText} ${symbol}.`}
      </span>
    </div>
  );
}
