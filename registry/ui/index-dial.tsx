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
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IndexDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The index level. Changing it swings the needle and rolls the figure. */
  value: number;
  /** The basis; the dial's zero. */
  previousClose: number;
  /** Percent each side of zero the dial spans; larger moves pin the needle at the rim. @default 3 */
  range?: number;
  /** Prints the index level. */
  format?: (value: number) => string;
  /** The index name; labels the meter. */
  label: string;
  /** A quiet mono line beside the label — the venue. */
  caption?: string;
  /** Start the needle at zero and swing it to the value on first paint. @default true */
  swingOnMount?: boolean;
  /** Fires from the spring's completion when the needle comes to rest. */
  onSettle?: (value: number, changePercent: number) => void;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const level = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => level.format(value);

/** Dial geometry in viewBox units: a half sweep open at the bottom. */
const VB_W = 120;
const VB_H = 74;
const HUB_X = 60;
const HUB_Y = 62;
const R = 48;
const NEEDLE = R - 9;
/** Where the sweep starts, in degrees from twelve o'clock; it runs 180°. */
const A0 = -90;
const SWEEP = 180;

/**
 * Node and the browser can differ in the last digits of sin and cos, and a
 * mismatched attribute is a hydration error — so every trigonometric
 * coordinate is rounded before it reaches the markup.
 */
const round3 = (value: number) => Number(value.toFixed(3));

const pointAt = (t: number, radius: number) => {
  const angle = ((A0 + t * SWEEP) * Math.PI) / 180;
  return {
    x: round3(HUB_X + Math.sin(angle) * radius),
    y: round3(HUB_Y - Math.cos(angle) * radius),
  };
};

