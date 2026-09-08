"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CashOutgoing = {
  id: string;
  /** What the money is for. */
  label: string;
  /** How much leaves the account. */
  amount: number;
  /** Days from now until it lands; placed as a marker on the ring. */
  inDays: number;
};

export type CashClockProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Balance today, before the scheduled outgoings. */
  balance: number;
  /** Days left in the cycle. Clamped into `cycleDays`. */
  daysToPayday: number;
  /** Ticks on the ring — the length of the pay cycle. @default 30 */
  cycleDays?: number;
  /** Scheduled debits between now and payday. */
  outgoings?: CashOutgoing[];
  /** Fires with the new projection after a toggle. */
  onProjectionChange?: (projected: number) => void;
  /** Controlled ids counted in the projection. */
  included?: string[];
  /** Initial included ids; defaults to every outgoing. */
  defaultIncluded?: string[];
  onIncludedChange?: (ids: string[]) => void;
  /** A projection below this reads danger. @default 0 */
  floor?: number;
  /** Renders the projection and every row; money never bypasses it. */
  format?: (amount: number) => string;
  /** Names the cycle. */
  label: string;
  className?: string;
};

const NO_OUTGOINGS: CashOutgoing[] = [];

/** Pinned so the server and the client format identically. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (amount: number) => currency.format(amount);

const CENTRE = 50;
const RING_R = 44;
const TICK_OUTER = 38;
const TICK_INNER = 33;

/**
 * The projection counts to its new value on `snap` rather than swapping: money
 * that moves because you toggled something should be seen moving. The count
 * lives in a motion value, so the run costs no renders, and the tabular face
 * keeps the figure from breathing as digits change.
 */
function CountingFigure({
  value,
  format,
  motionSafe,
}: {
  value: number;
  format: (amount: number) => string;
  motionSafe: boolean;
}) {
  const count = useMotionValue(value);
  const text = useTransform(count, (amount) => format(amount));

  React.useEffect(() => {
    if (!motionSafe) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, springs.snap);
    return () => controls.stop();
  }, [value, count, motionSafe]);

  return (
    <motion.span aria-hidden className="tabular-nums">
      {text}
    </motion.span>
  );
}

/** Polar to cartesian on the 100×100 face, twelve o'clock first. */
const pointAt = (turn: number, radius: number) => {
  const angle = (turn - 0.25) * Math.PI * 2;
  return {
    x: CENTRE + Math.cos(angle) * radius,
    y: CENTRE + Math.sin(angle) * radius,
  };
};

/** A run of day ticks as one path: two nodes on the face instead of thirty. */
const tickPath = (from: number, to: number, cycle: number) => {
  let d = "";
  for (let day = from; day < to; day += 1) {
    const inner = pointAt(day / cycle, TICK_INNER);
    const outer = pointAt(day / cycle, TICK_OUTER);
    d += `M${inner.x.toFixed(2)} ${inner.y.toFixed(2)}L${outer.x.toFixed(2)} ${outer.y.toFixed(2)}`;
  }
  return d;
};

/**
 * Payday as a countdown rather than a surprise. The ring is one pay cycle, one
 * tick per day, and the arc over the days already spent grows on `glide` — a
 * quantity settling, so it arrives without overshoot. Inside it sits the
 * balance you will actually reach: switching a scheduled outgoing on or off
 * rolls those digits on `snap` and lands or lifts that outgoing's marker on the
 * tick for the day it falls, so the list and the ring always agree.
 *
 * Fall under `floor` and the ring's unspent arc turns danger while the days
 * line swaps to what you are short by — a shortfall is reported, never
 * celebrated. Nothing here runs on a timer and nothing reads the clock: the day
 * count arrives as a prop. The outgoings are real checkboxes, so Tab reaches
 * each one and Space toggles it; under reduced motion the arc still fills and
 * the markers still appear, and the projection sets rather than counts.
 */
