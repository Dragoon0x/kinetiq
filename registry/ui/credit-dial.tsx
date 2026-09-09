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

export type CreditBandTone =
  "danger" | "warn" | "cobalt" | "success" | "signal";

export type CreditBand = {
  label: string;
  /** Where the band starts; it runs to the next band's start, or to `max`. */
  from: number;
  tone: CreditBandTone;
};

export type CreditDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The reading the needle sweeps to. */
  score: number;
  /** The last reading; given it, the change chip shows the move. */
  previous?: number;
  /** Floor of the scale. @default 0 */
  min?: number;
  /** Ceiling of the scale. @default 1000 */
  max?: number;
  /** Ascending bands; each colours its own segment of the arc. */
  bands?: CreditBand[];
  /** Sweep up from the floor on first paint rather than starting at the score. @default true */
  sweepOnMount?: boolean;
  /** Fires when the needle has settled on a score. */
  onSettle?: (score: number) => void;
  /** Names the meter; printed above the dial. @default "Score" */
  label?: string;
  className?: string;
};

export const DEFAULT_CREDIT_BANDS: CreditBand[] = [
  { label: "Poor", from: 0, tone: "danger" },
  { label: "Fair", from: 400, tone: "warn" },
  { label: "Good", from: 600, tone: "cobalt" },
  { label: "Very good", from: 750, tone: "success" },
  { label: "Excellent", from: 900, tone: "signal" },
];

const TONE_STROKE: Record<CreditBandTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  cobalt: "var(--accent-bright)",
  success: "var(--success)",
  signal: "var(--signal)",
};

const TONE_TEXT: Record<CreditBandTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  cobalt: "text-cobalt-bright",
  success: "text-success",
  signal: "text-signal",
};

/** Dial geometry in viewBox units: a 240° sweep open at the bottom, where the
 *  readout sits clear of everywhere the needle can reach. */
const VB_W = 120;
const VB_H = 118;
const HUB_X = 60;
const HUB_Y = 56;
const R = 46;
const NEEDLE = R - 9;
const A0 = -120;
const SWEEP = 240;
/** Gap between bands, as a share of the sweep — one degree. */
const GAP = 1 / SWEEP;

/**
 * Node and the browser can differ in the last digits of sin and cos, and a
 * mismatched attribute is a hydration error — so every trigonometric coordinate
 * is rounded before it reaches the markup.
 */
const round3 = (value: number) => Number(value.toFixed(3));

const pointAt = (t: number, radius: number) => {
  const angle = ((A0 + t * SWEEP) * Math.PI) / 180;
  return {
    x: round3(HUB_X + Math.sin(angle) * radius),
    y: round3(HUB_Y - Math.cos(angle) * radius),
  };
};

