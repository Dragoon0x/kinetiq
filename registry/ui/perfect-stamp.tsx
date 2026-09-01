"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type Grade = {
  id: string;
  label: string;
  tint: string;
  flecks: number;
  rotation: number;
};

export type PerfectStampProps = {
  /** The verdicts, stamped in this fixed order, cycling back to the start. @default the built-in five-grade run */
  grades?: Grade[];
  /** Fires the instant a verdict is decided, with its label. */
  onGrade?: (label: string) => void;
  className?: string;
};

type Phase = "descend" | "impact";

/** The fixed five-step cycle. GRADE always advances to the next entry and
 * wraps — never randomized, so a given sequence of presses always stamps the
 * same run of verdicts. Tints draw from the four house grade families. */
const DEFAULT_GRADES: Grade[] = [
  {
    id: "perfect",
    label: "PERFECT",
    tint: "color-mix(in oklab, var(--success, #047857) 30%, var(--card))",
    flecks: 10,
    rotation: -5,
  },
  {
    id: "great",
    label: "GREAT",
    tint: "color-mix(in oklab, var(--primary) 26%, var(--card))",
    flecks: 8,
    rotation: 4,
  },
  {
    id: "good",
    label: "GOOD",
    tint: "color-mix(in oklab, var(--primary) 14%, var(--card))",
    flecks: 5,
    rotation: -3,
  },
  {
    id: "clear",
    label: "CLEAR",
    tint: "color-mix(in oklab, var(--warning, #b45309) 20%, var(--card))",
    flecks: 3,
    rotation: 5,
  },
  {
    id: "failed",
    label: "FAILED",
    tint: "color-mix(in oklab, var(--ink-2) 22%, var(--card))",
    flecks: 2,
    rotation: -2,
  },
];

/** Border weight and ink accent are not part of the Grade shape a caller
 * hands in — both are looked up by id off a fixed table, guarded past it. */
const BORDER_WIDTH_BY_ID: Record<string, number> = {
  perfect: 5,
  great: 4,
  good: 3,
  clear: 3,
  failed: 2,
};
const BORDER_WIDTH_FALLBACK = 3;
const borderWidthFor = (id: string): number =>
  BORDER_WIDTH_BY_ID[id] ?? BORDER_WIDTH_FALLBACK;

const ACCENT_BY_ID: Record<string, string> = {
  perfect: "var(--success, #047857)",
  great: "var(--primary)",
  good: "var(--primary)",
  clear: "var(--warning, #b45309)",
  failed: "var(--ink-2)",
};
const ACCENT_FALLBACK = "var(--ink-2)";
const accentFor = (id: string): string => ACCENT_BY_ID[id] ?? ACCENT_FALLBACK;

/** Ten fixed ink-fleck vectors, thrown from the impact point. Grades scatter
 * a prefix of this table (PERFECT gets all ten, FAILED gets two) — no
 * Math.random, the same grade always throws the same flecks. */
const FLECKS = [
  { dx: -20, dy: -16, delay: 0 },
  { dx: 18, dy: -20, delay: 0.02 },
  { dx: -26, dy: 4, delay: 0.01 },
  { dx: 24, dy: 8, delay: 0.03 },
  { dx: -12, dy: 22, delay: 0.015 },
  { dx: 14, dy: -8, delay: 0.025 },
  { dx: -18, dy: -24, delay: 0.035 },
  { dx: 22, dy: -2, delay: 0.008 },
  { dx: -8, dy: 18, delay: 0.04 },
  { dx: 10, dy: 24, delay: 0.018 },
] as const;

/** Fixed run summary — a demo card never reads a clock or a real match. */
const RUN_STATS: { label: string; value: string }[] = [
  { label: "time", value: "1:42.07" },
  { label: "accuracy", value: "98.4%" },
  { label: "misses", value: "2" },
];

const STAMP_W = 176;
const STAMP_H = 86;

/** Arrival: fast, oversized, tilted well past its resting angle. */
const ARRIVE_Y = -170;
const ARRIVE_SCALE = 2.4;
const ARRIVE_TILT_EXTRA = 20;
/** Where the arrival tween hands off to the impact spring — still a hair
 * hot on scale and tilt, so the hard stop has something to settle. */
