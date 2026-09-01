"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Track geometry, in px — every zone and travel bound below is measured
 * against this box. Fixed, never measured, so positions stay deterministic. */
const TRACK_W = 260;
const TRACK_H = 36;
const MARKER_W = 4;

/** Marker travel bounds — the left edge sweeps from 0 to this, keeping the
 * marker's own width fully inside the track at both extremes. */
const X_MIN = 0;
const X_MAX = TRACK_W - MARKER_W;

/** The wide, forgiving zone. Fixed — never moves, never resizes. */
const GOOD_ZONE_LEFT = 92;
const GOOD_ZONE_WIDTH = 130;

/** The perfect pocket's centre is fixed and deliberately off the good
 * zone's own centre (157) — a player has to learn exactly where it sits,
 * not assume it's the middle of the wide zone. */
const PERFECT_CENTER = 182;

/** Leg duration in seconds, indexed by streak and clamped to the last
 * entry — each successful stop shifts the next sweep one row faster. */
const DURATION_TABLE = [1.3, 1.1, 0.95, 0.8, 0.68, 0.58] as const;

/** Perfect-zone width in px, indexed the same way as DURATION_TABLE — the
 * pocket narrows in lockstep with the sweep speeding up. Even at its
 * narrowest the pocket stays nested well inside GOOD_ZONE. */
const PERFECT_WIDTH_TABLE = [26, 22, 18, 15, 12, 10] as const;

const rampIndexFor = (streak: number, length: number): number =>
  Math.min(Math.max(streak, 0), length - 1);

const legDurationFor = (streak: number): number =>
  DURATION_TABLE[rampIndexFor(streak, DURATION_TABLE.length)] ??
  DURATION_TABLE[0] ??
  1.3;

const perfectWidthFor = (streak: number): number =>
  PERFECT_WIDTH_TABLE[rampIndexFor(streak, PERFECT_WIDTH_TABLE.length)] ??
  PERFECT_WIDTH_TABLE[0] ??
  26;

/** Reduced motion swaps the continuous sweep for a walk through this fixed
 * table instead — one full left-right-left lap. Built from a 7-point leg
 * (0, 60, 110, 150, 182, 214, 256) mirrored back minus the duplicated ends;
 * point 182 lands exactly on PERFECT_CENTER so the pocket stays reachable
 * even without continuous motion. */
const REDUCED_STEP_POSITIONS = [
  0, 60, 110, 150, 182, 214, 256, 214, 182, 150, 110, 60,
] as const;
/** Gaps in one leg of the table above (7 points, 6 gaps) — used to turn a
 * ramp duration into a per-step interval. */
const STEPS_PER_LEG = 6;

/** How long the sweep stays stopped before the next lap begins. */
const BEAT_MS = 900;
/** How long a reduced-motion result's static highlight holds. */
const RESULT_BEAT_MS = 550;

const RING_SIZE = 48;

const TAU = Math.PI * 2;

/** Eight fixed spark vectors for a perfect stop — evenly spaced, never
 * random, so every flare is identical and SSR-safe. */
const SPARK_COUNT = 8;
const SPARK_SPREAD = 22;
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

/** Three fixed fleck vectors for a good stop. */
const FLECK_COUNT = 3;
const FLECK_SPREAD = 16;
const FLECKS = Array.from({ length: FLECK_COUNT }, (_, i) => {
  const angle = (i / FLECK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * FLECK_SPREAD,
    dy: Math.sin(angle) * FLECK_SPREAD,
  };
});

/** Shake keyframes for a miss — exactly three: rest, deflect, rest. */
const SHAKE_X = [0, -8, 0] as const;
const SHAKE_TIMES = [0, 0.5, 1] as const;
const SHAKE_S = 0.18;

const GOOD_TINT =
  "color-mix(in oklab, var(--success, #047857) 20%, transparent)";
const GOOD_BORDER =
  "color-mix(in oklab, var(--success, #047857) 45%, transparent)";
const GOOD_FLASH =
  "color-mix(in oklab, var(--success, #047857) 60%, transparent)";
const FLECK_COLOR =
  "color-mix(in oklab, var(--success, #047857) 80%, var(--primary-foreground))";