const arcPath = (from: number, to: number): string => {
  const a = pointAt(from, R);
  const b = pointAt(to, R);
  const large = (to - from) * SWEEP > 180 ? 1 : 0;
  return `M${a.x} ${a.y}A${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`;
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * A score with a needle. The needle sweeps to the score on `glide` — a surface
 * travelling into position, ζ0.98, so it arrives and settles without a wobble
 * that would read as a second opinion — and the figure under the hub is derived
 * from the same motion value, so the number counts exactly as fast as the
 * needle turns and the two never disagree. While the needle moves the band
 * label is withheld; when the spring settles the band under the needle fades in
 * on the enter ease and, given a previous reading, a change chip arrives beside
 * it on `snap` — the same physics up or down, because a fall is not to be
 * celebrated and a rise is not to be shouted.
 *
 * It is a `role="meter"` whose `aria-valuetext` reads the score, the band and
 * the move; the settled reading is announced once through a status line.
 * Nothing takes focus. Under reduced motion the needle and the figure set at
 * once, the label swaps by opacity and the chip appears in place — the score
 * and its move still show, because they are the information.
 */
export function CreditDial({
  ref,
  score,
  previous,
  min = 0,
  max = 1000,
  bands = DEFAULT_CREDIT_BANDS,
  sweepOnMount = true,
  onSettle,
  label = "Score",
  className,
}: CreditDialProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const span = max > min ? max - min : 1;
  const toT = (value: number) => clamp((value - min) / span, 0, 1);
  const target = clamp(score, min, max);
  const targetT = toT(target);

  // Seeded where the sweep begins, so the server and the first client paint
  // agree on the needle's angle; the effect below does the moving.
  const progress = useMotionValue(sweepOnMount ? 0 : targetT);
  const rotate = useTransform(progress, (t) => A0 + t * SWEEP);
  const counted = useTransform(progress, (t) =>
    String(Math.round(min + t * span)),
  );

  // The label and chip wait for the needle: `settled` holds the score the
  // needle last came to rest on, and a new score clears it until it lands.
  const [settled, setSettled] = React.useState<number | null>(
    sweepOnMount ? null : target,
  );
  const [tracked, setTracked] = React.useState(target);
  if (tracked !== target) {
    setTracked(target);
    setSettled(null);
  }

  const settleRef = React.useRef(onSettle);
  React.useEffect(() => {
    settleRef.current = onSettle;
  }, [onSettle]);

  React.useEffect(() => {
    // Even the instant path reports through onComplete, which motion fires
    // from its frame loop — so the settle never lands inside the effect body.
    const onComplete = () => {
      setSettled(target);
      settleRef.current?.(target);
    };
    const controls = animate(
      progress,
      targetT,
      motionSafe
        ? { ...springs.glide, onComplete }
        : { duration: 0, onComplete },
    );
    return () => controls.stop();
  }, [target, targetT, motionSafe, progress]);

  const ordered = bands
    .slice()
    .sort((a, b) => a.from - b.from)
    .filter((band) => band.from < max);
  const bandFor = (value: number) =>
    ordered.reduce<CreditBand | null>(
      (found, band) => (value >= band.from ? band : found),
      ordered[0] ?? null,
    );
  const band = bandFor(target);
  const isSettled = settled === target;

  const delta = previous === undefined ? 0 : target - clamp(previous, min, max);
  const move =
    delta === 0 ? "" : `${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`;
  const valueText = [
    `${target} of ${max}`,
    band?.label,
    move ? `${move} since the last reading` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
        {label}
      </span>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={target}
        aria-valuetext={valueText}
        className="relative mx-auto w-full max-w-[17.5rem]"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block w-full"
        >
          {ordered.map((item, index) => {
            const start = toT(item.from);
            const end = toT(ordered[index + 1]?.from ?? max);
            // Trimmed by a degree at each inner boundary so the bands read as
            // separate steps rather than one rainbow.
            const from = index === 0 ? start : start + GAP;
            const to = index === ordered.length - 1 ? end : end - GAP;
            if (to <= from) return null;
            return (
              <path
                key={item.label}
                d={arcPath(from, to)}
                fill="none"
                stroke={TONE_STROKE[item.tone]}
                strokeWidth="7"
                strokeOpacity={
                  isSettled && band?.label === item.label ? 1 : 0.45
                }
                className="transition-[stroke-opacity] duration-300"
              />
            );
          })}

          {ordered.slice(1).map((item) => {
            const t = toT(item.from);
            const a = pointAt(t, R + 5.5);
            const b = pointAt(t, R + 8.5);
            return (
              <line
                key={item.from}
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

          {[0, 1].map((t) => {
            const p = pointAt(t, R + 9);
            return (
              <text
                key={t}
                x={p.x}
                y={p.y + 3}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="5.5"
                fill="var(--ink-3)"
                className="font-mono"
              >
                {t === 0 ? min : max}
              </text>
            );
          })}

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
              // transform-origin for SVG children from its own animated
              // values and replaces whatever the style prop asked for.
              originX: `${HUB_X}px`,
              originY: `${HUB_Y}px`,
            }}
          />
          <circle cx={HUB_X} cy={HUB_Y} r="4" fill="var(--ink)" />
          <circle cx={HUB_X} cy={HUB_Y} r="1.6" fill="var(--bg-1)" />
        </svg>

        {/* Sized as a share of the dial, never in pixels, so the readout sits
            in the open bottom of the sweep at any width. */}
        <div className="pointer-events-none absolute inset-x-0 top-[64%] mx-auto flex w-[52%] flex-col items-center gap-1">
          <motion.span
            aria-hidden
            className="font-mono text-3xl leading-none font-semibold text-ink tabular-nums"
          >
            {counted}
          </motion.span>
          <span className="flex h-5 items-center gap-1.5">
            <AnimatePresence mode="wait" initial={false}>
              {isSettled && band ? (
                <motion.span
                  key={band.label}
                  aria-hidden
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    TONE_TEXT[band.tone],
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  {band.label}
                </motion.span>
              ) : null}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {isSettled && delta !== 0 ? (
                <motion.span
                  key={`${target}-${delta}`}
                  aria-hidden
                  className={cn(
                    "inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10px] tabular-nums",
                    delta > 0
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-danger/40 bg-danger/10 text-danger",
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
                  {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
        </div>
      </div>

      <span role="status" className="sr-only">
        {isSettled ? valueText : ""}
      </span>
    </div>
  );
}