const SETTLE_SCALE = 1.1;
const SETTLE_TILT_EXTRA = 6;
const ARRIVE_S = 0.22;
/** The FAILED fall never gets this quick — see arriveDurationFor. */
const ARRIVE_S_HEAVY = 0.36;

/** Weight reference: the highest fleck count in the table (PERFECT) reads
 * as full weight; everything else scales down from there. */
const MAX_FLECKS_REFERENCE = 10;
const weightFor = (grade: Grade): number =>
  clamp(grade.flecks / MAX_FLECKS_REFERENCE, 0.18, 1);

/** Heavier grades fall quicker and snappier; a near-empty fleck count (i.e.
 * FAILED) drags the fall out and drops the accelerating snap for a duller
 * curve — a thud has nothing to brag about. */
const arriveDurationFor = (grade: Grade): number =>
  ARRIVE_S + (1 - weightFor(grade)) * (ARRIVE_S_HEAVY - ARRIVE_S);
const arriveEaseFor = (
  grade: Grade,
): typeof easings.exit | typeof easings.move =>
  grade.id === "failed" ? easings.move : easings.exit;

const signedExtra = (base: number, extra: number): number =>
  base < 0 ? -extra : extra;

const SHUDDER_S = 0.22;
const SHUDDER_TIMES = [0, 0.5, 1] as const;
const SHUDDER_AMP_MAX = 7;
const shudderAmplitudeFor = (grade: Grade): number =>
  Math.round(SHUDDER_AMP_MAX * weightFor(grade));

const captionFor = (grade: Grade | undefined): string | null => {
  if (!grade) return null;
  if (grade.id === "perfect") return "flawless";
  if (grade.id === "failed") return "run it back";
  return null;
};

const RING_SIZE = 64;
const IMPACT_HOLD_MS = 550;

/**
 * A results verdict that slams onto the screen the moment you press GRADE.
 * A fixed run summary (time, accuracy, misses — demo data, never a clock)
 * sits above the verdict area; GRADE stamps the next entry in a fixed
 * five-step cycle — PERFECT, GREAT, GOOD, CLEAR, FAILED, then around again —
 * never randomized, so the same run of presses always stamps the same run of
 * verdicts. The stamp drops in oversized and rotated, decelerating hard into
 * a `flick` spring at its resting tilt, the card shudders, a shockwave rings
 * out from the impact point, and ink flecks scatter — every beat scaled by
 * how much weight that grade carries, so PERFECT lands heaviest, with a light sweep, a
 * slow rotating glow, and the caption "flawless". FAILED deliberately gets
 * none of that: a muted tint, a slower and heavier fall, a dull thud with no
 * ring and barely any flecks, and the caption "run it back" — a results
 * screen that celebrates failure teaches nothing.
 * Reduced motion: no arrival, shockwave, shudder, flecks, sweep, or glow —
 * the stamp simply appears at its final rotation and tint with its caption.
 */