export function CashClock({
  ref,
  balance,
  daysToPayday,
  cycleDays = 30,
  outgoings = NO_OUTGOINGS,
  included,
  defaultIncluded,
  onIncludedChange,
  onProjectionChange,
  floor = 0,
  format = defaultFormat,
  label,
  className,
}: CashClockProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const allIds = outgoings.map((item) => item.id);
  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultIncluded ?? allIds,
  );
  const isControlled = included !== undefined;
  const current = isControlled ? included : uncontrolled;
  const includedSet = React.useMemo(() => new Set(current), [current]);

  const days = Math.min(Math.max(0, daysToPayday), Math.max(1, cycleDays));
  const elapsed = Math.max(1, cycleDays) - days;
  const progress = elapsed / Math.max(1, cycleDays);

  const projectionFor = (ids: Set<string>) =>
    outgoings.reduce(
      (total, item) => (ids.has(item.id) ? total - item.amount : total),
      balance,
    );
  const projected = projectionFor(includedSet);
  const short = projected < floor;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(includedSet);
    if (on) next.add(id);
    else next.delete(id);
    const ids = allIds.filter((one) => next.has(one));
    if (!isControlled) setUncontrolled(ids);
    // Reported from the change event that caused it, not from a state updater.
    onIncludedChange?.(ids);
    onProjectionChange?.(projectionFor(next));
  };

  const arcTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  // A marker lands on `snap` and leaves on the exit ease: arrivals may
  // overshoot, departures accelerate away.
  const markerIn = motionSafe ? springs.snap : fade;
  const markerOut = motionSafe
    ? { duration: durations.fast, ease: easings.exit }
    : fade;

  const valueText = `${days} ${days === 1 ? "day" : "days"} to payday, day ${elapsed} of ${cycleDays}. Projected balance ${format(
    projected,
  )}${short ? `, short by ${format(floor - projected)}` : ""}.`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {format(balance)} today
        </span>
      </div>

      <div className="flex justify-center">
        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={cycleDays}
          aria-valuenow={elapsed}
          aria-valuetext={valueText}
          className="relative w-44 max-w-full"
        >
          <svg viewBox="0 0 100 100" className="block w-full" aria-hidden>
            <path
              d={tickPath(0, elapsed, cycleDays)}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinecap="round"
              className="text-ink-3"
            />
            <path
              d={tickPath(elapsed, cycleDays, cycleDays)}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinecap="round"
              className="text-hairline-strong"
            />

            <circle
              cx={CENTRE}
              cy={CENTRE}
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={5}
              className={cn(
                "transition-colors",
                short ? "text-danger" : "text-hairline-strong",
              )}
            />

            <motion.circle
              cx={CENTRE}
              cy={CENTRE}
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={5}
              strokeLinecap="round"
              className="text-cobalt-bright"
              pathLength={1}
              strokeDasharray="1 1"
              transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
              initial={false}
              animate={{ strokeDashoffset: 1 - progress }}
              transition={arcTransition}
            />

            {/* Payday sits where the arc completes: twelve o'clock. */}
            <circle
              cx={CENTRE}
              cy={CENTRE - RING_R}
              r={3.2}
              className="fill-cobalt-bright"
            />

            {outgoings.map((item) => {
              const landsOn = Math.min(
                cycleDays,
                Math.max(0, elapsed + item.inDays),
              );
              const spot = pointAt(landsOn / Math.max(1, cycleDays), RING_R);
              const on = includedSet.has(item.id);
              return (
                <motion.circle
                  key={item.id}
                  cx={spot.x}
                  cy={spot.y}
                  r={2.6}
                  className={short ? "fill-danger" : "fill-ink"}
                  // Only origin* keys survive motion's transform-origin
                  // rewrite, so the marker scales about itself, not the face.
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={false}
                  animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                  transition={on ? markerIn : markerOut}
                />
              );
            })}
          </svg>

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                At payday
              </span>
              <span
                className={cn(
                  "font-mono text-lg leading-none font-medium transition-colors",
                  short ? "text-danger" : "text-foreground",
                )}
              >
                <CountingFigure
                  value={projected}
                  format={format}
                  motionSafe={motionSafe}
                />
              </span>
              {/* One grid cell holds both lines: no reserved height. */}
              <span className="grid">
                <motion.span
                  className="col-start-1 row-start-1 text-center text-[11px] text-ink-3"
                  animate={{ opacity: short ? 0 : 1 }}
                  transition={fade}
                >
                  {days} {days === 1 ? "day" : "days"} left
                </motion.span>
                <motion.span
                  className="col-start-1 row-start-1 text-center text-[11px] font-medium text-danger"
                  animate={{ opacity: short ? 1 : 0 }}
                  transition={fade}
                >
                  short {format(Math.max(0, floor - projected))}
                </motion.span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {outgoings.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing scheduled before payday.</p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
          {outgoings.map((item) => {
            const on = includedSet.has(item.id);
            const rowLabel = `${item.label}, ${format(item.amount)}, lands in ${item.inDays} ${item.inDays === 1 ? "day" : "days"}`;
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-2 px-2 py-1.5 transition-colors hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                    aria-label={rowLabel}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="size-3">
                      <motion.path
                        d="M3.4 8.4 6.4 11.4 12.6 4.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        initial={false}
                        // The tick draw is the acknowledgement: instant under
                        // reduced motion, never absent.
                        animate={{ pathLength: on ? 1 : 0 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  </span>
                  <span
                    title={item.label}
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm transition-colors",
                      on ? "text-foreground" : "text-ink-3",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="shrink-0 rounded-1 bg-surface-2 px-1 font-mono text-[10px] text-ink-3 tabular-nums">
                    d{item.inDays}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs tabular-nums transition-colors",
                      on ? "text-ink-2" : "text-ink-3 line-through",
                    )}
                  >
                    {format(item.amount)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <span role="status" className="sr-only">
        {allIds.filter((id) => includedSet.has(id)).length} of{" "}
        {outgoings.length} scheduled. {valueText}
      </span>
    </div>
  );
}