const PERFECT_TINT =
  "color-mix(in oklab, var(--warning, #b45309) 26%, transparent)";
const PERFECT_BORDER =
  "color-mix(in oklab, var(--warning, #b45309) 55%, transparent)";
const PERFECT_FLASH =
  "color-mix(in oklab, var(--warning, #b45309) 90%, transparent)";
const RING_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 62%, transparent)";
const SPARK_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 85%, var(--primary-foreground))";

export type TimingBarProps = {
  /** Fires with the judged result the instant a stop is scored. */
  onResult?: (result: "perfect" | "good" | "miss") => void;
  className?: string;
};

/**
 * A timing bar built for one honest skill check: stop a sweeping marker
 * inside a target zone whose narrow "perfect" pocket sits at a fixed,
 * deliberately off-centre spot nested inside the wider "good" zone — never
 * dead-centre, so it has to be learned rather than guessed. The marker
 * sweeps on a continuous mirrored tween; "Stop the marker" reads its
 * position straight off the live motion value the instant it is pressed,
 * never from React state, so the hit-test can never lag a frame behind
 * what's on screen. A perfect stop flashes the pocket, pulses a ring, and
 * throws eight sparks; a good stop gets a smaller flash and three flecks;
 * either way the streak climbs and the next sweep gets faster off a fixed
 * duration table while the pocket narrows off a fixed width table. A miss
 * shakes the marker, dims the track, and resets both tables to their
 * starting row; after a beat the sweep restarts on its own at the new
 * difficulty. Reduced motion: the marker steps across a fixed table of
 * positions on a timer instead of sweeping continuously — the same live
 * position still decides perfect, good, or miss — and results skip the
 * sparks, shake, and ring in favor of a brief static highlight.
 */
