"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GasStop = {
  id: string;
  label: string;
  /** Fee in major units of the reporting currency. */
  fee: number;
  /** Estimated wait, in seconds. */
  seconds: number;
  /** Network rate for this speed, printed in the mono chip. */
  rate?: number;
};

export type GasDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Exactly three stops, slowest first. */
  stops?: [GasStop, GasStop, GasStop];
  /** Controlled stop id. */
  value?: string;
  /** Initial stop id for uncontrolled usage. @default the middle stop */
  defaultValue?: string;
  /** Fires from the press, key or dial gesture that changed the stop. */
  onValueChange?: (id: string) => void;
  /** Prints the fee. */
  format?: (value: number) => string;
  /** Unit printed after a stop's rate. @default "u" */
  rateUnit?: string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const DEFAULT_STOPS: [GasStop, GasStop, GasStop] = [
  { id: "slow", label: "Slow", fee: 0.42, seconds: 180, rate: 9 },
  { id: "normal", label: "Normal", fee: 1.84, seconds: 45, rate: 18 },
  { id: "fast", label: "Fast", fee: 4.2, seconds: 12, rate: 41 },
];

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure the reader came for.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = "0123456789";

/** Dial geometry, in viewBox units. The hub sits low so the arc is a half turn. */
const VB_W = 120;
const VB_H = 76;
const HUB_X = 60;
const HUB_Y = 62;
const R = 44;
/** Rotation of the needle at t = 0; the sweep is a clean half turn. */
const A0 = -90;
const SWEEP = 180;

const pointAt = (t: number) => {
  const angle = ((A0 + t * SWEEP) * Math.PI) / 180;
  return {
    x: HUB_X + Math.sin(angle) * R,
    y: HUB_Y - Math.cos(angle) * R,
  };
};

