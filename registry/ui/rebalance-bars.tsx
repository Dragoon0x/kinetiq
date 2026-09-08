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

export type RebalanceAsset = {
  id: string;
  label: string;
  /** Held weight, in whole percentage points. */
  current: number;
  /** Model weight, in whole percentage points. */
  target: number;
};

export type RebalanceBarsProps = {
  ref?: React.Ref<HTMLDivElement>;
  assets: RebalanceAsset[];
  /** Portfolio value; each trade's cash amount is its weight change against it. */
  total: number;
  /** Controlled state of the rebalance. */
  applied?: boolean;
  /** Initial state for uncontrolled usage. @default false */
  defaultApplied?: boolean;
  onAppliedChange?: (applied: boolean) => void;
  /** Formats each trade's cash amount. */
  format?: (value: number) => string;
  /** Copy on the action button. @default "Rebalance" */
  actionLabel?: string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => currency.format(value);

/** Below this the weights are the same weight; floats should not invent trades. */
const EPSILON = 0.05;

/** The target bar is hatched as well as outlined, so it survives monochrome. */
const TARGET_HATCH =
  "repeating-linear-gradient(45deg, var(--ink-3) 0 1px, transparent 1px 4px)";

/** The drift lane is hatched in warn, so the disagreement is not colour alone. */
const DRIFT_HATCH =
  "repeating-linear-gradient(45deg, var(--warn) 0 1.5px, transparent 1.5px 4px)";

const points = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Current, target, and the moves between. Every asset carries two bars on one
 * scale — `Now`, solid, and `Target`, hatched behind a hairline — so the gap
 * between the pair is the drift, read straight down the column. Pressing the
 * action glides each `Now` bar to its target, staggered by `cascade()` so the
 * whole set lands inside the 600ms budget. `glide` and not `recoil`: a
 * portfolio reaching its model is a weight settling, and a sale should never
 * celebrate.
 *
 * The trade chip carries the other half. Before the move it names the trade —
 * a caret, a signed weight and the cash it is worth — and a warn-hatched drift
 * lane on the `Now` track marks the span between where the weight is and where
 * it belongs, shrinking to nothing as the bar arrives. On arrival the chip
 * swaps for a tick that draws its `pathLength` on `flick` and lands from 1.25×
 * on `recoil`, the one confirmation in the component.
 *
 * Each pair is a `role="meter"` whose `aria-valuetext` states the whole trade
 * in a sentence, so a listener never needs the picture; the action is a real
 * button that disables itself once nothing is left to trade. Under reduced
 * motion the bars still reach their targets — where the money ends up is the
 * information — instantly, with no stagger and no stamp.
 */
export function RebalanceBars({
  ref,
  assets,
  total,
  applied,
  defaultApplied = false,
  onAppliedChange,
  format = defaultFormat,
  actionLabel = "Rebalance",
  label,
  className,
  "aria-label": ariaLabel,
}: RebalanceBarsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultApplied);
  const isControlled = applied !== undefined;
  const isApplied = isControlled ? applied : uncontrolled;

  const rows = React.useMemo(() => {
    let scale = 1;
    for (const asset of assets) {
      scale = Math.max(scale, asset.current, asset.target);
    }
    return assets.map((asset) => {
      const drift = asset.target - asset.current;
      return {
        ...asset,
        drift,
        settled: Math.abs(drift) < EPSILON,
        currentFraction: asset.current / scale,
        targetFraction: asset.target / scale,
      };
    });
  }, [assets]);

  const trades = rows.filter((row) => !row.settled).length;
  const driftPoints = rows.reduce(
    (sum, row) => sum + Math.abs(row.drift) / 2,
    0,
  );
  const turnover = rows.reduce(
    (sum, row) => sum + (Math.abs(row.drift) / 200) * total,
    0,
  );
  const stagger = cascade(rows.length);
  const done = isApplied || trades === 0;

  const setApplied = (next: boolean) => {
    if (next === isApplied) return;
    if (!isControlled) setUncontrolled(next);
    onAppliedChange?.(next);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span
          role="status"
          className={cn(
            "font-mono text-[10px] tracking-[0.08em] uppercase",
            done ? "text-success" : "text-ink-3",
          )}
        >
          {done
            ? `On target · ${trades} ${trades === 1 ? "trade" : "trades"} settled`
            : `Drift ${points(driftPoints)} points · ${format(turnover)} to move`}
        </span>
      </div>

      <ul
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col gap-3"
      >
        {rows.map((row, index) => {
          const now = isApplied ? row.target : row.current;
          const nowFraction = isApplied
            ? row.targetFraction
            : row.currentFraction;
          const buying = row.drift > 0;
          const low = Math.min(nowFraction, row.targetFraction);
          const laneWidth = Math.abs(row.targetFraction - nowFraction);
          const cash = (Math.abs(row.drift) / 100) * total;
          const verb = buying ? "Buy" : "Sell";
          const noun = buying ? "purchase" : "sale";
          const sentence = row.settled
            ? `${row.label}, ${points(now)} percent, on target.`
            : isApplied
              ? `${row.label}, now ${points(row.target)} percent, on target, ${noun} of ${format(cash)} settled.`
              : `${row.label}, now ${points(row.current)} percent, target ${points(row.target)} percent, ${verb.toLowerCase()} ${points(Math.abs(row.drift))} points, ${format(cash)}.`;

          return (
            <li key={row.id} className="flex flex-col gap-1.5">
              <div aria-hidden className="flex items-center gap-2">
                <span
                  title={row.label}
                  className="min-w-0 flex-1 truncate text-[13px] text-foreground"
                >
                  {row.label}
                </span>
                <span className="flex h-5 shrink-0 items-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {done || row.settled ? (
                      <motion.span
                        key="settled"
                        className="flex items-center gap-1 font-mono text-[10px] text-success"
                        initial={
                          motionSafe
                            ? { opacity: 0, scale: 1.25 }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.recoil,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3 shrink-0"
                        >
                          <motion.path
                            d="M3.4 8.4 6.4 11.4 12.6 4.8"
                            pathLength={1}
                            initial={{ pathLength: motionSafe ? 0 : 1 }}
                            animate={{ pathLength: 1 }}
                            transition={
                              motionSafe ? springs.flick : { duration: 0 }
                            }
                          />
                        </svg>
                        {row.settled ? "On target" : "Settled"}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="trade"
                        className={cn(
                          "flex items-center gap-1 font-mono text-[10px] tabular-nums",
                          buying ? "text-cobalt-bright" : "text-warn",
                        )}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          duration: durations.fast,
                          ease: easings.enter,
                        }}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          fill="currentColor"
                          className="size-2.5 shrink-0"
                          style={{
                            transform: buying ? undefined : "rotate(180deg)",
                          }}
                        >
                          <path d="M6 2 10.5 9.5h-9Z" />
                        </svg>
                        {verb} {format(cash)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </div>

              <div
                role="meter"
                aria-label={row.label}
                aria-valuenow={now}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={sentence}
                className="flex flex-col gap-1"
              >
                <div aria-hidden className="flex items-center gap-2">
                  <span className="w-10 shrink-0 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                    Now
                  </span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
                    <motion.span
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
                      initial={false}
                      animate={{ scaleX: nowFraction }}
                      transition={
                        motionSafe
                          ? { ...springs.glide, delay: index * stagger }
                          : { duration: 0 }
                      }
                    />
                    {/* The lane spans from wherever the bar stands to the
                        target: translate puts its left edge at the lower of the
                        two, scale gives it the distance between them, so both
                        close together on one spring. It sits above the fill so a
                        sale's excess reads as hatched rather than hiding under
                        the bar it has to give back. */}
                    <motion.span
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
                      style={{ backgroundImage: DRIFT_HATCH }}
                      initial={false}
                      animate={{ x: `${low * 100}%`, scaleX: laneWidth }}
                      transition={
                        motionSafe
                          ? { ...springs.glide, delay: index * stagger }
                          : { duration: 0 }
                      }
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] text-foreground tabular-nums">
                    {points(now)}%
                  </span>
                </div>

                <div aria-hidden className="flex items-center gap-2">
                  <span className="w-10 shrink-0 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                    Target
                  </span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
                    <span
                      className="absolute inset-y-0 left-0 origin-left rounded-full border border-hairline-strong"
                      style={{
                        width: `${row.targetFraction * 100}%`,
                        backgroundImage: TARGET_HATCH,
                      }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] text-ink-3 tabular-nums">
                    {points(row.target)}%
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <motion.button
        type="button"
        disabled={done}
        onClick={() => setApplied(true)}
        whileTap={motionSafe && !done ? { scale: 0.985 } : undefined}
        transition={springs.flick}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-2 bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors outline-none",
          "hover:bg-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:pointer-events-none disabled:bg-secondary disabled:text-ink-3",
        )}
      >
        {done ? "Nothing to trade" : `${actionLabel} · ${trades} trades`}
      </motion.button>
    </div>
  );
}