export function PerfectStamp({
  grades = DEFAULT_GRADES,
  onGrade,
  className,
}: PerfectStampProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const activeGrades = grades.length > 0 ? grades : DEFAULT_GRADES;

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [phase, setPhase] = React.useState<Phase>("impact");
  const [runKey, setRunKey] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [runsCount, setRunsCount] = React.useState(0);
  const [bestIndex, setBestIndex] = React.useState<number | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  const pendingArrivalRef = React.useRef<{ grade: Grade } | null>(null);
  const descendTimer = React.useRef<number | null>(null);
  const busyTimer = React.useRef<number | null>(null);

  const shudderX = useMotionValue<number>(0);
  const shudderY = useMotionValue<number>(0);
  const shudderXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shudderYAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => {
    return () => {
      if (descendTimer.current !== null)
        window.clearTimeout(descendTimer.current);
      if (busyTimer.current !== null) window.clearTimeout(busyTimer.current);
      shudderXAnim.current?.stop();
      shudderYAnim.current?.stop();
    };
  }, []);

  const runShudder = (grade: Grade) => {
    shudderXAnim.current?.stop();
    shudderYAnim.current?.stop();
    shudderX.jump(0);
    shudderY.jump(0);
    const amp = shudderAmplitudeFor(grade);
    shudderXAnim.current = animate(shudderX, [0, amp, 0], {
      duration: SHUDDER_S,
      ease: easings.move,
      times: [...SHUDDER_TIMES],
    });
    shudderYAnim.current = animate(shudderY, [0, -Math.round(amp * 0.6), 0], {
      duration: SHUDDER_S,
      ease: easings.move,
      times: [...SHUDDER_TIMES],
    });
  };

  // `phase` is set synchronously in handleGrade, in the same batch as
  // activeIndex/runKey — this only schedules the timer that later flips it
  // to "impact". Keeping the two apart would let a repeat press mount the
  // next stamp (once AnimatePresence clears the exiting one) while `phase`
  // still read stale from the previous run.
  const scheduleImpact = (grade: Grade) => {
    if (descendTimer.current !== null)
      window.clearTimeout(descendTimer.current);
    descendTimer.current = window.setTimeout(
      () => {
        descendTimer.current = null;
        if (!motionSafeRef.current) return;
        setPhase("impact");
        runShudder(grade);
        if (busyTimer.current !== null) window.clearTimeout(busyTimer.current);
        busyTimer.current = window.setTimeout(() => {
          busyTimer.current = null;
          setBusy(false);
        }, IMPACT_HOLD_MS);
      },
      arriveDurationFor(grade) * 1000,
    );
  };

  const handleExitComplete = () => {
    const pending = pendingArrivalRef.current;
    pendingArrivalRef.current = null;
    if (pending) scheduleImpact(pending.grade);
  };

  const handleGrade = () => {
    if (busy) return;
    const nextIndex =
      activeIndex === null ? 0 : (activeIndex + 1) % activeGrades.length;
    const grade = activeGrades[nextIndex];
    if (!grade) return;

    const nextRuns = runsCount + 1;
    const nextBest =
      bestIndex === null || nextIndex < bestIndex ? nextIndex : bestIndex;
    const bestLabel = activeGrades[nextBest]?.label ?? grade.label;
    setRunsCount(nextRuns);
    setBestIndex(nextBest);
    setAnnounce(
      `${grade.label}. ${nextRuns} run${nextRuns === 1 ? "" : "s"} so far, best ${bestLabel}.`,
    );
    onGrade?.(grade.label);

    const hadPrevious = activeIndex !== null;
    setRunKey((k) => k + 1);
    setActiveIndex(nextIndex);

    if (!motionSafe) {
      pendingArrivalRef.current = null;
      if (descendTimer.current !== null) {
        window.clearTimeout(descendTimer.current);
        descendTimer.current = null;
      }
      setPhase("impact");
      return;
    }

    setPhase("descend");
    setBusy(true);
    if (hadPrevious) {
      pendingArrivalRef.current = { grade };
    } else {
      scheduleImpact(grade);
    }
  };

  const activeGrade =
    activeIndex !== null ? activeGrades[activeIndex] : undefined;
  const isFailed = activeGrade?.id === "failed";
  const isPerfect = activeGrade?.id === "perfect";
  const showImpactEffects = motionSafe && phase === "impact" && !!activeGrade;
  const caption = captionFor(activeGrade);

  const bestGrade = bestIndex !== null ? activeGrades[bestIndex] : undefined;
  const sessionLine =
    runsCount > 0 && bestGrade
      ? `${runsCount} run${runsCount === 1 ? "" : "s"} · best ${bestGrade.label}`
      : "0 runs · —";

  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-3", className)}>
      <motion.div
        className="relative overflow-hidden rounded-3 border border-hairline bg-card shadow-raised"
        style={{ x: shudderX, y: shudderY }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
          {RUN_STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-start gap-0.5">
              <span className="text-label text-ink-3">{stat.label}</span>
              <span className="font-mono text-xs font-semibold text-ink-2 tabular-nums">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <div className="relative flex h-44 items-center justify-center">
          {showImpactEffects && isPerfect && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <motion.div
                className="size-36 rounded-full blur-2xl"
                style={{
                  background: `conic-gradient(from 0deg, transparent, ${accentFor("perfect")}, transparent 60%)`,
                  opacity: 0.4,
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 6, ease: "linear", repeat: Infinity }}
              />
            </div>
          )}

          {showImpactEffects && !isFailed && (
            <motion.span
              key={`ring-${runKey}`}
              aria-hidden
              className="pointer-events-none absolute size-0"
              style={{ left: "50%", top: "50%" }}
              initial={{ scale: 0.5, opacity: 0.6 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            >
              <span
                className="absolute top-0 left-0 block -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  width: RING_SIZE,
                  height: RING_SIZE,
                  borderColor: activeGrade
                    ? accentFor(activeGrade.id)
                    : undefined,
                }}
              />
            </motion.span>
          )}

          {activeIndex === null && (
            <div
              aria-hidden
              className="absolute rounded-2 border border-dashed opacity-25"
              style={{
                width: STAMP_W,
                height: STAMP_H,
                borderColor: "var(--ink-3)",
              }}
            />
          )}

          <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
            {activeIndex !== null && activeGrade && (
              <motion.div
                key={runKey}
                aria-hidden
                className="relative z-10 flex flex-col items-center justify-center rounded-2"
                style={{
                  width: STAMP_W,
                  height: STAMP_H,
                  borderStyle: "solid",
                  borderWidth: borderWidthFor(activeGrade.id),
                  borderColor: accentFor(activeGrade.id),
                  backgroundColor: activeGrade.tint,
                  color: accentFor(activeGrade.id),
                }}
                initial={
                  motionSafe
                    ? {
                        y: ARRIVE_Y,
                        scale: ARRIVE_SCALE,
                        rotate:
                          activeGrade.rotation +
                          signedExtra(activeGrade.rotation, ARRIVE_TILT_EXTRA),
                        opacity: 1,
                      }
                    : false
                }
                animate={
                  phase === "descend"
                    ? {
                        y: 0,
                        scale: SETTLE_SCALE,
                        rotate:
                          activeGrade.rotation +
                          signedExtra(activeGrade.rotation, SETTLE_TILT_EXTRA),
                        opacity: 1,
                      }
                    : {
                        y: 0,
                        scale: 1,
                        rotate: activeGrade.rotation,
                        opacity: 1,
                      }
                }
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        scale: 0.94,
                        transition: exitFor(durations.base),
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? phase === "descend"
                      ? {
                          duration: arriveDurationFor(activeGrade),
                          ease: arriveEaseFor(activeGrade),
                        }
                      : { scale: springs.flick, rotate: springs.flick }
                    : { duration: 0 }
                }
              >
                <span className="font-mono text-2xl leading-none font-black tracking-[0.06em]">
                  {activeGrade.label}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {showImpactEffects && activeGrade && (
            <span
              key={`flecks-${runKey}`}
              aria-hidden
              style={{ left: "50%", top: "50%" }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            >
              {FLECKS.slice(0, activeGrade.flecks).map((fleck, i) => (
                <motion.span
                  key={i}
                  className="absolute size-1 rounded-full"
                  style={{ background: accentFor(activeGrade.id) }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: fleck.dx, y: fleck.dy, opacity: 0 }}
                  transition={{
                    duration: durations.slow,
                    ease: easings.exit,
                    delay: fleck.delay,
                  }}
                />
              ))}
            </span>
          )}

          {showImpactEffects && isPerfect && (
            <motion.span
              key={`sweep-${runKey}`}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3"
              style={{
                background: `linear-gradient(100deg, transparent, color-mix(in oklab, var(--success, #047857) 45%, var(--card)), transparent)`,
              }}
              initial={{ left: "-40%" }}
              animate={{ left: "120%" }}
              transition={{ duration: durations.slow, ease: easings.move }}
            />
          )}
        </div>

        <div className="flex h-6 items-center justify-center border-t border-hairline px-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={caption ?? "none"}
              className="text-label text-ink-3 normal-case"
              initial={motionSafe ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              {caption ?? ""}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex w-full items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {sessionLine}
        </span>
        <button
          type="button"
          aria-label="Grade the run"
          onClick={handleGrade}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-label text-ink-2 transition-colors hover:text-ink",
            "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          Grade
        </button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
