"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** Stage geometry, in SVG user units (viewBox is a square STAGE_SIZE). */
const STAGE_SIZE = 260;
const CENTER = STAGE_SIZE / 2;
const TARGET_RADIUS = 64;
const START_RADIUS = 122;
const END_RADIUS = 0;
const RING_STROKE = 3;

/** Fixed half-width of the CLOSE tolerance band, in px. This one never narrows. */
const CLOSE_BAND = 16;

/**
 * Escalation tables, indexed by the streak already banked when a round
 * starts (clamped to the last entry). Every perfect/close narrows the next
 * PERFECT band and shortens the next shrink; a miss drops the streak to 0,
 * which snaps both tables back to their first entry.
 */
const PERFECT_BAND_TABLE = [9, 8, 7, 6, 6, 5, 5, 4] as const;
const DURATION_TABLE_MS = [
  2400, 2100, 1850, 1650, 1450, 1300, 1150, 1000,
] as const;

/**
 * Reduced motion steps through this fixed fraction sequence (of the
 * START→END span) instead of tweening continuously — same escalation table
 * decides the total time, just spent as discrete jumps instead of a glide.
 */
const STEP_FRACTIONS = [1, 0.78, 0.58, 0.4, 0.26, 0.15, 0.07, 0] as const;

/** Beat between a resolved round and the next ring spawning. */
const SPAWN_DELAY_MS = 800;

type TapResult = "perfect" | "close" | "miss";

const SCORE_FOR = {
  perfect: 100,
  close: 40,
  miss: 0,
} as const satisfies Record<TapResult, number>;

const TARGET_COLOR = "color-mix(in oklab, var(--primary) 85%, transparent)";
const INCOMING_COLOR = "color-mix(in oklab, var(--primary) 68%, transparent)";
const PERFECT_COLOR =
  "color-mix(in oklab, var(--success, #047857) 82%, transparent)";
const CLOSE_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 82%, transparent)";
const MISS_COLOR = "color-mix(in oklab, var(--ink-3) 60%, transparent)";
const PERFECT_BAND_COLOR =
  "color-mix(in oklab, var(--success, #047857) 20%, transparent)";
const CLOSE_BAND_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 13%, transparent)";

const formatError = (px: number): string =>
  `${px >= 0 ? "+" : "-"}${Math.abs(px)}px`;

/** Fixed, deterministic radial vectors — no Math.random, identical every burst. */
const buildVectors = (count: number, spread: number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = -TAU / 4 + (i / count) * TAU;
    return { dx: Math.cos(angle) * spread, dy: Math.sin(angle) * spread };
  });

const PERFECT_SPARKS = buildVectors(8, 52);
const CLOSE_FLECKS = buildVectors(3, 28);

/**
 * The one-shot celebration layer for a resolved tap. Perfect gets a fast
 * expanding shockwave ring plus eight sparks; close gets a softer, shorter
 * pulse plus three flecks; miss gets a single muted flash across the stage.
 * Mounted fresh under a `key` per round so every fire replays from scratch.
 */
function TapEffects({ kind }: { kind: TapResult }): React.JSX.Element {
  if (kind === "perfect") {
    return (
      <>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: PERFECT_COLOR }}
          initial={{ scale: 0.55, opacity: 0.9 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {PERFECT_SPARKS.map((v, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute size-[3px] rounded-full"
              style={{ background: PERFECT_COLOR }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: v.dx, y: v.dy, opacity: 0, scale: 0.4 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ))}
        </span>
      </>
    );
  }

  if (kind === "close") {
    return (
      <>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: CLOSE_COLOR }}
          initial={{ scale: 0.78, opacity: 0.75 }}
          animate={{ scale: 1.22, opacity: 0 }}
          transition={{ duration: durations.base, ease: easings.exit }}
        />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {CLOSE_FLECKS.map((v, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute size-[2.5px] rounded-full"
              style={{ background: CLOSE_COLOR }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: v.dx, y: v.dy, opacity: 0 }}
              transition={{ duration: durations.base, ease: easings.exit }}
            />
          ))}
        </span>
      </>
    );
  }

  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 rounded-full"
      style={{ background: MISS_COLOR }}
      initial={{ opacity: 0.55 }}
      animate={{ opacity: 0 }}
      transition={{ duration: durations.fast, ease: easings.exit }}
    />
  );
}

export type AccuracyRingProps = {
  /** Fires once a round resolves, with the judged result and the signed pixel error. */
  onResult?: (result: TapResult, errorPx: number) => void;
  className?: string;
};