export function TimingBar({
  onResult,
  className,
}: TimingBarProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [streak, setStreak] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [caption, setCaption] = React.useState<
    "perfect" | "good" | "miss" | null
  >(null);
  const [resultKey, setResultKey] = React.useState(0);
  const [resultMarkerX, setResultMarkerX] = React.useState(X_MIN);
  // The perfect-zone width judged for the stop just resolved — captured
  // separately from the live, ramp-driven `perfectWidth` below so a hit's
  // flash/ring show the pocket as it actually was when judged, not the
  // (already narrower) pocket the next sweep is about to use.
  const [resultPerfectWidth, setResultPerfectWidth] = React.useState(() =>
    perfectWidthFor(0),
  );
  const [dimmed, setDimmed] = React.useState(false);
  const [resultBeatVisible, setResultBeatVisible] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for the stop handler and every timer
  // scheduled ahead of time — reading React state there would race a stale
  // closure the moment a result lands mid-flight.
  const streakRef = React.useRef(0);
  const bestRef = React.useRef(0);
  const isSweepingRef = React.useRef(false);
  const stepIndexRef = React.useRef(0);

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onResultRef = React.useRef(onResult);
  React.useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const markerX = useMotionValue<number>(X_MIN);
  const shakeX = useMotionValue<number>(0);

  const sweepAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const stepTimer = React.useRef<number | null>(null);
  const beatTimer = React.useRef<number | null>(null);
  const resultBeatTimer = React.useRef<number | null>(null);

  /** Reduced-motion walk through the fixed step table, one hop at a time.
   * The loop re-schedules through a ref rather than calling its own binding:
   * a self-referential callback is read before it is declared, which the
   * compiler lint rejects (the same shape as the rAF-loop rule). */
  const scheduleStepRef = React.useRef<((intervalMs: number) => void) | null>(
    null,
  );

  const scheduleStep = React.useCallback(
    (intervalMs: number) => {
      stepTimer.current = window.setTimeout(() => {
        stepTimer.current = null;
        const idx = stepIndexRef.current % REDUCED_STEP_POSITIONS.length;
        markerX.jump(REDUCED_STEP_POSITIONS[idx] ?? X_MIN);
        stepIndexRef.current += 1;
        scheduleStepRef.current?.(intervalMs);
      }, intervalMs);
    },
    [markerX],
  );

  React.useEffect(() => {
    scheduleStepRef.current = scheduleStep;
  }, [scheduleStep]);

  /** Pure imperative kickoff — motion values and timers only, never
   * setState — so it's safe to call directly from the mount effect body.
   * Stable via useCallback for the same reason as scheduleStep above. */
  const beginSweep = React.useCallback(
    (streakAtStart: number) => {
      sweepAnim.current?.stop();
      if (stepTimer.current !== null) {
        window.clearTimeout(stepTimer.current);
        stepTimer.current = null;
      }
      markerX.jump(X_MIN);
      isSweepingRef.current = true;

      const legS = legDurationFor(streakAtStart);

      if (motionSafeRef.current) {
        sweepAnim.current = animate(markerX, [X_MIN, X_MAX, X_MIN], {
          duration: legS * 2,
          times: [0, 0.5, 1],
          ease: easings.move,
          repeat: Infinity,
        });
      } else {
        stepIndexRef.current = 1;
        scheduleStep((legS * 1000) / STEPS_PER_LEG);
      }
    },
    [markerX, scheduleStep],
  );

  React.useEffect(() => {
    beginSweep(streakRef.current);
    return () => {
      sweepAnim.current?.stop();
      shakeAnim.current?.stop();
      if (stepTimer.current !== null) window.clearTimeout(stepTimer.current);
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
      if (resultBeatTimer.current !== null)
        window.clearTimeout(resultBeatTimer.current);
    };
  }, [beginSweep]);

  const handleStop = () => {
    if (!isSweepingRef.current) return;
    isSweepingRef.current = false;

    sweepAnim.current?.stop();
    if (stepTimer.current !== null) {
      window.clearTimeout(stepTimer.current);
      stepTimer.current = null;
    }

    const pos = markerX.get();
    const center = pos + MARKER_W / 2;
    setResultMarkerX(pos);

    const streakNow = streakRef.current;
    const perfectW = perfectWidthFor(streakNow);
    setResultPerfectWidth(perfectW);
    const pLeft = PERFECT_CENTER - perfectW / 2;
    const pRight = PERFECT_CENTER + perfectW / 2;

    let result: "perfect" | "good" | "miss";
    if (center >= pLeft && center <= pRight) {
      result = "perfect";
    } else if (
      center >= GOOD_ZONE_LEFT &&
      center <= GOOD_ZONE_LEFT + GOOD_ZONE_WIDTH
    ) {
      result = "good";
    } else {
      result = "miss";
    }

    setResultKey((k) => k + 1);
    setCaption(result);

    if (resultBeatTimer.current !== null) {
      window.clearTimeout(resultBeatTimer.current);
      resultBeatTimer.current = null;
    }

    if (result === "miss") {
      streakRef.current = 0;
      setStreak(0);
      setDimmed(true);
      if (motionSafeRef.current) {
        shakeAnim.current?.stop();
        shakeX.jump(0);
        shakeAnim.current = animate(shakeX, [...SHAKE_X], {
          duration: SHAKE_S,
          times: [...SHAKE_TIMES],
          ease: easings.move,
        });
      }
      setAnnounce("Miss. Streak reset to zero.");
      onResultRef.current?.("miss");
    } else {
      const next = streakNow + 1;
      streakRef.current = next;
      setStreak(next);
      if (next > bestRef.current) {
        bestRef.current = next;
        setBest(next);
      }
      setDimmed(false);
      if (!motionSafeRef.current) {
        setResultBeatVisible(true);
        resultBeatTimer.current = window.setTimeout(() => {
          resultBeatTimer.current = null;
          setResultBeatVisible(false);
        }, RESULT_BEAT_MS);
      }
      setAnnounce(
        `${result === "perfect" ? "Perfect" : "Good"}. Streak ${next}.`,
      );
      onResultRef.current?.(result);
    }

    if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
    beatTimer.current = window.setTimeout(() => {
      beatTimer.current = null;
      setDimmed(false);
      beginSweep(streakRef.current);
    }, BEAT_MS);
  };

  const perfectWidth = perfectWidthFor(streak);
  const perfectLeft = PERFECT_CENTER - perfectWidth / 2;
  const resultPerfectLeft = PERFECT_CENTER - resultPerfectWidth / 2;
  const particleOriginLeft = resultMarkerX + MARKER_W / 2;

  return (
    <div
      className={cn(
        "inline-flex w-fit flex-col gap-3 rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 tabular-nums">
        streak {streak} · best {best}
      </span>

      <div
        aria-hidden
        className={cn(
          "relative overflow-hidden rounded-3 border border-hairline bg-surface-2 transition-opacity duration-300",
          dimmed && "opacity-50",
        )}
        style={{ width: TRACK_W, height: TRACK_H }}
      >
        <span
          className="absolute inset-y-0 rounded-1"
          style={{
            left: GOOD_ZONE_LEFT,
            width: GOOD_ZONE_WIDTH,
            background: GOOD_TINT,
            border: `1px solid ${GOOD_BORDER}`,
          }}
        />
        <span
          className="absolute inset-y-0 rounded-1"
          style={{
            left: perfectLeft,
            width: perfectWidth,
            background: PERFECT_TINT,
            border: `1px solid ${PERFECT_BORDER}`,
          }}
        />

        {motionSafe && caption === "good" && resultKey > 0 && (
          <motion.span
            key={`good-flash-${resultKey}`}
            className="absolute inset-y-0 rounded-1"
            style={{
              left: GOOD_ZONE_LEFT,
              width: GOOD_ZONE_WIDTH,
              background: GOOD_FLASH,
            }}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}
        {motionSafe && caption === "perfect" && resultKey > 0 && (
          <motion.span
            key={`perfect-flash-${resultKey}`}
            className="absolute inset-y-0 rounded-1"
            style={{
              left: resultPerfectLeft,
              width: resultPerfectWidth,
              background: PERFECT_FLASH,
            }}
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}

        <motion.span
          className="absolute top-0 h-full"
          style={{ left: 0, width: MARKER_W, x: markerX }}
        >
          <motion.span
            className="block h-full w-full rounded-full bg-primary shadow-raised"
            style={{ x: shakeX }}
          />
        </motion.span>

        {motionSafe && caption === "perfect" && resultKey > 0 && (
          <motion.span
            key={`ring-${resultKey}`}
            className="pointer-events-none absolute rounded-full border-2"
            style={{
              left: PERFECT_CENTER - RING_SIZE / 2,
              top: TRACK_H / 2 - RING_SIZE / 2,
              width: RING_SIZE,
              height: RING_SIZE,
              borderColor: RING_COLOR,
            }}
            initial={{ scale: 0.5, opacity: 0.9 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}

        {motionSafe &&
          resultKey > 0 &&
          (caption === "perfect" || caption === "good") && (
            <span
              key={`particles-${resultKey}`}
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: particleOriginLeft }}
            >
              {(caption === "perfect" ? SPARKS : FLECKS).map((v, i) => (
                <motion.span
                  key={i}
                  className="absolute size-[3px] rounded-full"
                  style={{
                    background:
                      caption === "perfect" ? SPARK_COLOR : FLECK_COLOR,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

        {!motionSafe && resultBeatVisible && caption === "perfect" && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 rounded-1"
              style={{
                left: resultPerfectLeft,
                width: resultPerfectWidth,
                background: PERFECT_FLASH,
              }}
            />
            <span
              className="pointer-events-none absolute rounded-full border-2"
              style={{
                left: PERFECT_CENTER - RING_SIZE / 2,
                top: TRACK_H / 2 - RING_SIZE / 2,
                width: RING_SIZE,
                height: RING_SIZE,
                borderColor: RING_COLOR,
              }}
            />
          </>
        )}
        {!motionSafe && resultBeatVisible && caption === "good" && (
          <span
            className="pointer-events-none absolute inset-y-0 rounded-1"
            style={{
              left: GOOD_ZONE_LEFT,
              width: GOOD_ZONE_WIDTH,
              background: GOOD_FLASH,
            }}
          />
        )}
      </div>

      <span
        aria-hidden
        className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption ?? "idle"}
            initial={motionSafe ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    y: -4,
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
      </span>

      {/* A real button: Enter and Space activate it natively, no extra
          key handling needed. */}
      <motion.button
        type="button"
        aria-label="Stop the marker"
        onClick={handleStop}
        whileTap={motionSafe ? { scale: 0.96 } : undefined}
        transition={springs.flick}
        className={cn(
          "w-full rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        STOP
      </motion.button>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