const arcPath = (from: number, to: number): string => {
  const a = pointAt(from);
  const b = pointAt(to);
  const large = Math.abs(to - from) * SWEEP > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${R} ${R} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/** mm:ss keeps one width at every value, so a counting readout cannot reflow. */
const clock = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The fee. Each digit column is a ten-face strip translated by a percentage of
 * its own height, so a single `y` moves exactly one face, and the cascade runs
 * from the units column leftwards the way an odometer's small wheels stop first.
 *
 * Hidden from assistive technology: the status sentence already carries the fee,
 * and no reader should wade through ten faces a column.
 */
function RollingFee({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // fee gains or loses a digit and only the new column mounts.
        const key = chars.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        const fromRight = chars.length - 1 - index;
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
                  ? { ...springs.snap, delay: fromRight * stagger }
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

/**
 * Three speeds, a needle, and what each one costs. The needle rides a motion
 * value animated on `glide` — a needle crossing an arc is a surface moving into
 * position, so it eases in without overshoot — and the same value drives the
 * filled arc's `pathLength`, so the sweep and the needle are one movement rather
 * than two that nearly agree. The fee rolls on `snap`, the roll belonging to the
 * pick that caused it, and the estimated time counts: a second motion value
 * tweens to the new wait and is read straight into the readout, so the clock
 * counts without re-rendering a frame of it.
 *
 * The three stops are a radio group beneath the dial — a roving tabindex where
 * Left and Right step without wrapping, Home and End jump, and Space selects.
 * The dial face is a pointer shortcut on top of that: it picks the nearest
 * detent by angle, and takes pointer capture only after 4px of travel so a plain
 * click is never swallowed.
 *
 * Under reduced motion the needle and the arc set to their stop at once and the
 * clock arrives at its value instead of counting to it — the fee and the wait
 * still change, because what a speed costs is the information.
 */
export function GasDial({
  ref,
  stops = DEFAULT_STOPS,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  rateUnit = "u",
  label,
  className,
  "aria-label": ariaLabel,
}: GasDialProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? stops[1].id,
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    stops.findIndex((stop) => stop.id === current),
  );
  const stop = stops[currentIndex] ?? stops[0];
  const t = currentIndex / (stops.length - 1);

  const select = React.useCallback(
    (next: string) => {
      if (next === current) return;
      if (!isControlled) setUncontrolled(next);
      onValueChange?.(next);
    },
    [current, isControlled, onValueChange],
  );

  // Seeded at the current stop rather than at zero: a dial that sweeps up on
  // mount reports a change that never happened.
  const progress = useMotionValue(t);
  React.useEffect(() => {
    const controls = animate(
      progress,
      t,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [t, motionSafe, progress]);

  const rotate = useTransform(progress, (p) => A0 + p * SWEEP);

  const eta = useMotionValue(stop.seconds);
  React.useEffect(() => {
    const controls = animate(
      eta,
      stop.seconds,
      motionSafe
        ? { duration: durations.slow, ease: easings.move }
        : { duration: 0 },
    );
    return () => controls.stop();
  }, [stop.seconds, motionSafe, eta]);
  const etaText = useTransform(eta, clock);

  const focusAt = (index: number) => {
    const clamped = Math.min(stops.length - 1, Math.max(0, index));
    const target = stops[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-stop-${target.id}`)?.focus();
    select(target.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(stops.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(stops[index]?.id ?? "");
        break;
      default:
        break;
    }
  };

  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const gesture = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    captured: boolean;
  } | null>(null);

  const stopIdAt = (clientX: number, clientY: number): string | null => {
    const node = faceRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const hubX = rect.left + (HUB_X / VB_W) * rect.width;
    const hubY = rect.top + (HUB_Y / VB_H) * rect.height;
    // Zero points straight up, positive turns clockwise — the needle's frame.
    const angle = (Math.atan2(clientX - hubX, hubY - clientY) * 180) / Math.PI;
    const fraction = Math.min(1, Math.max(0, (angle - A0) / SWEEP));
    const index = Math.round(fraction * (stops.length - 1));
    return stops[Math.min(stops.length - 1, Math.max(0, index))]?.id ?? null;
  };

  const releaseCapture = (pointerId: number) => {
    // A synthetic sweep can release a pointer the element never captured;
    // that throws, and a throw here would take the whole specimen down.
    try {
      faceRef.current?.releasePointerCapture(pointerId);
    } catch {
      // no capture to give back
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      {label ? (
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <div className="rounded-3 border border-hairline bg-surface-1 p-4">
        <div
          ref={faceRef}
          aria-hidden
          className="relative w-full cursor-pointer touch-none select-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            gesture.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              captured: false,
            };
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (!start || start.pointerId !== event.pointerId) return;
            if (!start.captured) {
              const travel = Math.hypot(
                event.clientX - start.x,
                event.clientY - start.y,
              );
              // Capture only past 4px, or the element swallows plain clicks.
              if (travel <= 4) return;
              try {
                faceRef.current?.setPointerCapture(event.pointerId);
              } catch {
                // capture is an optimisation; the gesture works without it
              }
              start.captured = true;
            }
            const next = stopIdAt(event.clientX, event.clientY);
            if (next) select(next);
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start || start.pointerId !== event.pointerId) return;
            if (start.captured) releaseCapture(event.pointerId);
            else {
              const next = stopIdAt(event.clientX, event.clientY);
              if (next) select(next);
            }
          }}
          onPointerCancel={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (start?.captured) releaseCapture(event.pointerId);
          }}
        >
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full">
            <path
              d={arcPath(0, 1)}
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <motion.path
              d={arcPath(0, 1)}
              fill="none"
              stroke="var(--accent-bright)"
              strokeWidth="7"
              strokeLinecap="round"
              style={{ pathLength: progress }}
            />
            {/* Detents sit outside the track rather than on it: a dot drawn on
                the fill has to guess whether the fill has reached it yet, and a
                zero-length fill renders a cap in some engines and nothing in
                others. Outside, a tick is simply always a tick. */}
            {stops.map((entry, index) => {
              const fraction = index / (stops.length - 1);
              const angle = ((A0 + fraction * SWEEP) * Math.PI) / 180;
              const sin = Math.sin(angle);
              const cos = Math.cos(angle);
              const chosen = index === currentIndex;
              return (
                <line
                  key={entry.id}
                  x1={HUB_X + sin * 50}
                  y1={HUB_Y - cos * 50}
                  x2={HUB_X + sin * 54}
                  y2={HUB_Y - cos * 54}
                  stroke={chosen ? "var(--accent-bright)" : "var(--ink-3)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="transition-colors"
                />
              );
            })}
            <motion.line
              x1={HUB_X}
              y1={HUB_Y}
              x2={HUB_X}
              y2={HUB_Y - R + 9}
              stroke="var(--ink)"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{
                rotate,
                transformBox: "view-box",
                // originX/originY, never transformOrigin: motion rebuilds
                // transform-origin for SVG children from its own animated
                // values and replaces whatever the style prop asked for.
                originX: `${HUB_X}px`,
                originY: `${HUB_Y}px`,
              }}
            />
            <circle cx={HUB_X} cy={HUB_Y} r="4.2" fill="var(--ink)" />
            <circle cx={HUB_X} cy={HUB_Y} r="1.7" fill="var(--bg-1)" />
          </svg>

          {/* Sized as a share of the dial, never in pixels, so the readout
              cannot grow past the arc at any width. */}
          <div className="pointer-events-none absolute inset-x-0 top-[40%] mx-auto flex w-[66%] flex-col items-center gap-1">
            <span className="text-xl leading-none font-semibold text-ink">
              <RollingFee text={format(stop.fee)} motionSafe={motionSafe} />
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-ink-2 tabular-nums">
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="size-3 shrink-0"
              >
                <circle cx="8" cy="8.5" r="5.5" />
                <path d="M8 5.5v3l2 1.4M6 1.8h4" />
              </svg>
              <motion.span>{etaText}</motion.span>
            </span>
            {/* Every rate shares one grid cell, so the widest one sets the
                width and a switch cannot nudge the clock above it. */}
            <span className="grid justify-items-center">
              {stops.map((entry, index) =>
                entry.rate === undefined ? null : (
                  <motion.span
                    key={entry.id}
                    className="col-start-1 row-start-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
                    initial={false}
                    animate={{ opacity: index === currentIndex ? 1 : 0 }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    {entry.rate} {rateUnit}
                  </motion.span>
                ),
              )}
            </span>
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex gap-1.5"
      >
        {stops.map((entry, index) => {
          const chosen = index === currentIndex;
          return (
            <button
              key={entry.id}
              id={`${baseId}-stop-${entry.id}`}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              onClick={() => select(entry.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-8 flex-1 items-center justify-center rounded-2 border px-2 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                chosen
                  ? "border-cobalt-bright/50 bg-cobalt-wash text-ink"
                  : "border-hairline text-ink-3 hover:bg-accent hover:text-ink",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {`${stop.label}. Fee ${format(stop.fee)}, about ${stop.seconds} seconds.`}
      </span>
    </div>
  );
}