/**
 * A precision timing check: a TARGET ring sits fixed at the center while an
 * INCOMING ring shrinks toward it on a tween, and the stage itself is a
 * button — click, or Space/Enter, freeze the judgment against whatever the
 * ring's LIVE motion value reads at that instant, never a stale render.
 * Landing inside the escalating tight band flashes both rings together,
 * merges them, and throws a shockwave and eight sparks for +100; the wider
 * band is a softer pulse of three flecks for +40; anything outside that, or
 * letting the ring shrink through the target untapped, collapses it with a
 * muted flash for +0 and drops the streak back to zero. Each perfect or
 * close hit also shaves the next ring's shrink time off a fixed duration
 * table and narrows the next perfect band, so the check gets harder the
 * longer the streak holds. The signed pixel error — "+4px" for tapping
 * early while the ring is still bigger than the target, "-2px" for tapping
 * late once it has already shrunk past — is the actual lesson and is
 * printed every round so the player can correct, not just see a verdict.
 * Reduced motion: the incoming ring steps through a fixed sequence of radii
 * on a timer instead of tweening continuously, tapping judges the same
 * fixed bands the same way, and the shockwave/sparks/pulse are skipped.
 */
export function AccuracyRing({
  onResult,
  className,
}: AccuracyRingProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const motionSafeRef = React.useRef(motionSafe);
  const onResultRef = React.useRef(onResult);

  const [score, setScore] = React.useState(0);
  const [streak, setStreak] = React.useState(0);
  const [bestStreak, setBestStreak] = React.useState(0);
  const [roundBand, setRoundBand] = React.useState<number>(
    PERFECT_BAND_TABLE[0] ?? 9,
  );
  const [caption, setCaption] = React.useState<
    "perfect" | "close" | "missed" | null
  >(null);
  const [errorPx, setErrorPx] = React.useState<number | null>(null);
  const [fx, setFx] = React.useState<{ key: number; kind: TapResult | null }>({
    key: 0,
    kind: null,
  });
  const [announce, setAnnounce] = React.useState("");

  const scoreRef = React.useRef(0);
  const streakRef = React.useRef(0);
  const bestStreakRef = React.useRef(0);
  const roundBandRef = React.useRef<number>(PERFECT_BAND_TABLE[0] ?? 9);
  const resolvedRef = React.useRef(true);

  const radiusMV = useMotionValue<number>(START_RADIUS);
  const tweenRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const spawnTimerRef = React.useRef<number | null>(null);
  const stepTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  React.useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const resolveRound = (source: "tap" | "timeout") => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;

    tweenRef.current?.stop();
    tweenRef.current = null;
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }

    const liveRadius = radiusMV.get();
    const error = Math.round(liveRadius - TARGET_RADIUS);
    const absError = Math.abs(error);
    const band = roundBandRef.current;

    let result: TapResult;
    if (source === "timeout") {
      result = "miss";
    } else if (absError <= band) {
      result = "perfect";
    } else if (absError <= CLOSE_BAND) {
      result = "close";
    } else {
      result = "miss";
    }

    const nextScore = scoreRef.current + SCORE_FOR[result];
    scoreRef.current = nextScore;
    setScore(nextScore);

    const nextStreak = result === "miss" ? 0 : streakRef.current + 1;
    streakRef.current = nextStreak;
    setStreak(nextStreak);
    if (nextStreak > bestStreakRef.current) {
      bestStreakRef.current = nextStreak;
      setBestStreak(nextStreak);
    }

    setErrorPx(error);
    setCaption(result === "miss" ? "missed" : result);
    setFx((prev) => ({ key: prev.key + 1, kind: result }));
    setAnnounce(
      `${result === "miss" ? "Missed" : result === "perfect" ? "Perfect" : "Close"}. Error ${formatError(error)}. Score ${nextScore}.`,
    );

    // PERFECT snaps onto the target — the "merge". CLOSE is left exactly
    // where the tap actually caught it, so the visible gap keeps telling the
    // truth. MISS collapses away.
    if (motionSafeRef.current) {
      if (result === "perfect") {
        animate(radiusMV, TARGET_RADIUS, springs.flick);
      } else if (result === "miss" && liveRadius > END_RADIUS) {
        animate(radiusMV, END_RADIUS, {
          duration: durations.fast,
          ease: easings.exit,
        });
      }
    } else if (result === "perfect") {
      radiusMV.jump(TARGET_RADIUS);
    } else if (result === "miss") {
      radiusMV.jump(END_RADIUS);
    }

    onResultRef.current?.(result, error);

    spawnTimerRef.current = window.setTimeout(() => {
      spawnTimerRef.current = null;
      startRound(nextStreak);
    }, SPAWN_DELAY_MS);
  };

  const scheduleStep = (index: number, stepMs: number) => {
    stepTimerRef.current = window.setTimeout(() => {
      stepTimerRef.current = null;
      const fraction = STEP_FRACTIONS[index] ?? 0;
      radiusMV.jump(END_RADIUS + (START_RADIUS - END_RADIUS) * fraction);
      if (index >= STEP_FRACTIONS.length - 1) {
        resolveRound("timeout");
        return;
      }
      scheduleStep(index + 1, stepMs);
    }, stepMs);
  };

  const startRound = (streakForRound: number) => {
    resolvedRef.current = false;
    setCaption(null);
    setErrorPx(null);
    setFx((prev) => ({ ...prev, kind: null }));

    const durationIndex = Math.min(
      streakForRound,
      DURATION_TABLE_MS.length - 1,
    );
    const duration =
      DURATION_TABLE_MS[durationIndex] ?? DURATION_TABLE_MS[0] ?? 1000;
    const bandIndex = Math.min(streakForRound, PERFECT_BAND_TABLE.length - 1);
    const band = PERFECT_BAND_TABLE[bandIndex] ?? PERFECT_BAND_TABLE[0] ?? 4;
    roundBandRef.current = band;
    setRoundBand(band);

    radiusMV.jump(START_RADIUS);

    if (motionSafeRef.current) {
      tweenRef.current?.stop();
      tweenRef.current = animate(radiusMV, END_RADIUS, {
        duration: duration / 1000,
        ease: "linear",
        onComplete: () => resolveRound("timeout"),
      });
    } else {
      const stepMs = Math.max(
        1,
        Math.round(duration / (STEP_FRACTIONS.length - 1)),
      );
      scheduleStep(1, stepMs);
    }
  };

  // Mount only. The very first round is kicked off from a timer callback
  // (not synchronously in the effect body) purely so its setState calls
  // land outside React's commit — every later round is already started
  // that way naturally, from the spawn timer or a tween's onComplete.
  React.useEffect(() => {
    spawnTimerRef.current = window.setTimeout(() => {
      spawnTimerRef.current = null;
      startRound(0);
    }, 0);
    return () => {
      tweenRef.current?.stop();
      tweenRef.current = null;
      if (spawnTimerRef.current !== null) {
        window.clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      if (stepTimerRef.current !== null) {
        window.clearTimeout(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    };
  }, []);

  const handleTap = () => resolveRound("tap");

  const targetStroke = fx.kind === "perfect" ? PERFECT_COLOR : TARGET_COLOR;
  const incomingStroke =
    fx.kind === "perfect"
      ? PERFECT_COLOR
      : fx.kind === "close"
        ? CLOSE_COLOR
        : fx.kind === "miss"
          ? MISS_COLOR
          : INCOMING_COLOR;
  const captionColor =
    caption === "perfect"
      ? PERFECT_COLOR
      : caption === "close"
        ? CLOSE_COLOR
        : caption === "missed"
          ? MISS_COLOR
          : "var(--ink-3)";

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-5 rounded-4 border border-hairline bg-surface-1 p-6",
        className,
      )}
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-label text-ink-3">score</span>
          <Readout value={score} size="lg" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-label text-ink-3">streak</span>
          <Readout value={streak} size="md" />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-label text-ink-3">best</span>
          <Readout value={bestStreak} size="md" />
        </div>
      </div>

      <button
        type="button"
        onClick={handleTap}
        aria-label="Tap when the rings match"
        className={cn(
          "relative rounded-full outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
        style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
      >
        <svg
          aria-hidden
          width={STAGE_SIZE}
          height={STAGE_SIZE}
          viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`}
          className="block"
        >
          {/* CLOSE tolerance annulus — fixed width, never narrows. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TARGET_RADIUS}
            fill="none"
            stroke={CLOSE_BAND_COLOR}
            strokeWidth={CLOSE_BAND * 2}
          />
          {/* PERFECT tolerance annulus — narrows with the current streak. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TARGET_RADIUS}
            fill="none"
            stroke={PERFECT_BAND_COLOR}
            strokeWidth={roundBand * 2}
          />
          {/* TARGET ring — the fixed mark to land on. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TARGET_RADIUS}
            fill="none"
            stroke={targetStroke}
            strokeWidth={RING_STROKE}
            style={{ transition: "stroke 200ms ease" }}
          />
          {/* INCOMING ring — its radius IS the motion value read at tap time. */}
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={radiusMV}
            fill="none"
            stroke={incomingStroke}
            strokeWidth={RING_STROKE}
            style={{ transition: "stroke 200ms ease" }}
          />
        </svg>

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          {motionSafe && fx.kind !== null && (
            <span key={fx.key} className="absolute inset-0">
              <TapEffects kind={fx.kind} />
            </span>
          )}
        </span>
      </button>

      <div className="flex h-6 min-w-0 items-center gap-2 font-mono text-sm">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption ?? "idle"}
            style={{ color: captionColor }}
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
            {caption ?? "ready"}
          </motion.span>
        </AnimatePresence>
        {errorPx !== null && (
          <span
            className="text-ink-3 tabular-nums"
            style={{ color: captionColor }}
          >
            {formatError(errorPx)}
          </span>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