/** An arc from `from` to `to` along the sweep; `to < from` runs anticlockwise. */
const arcPath = (from: number, to: number): string => {
  const a = pointAt(from, R);
  const b = pointAt(to, R);
  return `M${a.x} ${a.y}A${R} ${R} 0 0 ${to > from ? 1 : 0} ${b.x} ${b.y}`;
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap` — the same spring
 * the needle swings on, so the two land together. Each column is ten faces
 * tall and `1ch` wide, so a `y` of a tenth of its height is one digit and a
 * changing number never reflows the row.
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
        // figure gains or loses a place.
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
 * The whole market, one needle. The dial is zeroed on the previous close: the
 * needle stands straight up when the index is flat and swings left for a fall
 * or right for a rise. Each print swings it on `snap` — one crisp overshoot,
 * the way a real needle overshoots a new reading before it settles — and the
 * arc between the zero mark and the needle is drawn from the same motion
 * value, so the two can never disagree. The arc is success on the up side and
 * danger on the down side, because the sign is the reading. Under the dial the
 * level rolls its digit columns on the same spring and a chip carries the
 * percent with its sign, its caret turning to match.
 *
 * It is a `role="meter"` whose `aria-valuetext` reads the level and the move in
 * words; the settled reading is announced once per print, from the spring's
 * completion rather than from render. Nothing takes focus. Under reduced motion
 * the needle and arc set at once, the digits swap and the chip appears in place
 * — the arc still colours by sign, because the reading is the information.
 */
export function IndexDial({
  ref,
  value,
  previousClose,
  range = 3,
  format = defaultFormat,
  label,
  caption,
  swingOnMount = true,
  onSettle,
  className,
}: IndexDialProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const span = range > 0 ? range : 1;
  const changePercent =
    previousClose === 0 ? 0 : ((value - previousClose) / previousClose) * 100;
  const pinned = clamp(changePercent / span, -1, 1);
  // 0 is the left rim, 0.5 the zero mark, 1 the right rim.
  const targetT = 0.5 + pinned / 2;

  // Seeded where the swing begins, so the server and the first client paint
  // agree on the needle's angle; the effect below does the moving.
  const progress = useMotionValue(swingOnMount ? 0.5 : targetT);
  const rotate = useTransform(progress, (t) => (t - 0.5) * SWEEP);
  const upOffset = useTransform(progress, (t) => 1 - Math.max(0, t - 0.5) * 2);
  const downOffset = useTransform(
    progress,
    (t) => 1 - Math.max(0, 0.5 - t) * 2,
  );

  // The chip waits for the needle: `settled` holds the level the needle last
  // came to rest on, and a new print clears it until the spring lands.
  const [settled, setSettled] = React.useState<number | null>(
    swingOnMount ? null : value,
  );
  const [tracked, setTracked] = React.useState(value);
  if (tracked !== value) {
    setTracked(value);
    setSettled(null);
  }

  const settleRef = React.useRef(onSettle);
  React.useEffect(() => {
    settleRef.current = onSettle;
  }, [onSettle]);

  // Without a mount swing the needle is already at rest on first paint, so
  // there is no completion to report; the first effect run is skipped.
  const armed = React.useRef(swingOnMount);
  React.useEffect(() => {
    if (!armed.current) {
      armed.current = true;
      return;
    }
    // Even the instant path reports through onComplete, which motion fires
    // from its frame loop — so the settle never lands inside the effect body.
    const onComplete = () => {
      setSettled(value);
      settleRef.current?.(value, changePercent);
    };
    const controls = animate(
      progress,
      targetT,
      motionSafe
        ? { ...springs.snap, onComplete }
        : { duration: 0, onComplete },
    );
    return () => controls.stop();
  }, [value, changePercent, targetT, motionSafe, progress]);

  const isSettled = settled === value;
  const rising = changePercent > 0;
  const falling = changePercent < 0;
  const printedPercent = `${falling ? "-" : "+"}${Math.abs(changePercent).toFixed(2)}%`;
  const valueText = `${label} at ${format(value)}, ${
    rising ? "up" : falling ? "down" : "unchanged"
  } ${Math.abs(changePercent).toFixed(2)} percent on the previous close`;

  const tone = rising ? "text-success" : falling ? "text-danger" : "text-ink-2";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const zero = pointAt(0.5, R);
  const left = pointAt(0, R);
  const right = pointAt(1, R);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        {caption ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {caption}
          </span>
        ) : null}
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={span * -1}
        aria-valuemax={span}
        aria-valuenow={Number(clamp(changePercent, -span, span).toFixed(2))}
        aria-valuetext={valueText}
        className="flex flex-col gap-3"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="mx-auto block w-full max-w-[17.5rem]"
        >
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Two arcs from the zero mark, one per side, each revealed by the
              same progress the needle turns on. */}
          <motion.path
            d={arcPath(0.5, 1)}
            fill="none"
            stroke="var(--success)"
            strokeWidth="5"
            strokeLinecap="butt"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: upOffset }}
          />
          <motion.path
            d={arcPath(0.5, 0)}
            fill="none"
            stroke="var(--danger)"
            strokeWidth="5"
            strokeLinecap="butt"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: downOffset }}
          />

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const a = pointAt(t, R + 5);
            const b = pointAt(t, R + (t === 0.5 ? 9 : 7.5));
            return (
              <line
                key={t}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--ink-3)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })}

          {[
            { key: "low", x: left.x, y: left.y + 9, text: `−${span}%` },
            { key: "zero", x: zero.x, y: zero.y - 12, text: "0" },
            { key: "high", x: right.x, y: right.y + 9, text: `+${span}%` },
          ].map((mark) => (
            <text
              key={mark.key}
              x={mark.x}
              y={mark.y}
              textAnchor="middle"
              fontSize="5.5"
              fill="var(--ink-3)"
              className="font-mono"
            >
              {mark.text}
            </text>
          ))}

          <motion.line
            x1={HUB_X}
            y1={HUB_Y}
            x2={HUB_X}
            y2={HUB_Y - NEEDLE}
            stroke="var(--ink)"
            strokeWidth="2.4"
            strokeLinecap="round"
            style={{
              rotate,
              transformBox: "view-box",
              // originX/originY, never transformOrigin: motion rebuilds
              // transform-origin for SVG children from its own values and
              // replaces whatever the style prop asked for.
              originX: `${HUB_X}px`,
              originY: `${HUB_Y}px`,
            }}
          />
          <circle cx={HUB_X} cy={HUB_Y} r="4" fill="var(--ink)" />
          <circle cx={HUB_X} cy={HUB_Y} r="1.6" fill="var(--bg-1)" />
        </svg>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="font-mono text-3xl leading-none font-semibold text-ink tabular-nums">
            <RollingFigure value={format(value)} motionSafe={motionSafe} />
          </span>
          <span className="flex h-7 items-center">
            <AnimatePresence initial={false}>
              {isSettled ? (
                <motion.span
                  key={`${value}-${printedPercent}`}
                  aria-hidden
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs font-medium tabular-nums",
                    rising
                      ? "bg-success/12 text-success"
                      : falling
                        ? "bg-danger/12 text-danger"
                        : "bg-surface-2 text-ink-2",
                  )}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, opacity: fade }
                      : { duration: durations.fast }
                  }
                >
                  {/* Turned on a span, not the svg: motion rewrites
                      transform-origin on SVG nodes, and an HTML wrapper turns
                      unambiguously about its centre. */}
                  <motion.span
                    className="flex size-3 shrink-0 items-center justify-center"
                    initial={false}
                    animate={{
                      rotate: falling ? 180 : 0,
                      opacity: rising || falling ? 1 : 0.5,
                    }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden className="size-3">
                      <path d="M6 2.5 10 9H2Z" fill="currentColor" />
                    </svg>
                  </motion.span>
                  <RollingFigure
                    value={printedPercent}
                    motionSafe={motionSafe}
                  />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
        </div>
      </div>

      <p aria-hidden className="font-mono text-[11px] text-ink-3 tabular-nums">
        Prev close {format(previousClose)} ·{" "}
        <span className={tone}>
          {falling ? "-" : "+"}
          {format(Math.abs(value - previousClose))}
        </span>
      </p>

      <span role="status" className="sr-only">
        {isSettled ? valueText : ""}
      </span>
    </div>
  );
}
