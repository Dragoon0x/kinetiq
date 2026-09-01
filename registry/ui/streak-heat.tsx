"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** Streak counts at which the multiplier steps up: x1 -> x2 -> x3 -> x4 -> x5. */
const DEFAULT_THRESHOLDS = [3, 7, 12, 18] as const;

/** Panel warmth as a color-mix percentage against the base card/border,
 * indexed by level - 1. Motion cannot interpolate color-mix, so the step is
 * driven by a CSS transition on inline style instead of a motion value. */
const WARM_PCT_BY_LEVEL = [0, 16, 32, 50, 70] as const;

/** Numeral size + weight ladder, indexed by level - 1 — a discrete class
 * swap timed to land while the numeral is hidden mid-flip or mid-roll. */
const SIZE_CLASS_BY_LEVEL = [
  "text-4xl font-semibold",
  "text-5xl font-semibold",
  "text-5xl font-bold",
  "text-6xl font-bold",
  "text-7xl font-black",
] as const;

/** Action label ladder, indexed by level - 1 — the copy sharpens as the run
 * gets more dangerous to keep going. */
const BUTTON_LABEL_BY_LEVEL = [
  "go",
  "again",
  "keep it",
  "do not stop",
  "MAXIMUM",
] as const;

/** Tier phrase for the level-up caption, indexed by level - 2 (levels 2-5
 * are the only ones that can be "reached" by a level-up event). */
const TIER_PHRASE_BY_LEVEL = [
  "warming up",
  "heating up",
  "running hot",
  "white hot",
] as const;

/** Spark burst size, indexed by level - 2 — bigger tiers throw more sparks. */
const SPARK_COUNT_BY_LEVEL = [4, 6, 8, 10] as const;

const SPARK_SPREAD = 26;
/** Precomputed fixed spark vectors for every possible burst size, evenly
 * spaced around the numeral — computed once at module scope so every level's
 * burst is identical and SSR-safe. No Math.random. */
const SPARKS_BY_LEVEL = SPARK_COUNT_BY_LEVEL.map((count) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * TAU - TAU / 4;
    return {
      dx: Math.cos(angle) * SPARK_SPREAD,
      dy: Math.sin(angle) * SPARK_SPREAD,
    };
  }),
);

/** Four fixed heat-haze bars, evenly offset across the panel with a fixed
 * phase delay each, so the drift never looks synchronized. */
const HAZE_BARS = [
  { left: 22, delay: 0 },
  { left: 46, delay: 0.4 },
  { left: 70, delay: 0.15 },
  { left: 92, delay: 0.55 },
] as const;

const RING_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 62%, transparent)";
const SPARK_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 80%, var(--primary-foreground))";
const GLOW_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 60%, transparent)";
const HAZE_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 42%, transparent)";
const SHIMMER_GRADIENT =
  "linear-gradient(75deg, transparent, color-mix(in oklab, var(--warning, #b45309) 32%, transparent), transparent)";

const RING_SIZE = 84;
const GLOW_SIZE = 100;
const GLOW_BLOB = 44;
const SHIMMER_W = 90;
const HAZE_H = 40;
const HAZE_RISE = 30;

const PULSE_SCALE = [1, 1.035, 1] as const;
const PULSE_TIMES = [0, 0.5, 1] as const;
/** Pulse period in seconds — level 2 breathes slowly, level 3+ quickens. */
const PULSE_SLOW_S = 2.4;
const PULSE_FAST_S = 1.3;

const SHIMMER_S = 2.6;
const SHIMMER_GAP_S = 0.7;
const GLOW_ROTATE_S = 6;
const HAZE_S = 2.2;

/** How far the numeral overshoots on an advance before `flick` settles it. */
const POP_PEAK = 1.18;
/** How far the numeral drops before rolling back up to x1 on a break. */
const ROLL_DROP = 22;

/** Cooling is deliberately slower than heating — a loss should take a beat. */
const BREAK_COOL_S = 0.8;
const ROLL_DOWN_S = 0.5;
const ROLL_UP_S = 0.3;

const LEVEL_CAPTION_MS = 1200;
const BREAK_CAPTION_MS = 1300;

/** How many thresholds `streak` has cleared, counting up from x1. */
const levelFor = (streak: number, thresholds: number[]): number => {
  let level = 1;
  for (const t of thresholds) {
    if (streak >= t) level += 1;
  }
  return level;
};

/** Progress toward the next threshold, 0-1. Full once there is no next tier. */
const progressFor = (
  streak: number,
  level: number,
  thresholds: number[],
): number => {
  const prevThreshold = level <= 1 ? 0 : (thresholds[level - 2] ?? 0);
  const nextThreshold = thresholds[level - 1];
  if (nextThreshold === undefined) return 1;
  const span = nextThreshold - prevThreshold;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (streak - prevThreshold) / span));
};

const warmPctFor = (level: number): number =>
  WARM_PCT_BY_LEVEL[level - 1] ??
  WARM_PCT_BY_LEVEL[WARM_PCT_BY_LEVEL.length - 1] ??
  0;

const sizeClassFor = (level: number): string =>
  SIZE_CLASS_BY_LEVEL[level - 1] ??
  SIZE_CLASS_BY_LEVEL[SIZE_CLASS_BY_LEVEL.length - 1] ??
  "";

const buttonLabelFor = (level: number): string =>
  BUTTON_LABEL_BY_LEVEL[level - 1] ??
  BUTTON_LABEL_BY_LEVEL[BUTTON_LABEL_BY_LEVEL.length - 1] ??
  "go";

const tierPhraseFor = (level: number): string =>
  TIER_PHRASE_BY_LEVEL[level - 2] ??
  TIER_PHRASE_BY_LEVEL[TIER_PHRASE_BY_LEVEL.length - 1] ??
  "hot";

const sparksFor = (level: number) =>
  SPARKS_BY_LEVEL[level - 2] ??
  SPARKS_BY_LEVEL[SPARKS_BY_LEVEL.length - 1] ??
  [];

export type StreakHeatProps = {
  /** Streak counts at which the multiplier steps up. @default [3, 7, 12, 18] */
  thresholds?: number[];
  /** Fires whenever the heat level changes — up on a level-up crossing, and
   * back down to x1 the moment a break actually cools a heated streak. */
  onLevel?: (level: number) => void;
  className?: string;
};

/**
 * A multiplier that heats the whole panel as the streak climbs. Every
 * "advance" press rolls the streak up, pops the numeral on a `flick` spring,
 * and fills the heat bar toward the next tier; crossing one of the five
 * thresholds flips the numeral to its new value, rings a pulse, throws a
 * burst of sparks sized to the tier, and warms the panel's border and
 * background a color-mix step — all bundled into one moment, with the
 * ambient layer beneath it (pulse, then shimmer, then a rotating glow, then
 * drifting heat-haze) adding on top of the last rather than replacing it.
 * Breaking the streak cools everything at once: the panel eases back to
 * neutral on a tween well slower than any heat-up, the numeral rolls
 * downward to x1, and the ambient layers shed in reverse order across that
 * same window — cooling down is a loss, and a loss takes its time. Reduced
 * motion: no pulse, shimmer, glow, or haze at any level — heat reads through
 * color, size, and weight alone — and level changes (up or down) swap the
 * numeral instantly alongside the caption.
 */
export function StreakHeat({
  thresholds = [...DEFAULT_THRESHOLDS],
  onLevel,
  className,
}: StreakHeatProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [streak, setStreak] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [numeralLevel, setNumeralLevel] = React.useState(1);
  const [ambientLevel, setAmbientLevel] = React.useState(1);
  const [isCooling, setIsCooling] = React.useState(false);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [ringKey, setRingKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const level = levelFor(streak, thresholds);

  // Refs are the source of truth for the button handlers — reading React
  // state inside a rapid-click chain or a timer fired later would race a
  // stale closure.
  const streakRef = React.useRef(0);
  const bestRef = React.useRef(0);
  const ambientLevelRef = React.useRef(1);

  // Latest-ref mirrors, so timers and animation callbacks scheduled ahead of
  // time never act on a stale preference or callback.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onLevelRef = React.useRef(onLevel);
  React.useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);

  // Motion values, driven imperatively so each phase — pop, flip, roll, bar
  // fill — can pick its own transition without re-rendering.
  const numberScale = useMotionValue<number>(1);
  const flipScaleX = useMotionValue<number>(1);
  const rollY = useMotionValue<number>(0);
  const rollOpacity = useMotionValue<number>(1);
  const barValue = useMotionValue<number>(0);

  const numberScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const flipAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rollYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rollOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const barAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const captionTimer = React.useRef<number | null>(null);
  const coolingTimer = React.useRef<number | null>(null);
  const ambientCooldownTimer = React.useRef<number | null>(null);

  // Unmount teardown — every timer cleared, every in-flight animation stopped.
  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (coolingTimer.current !== null)
        window.clearTimeout(coolingTimer.current);
      if (ambientCooldownTimer.current !== null)
        window.clearTimeout(ambientCooldownTimer.current);
      numberScaleAnim.current?.stop();
      flipAnim.current?.stop();
      rollYAnim.current?.stop();
      rollOpacityAnim.current?.stop();
      barAnim.current?.stop();
    };
  }, []);

  const flashCaption = (text: string, ms: number) => {
    setCaption(text);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaption(null);
    }, ms);
  };

  const handleAdvance = () => {
    const prevStreak = streakRef.current;
    const nextStreak = prevStreak + 1;
    streakRef.current = nextStreak;
    setStreak(nextStreak);

    if (nextStreak > bestRef.current) {
      bestRef.current = nextStreak;
      setBest(nextStreak);
    }

    const prevLevel = levelFor(prevStreak, thresholds);
    const nextLevel = levelFor(nextStreak, thresholds);
    const nextProgress = progressFor(nextStreak, nextLevel, thresholds);

    // A fresh advance always wins over a break still cooling down.
    numberScaleAnim.current?.stop();
    flipAnim.current?.stop();
    rollYAnim.current?.stop();
    rollOpacityAnim.current?.stop();
    barAnim.current?.stop();
    // Neutralize any interrupted flip/roll so this advance always starts
    // from a fully visible numeral, whether or not it crosses a threshold.
    flipScaleX.jump(1);
    rollY.jump(0);
    rollOpacity.jump(1);
    if (coolingTimer.current !== null) {
      window.clearTimeout(coolingTimer.current);
      coolingTimer.current = null;
    }
    setIsCooling(false);
    if (ambientCooldownTimer.current !== null) {
      window.clearTimeout(ambientCooldownTimer.current);
      ambientCooldownTimer.current = null;
    }

    if (motionSafeRef.current) {
      numberScale.set(POP_PEAK);
      numberScaleAnim.current = animate(numberScale, 1, springs.flick);
      barAnim.current = animate(barValue, nextProgress, springs.flick);

      if (nextLevel > prevLevel) {
        flipAnim.current = animate(flipScaleX, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            setNumeralLevel(nextLevel);
            flipAnim.current = animate(flipScaleX, 1, {
              duration: durations.base,
              ease: easings.enter,
            });
          },
        });
        ambientLevelRef.current = nextLevel;
        setAmbientLevel(nextLevel);
        setRingKey((k) => k + 1);
        setSparkKey((k) => k + 1);
        flashCaption(
          `×${nextLevel} · ${tierPhraseFor(nextLevel)}`,
          LEVEL_CAPTION_MS,
        );
        onLevelRef.current?.(nextLevel);
      }
    } else {
      numberScale.jump(1);
      barValue.jump(nextProgress);

      if (nextLevel > prevLevel) {
        setNumeralLevel(nextLevel);
        ambientLevelRef.current = nextLevel;
        setAmbientLevel(nextLevel);
        flashCaption(
          `×${nextLevel} · ${tierPhraseFor(nextLevel)}`,
          LEVEL_CAPTION_MS,
        );
        onLevelRef.current?.(nextLevel);
      }
    }

    setAnnounce(`Streak ${nextStreak}. Multiplier times ${nextLevel}.`);
  };

  const handleBreak = () => {
    const priorStreak = streakRef.current;
    if (priorStreak <= 0) return;
    const priorLevel = levelFor(priorStreak, thresholds);
    streakRef.current = 0;

    flashCaption("cold", BREAK_CAPTION_MS);
    setAnnounce(`Streak broken at ${priorStreak}. Cooling.`);

    numberScaleAnim.current?.stop();
    numberScale.jump(1);
    flipAnim.current?.stop();
    flipScaleX.jump(1);
    barAnim.current?.stop();
    rollYAnim.current?.stop();
    rollOpacityAnim.current?.stop();
    if (ambientCooldownTimer.current !== null) {
      window.clearTimeout(ambientCooldownTimer.current);
      ambientCooldownTimer.current = null;
    }

    if (motionSafeRef.current) {
      setIsCooling(true);
      if (coolingTimer.current !== null)
        window.clearTimeout(coolingTimer.current);
      coolingTimer.current = window.setTimeout(() => {
        coolingTimer.current = null;
        setIsCooling(false);
      }, BREAK_COOL_S * 1000);

      barAnim.current = animate(barValue, 0, {
        duration: BREAK_COOL_S,
        ease: easings.exit,
      });

      rollYAnim.current = animate(rollY, ROLL_DROP, {
        duration: ROLL_DOWN_S,
        ease: easings.exit,
      });
      rollOpacityAnim.current = animate(rollOpacity, 0, {
        duration: ROLL_DOWN_S,
        ease: easings.exit,
        onComplete: () => {
          setNumeralLevel(1);
          rollY.jump(-ROLL_DROP);
          rollYAnim.current = animate(rollY, 0, {
            duration: ROLL_UP_S,
            ease: easings.enter,
          });
          rollOpacityAnim.current = animate(rollOpacity, 1, {
            duration: ROLL_UP_S,
            ease: easings.enter,
          });
        },
      });

      if (priorLevel > 1) {
        onLevelRef.current?.(1);
        const steps = Math.max(1, priorLevel - 1);
        const stepMs = (BREAK_COOL_S * 1000) / steps;
        const stepAmbientDown = () => {
          const next = Math.max(1, ambientLevelRef.current - 1);
          ambientLevelRef.current = next;
          setAmbientLevel(next);
          if (next > 1) {
            ambientCooldownTimer.current = window.setTimeout(
              stepAmbientDown,
              stepMs,
            );
          } else {
            ambientCooldownTimer.current = null;
          }
        };
        ambientCooldownTimer.current = window.setTimeout(
          stepAmbientDown,
          stepMs,
        );
      } else {
        ambientLevelRef.current = 1;
        setAmbientLevel(1);
      }
    } else {
      barValue.jump(0);
      rollY.jump(0);
      rollOpacity.jump(1);
      setNumeralLevel(1);
      ambientLevelRef.current = 1;
      setAmbientLevel(1);
      if (priorLevel > 1) onLevelRef.current?.(1);
    }

    setStreak(0);
  };

  const warmPct = warmPctFor(level);
  const panelStyle: React.CSSProperties = {
    borderColor: `color-mix(in oklab, var(--warning, #b45309) ${warmPct}%, var(--border))`,
    backgroundColor: `color-mix(in oklab, var(--warning, #b45309) ${Math.round(warmPct / 3)}%, var(--card))`,
    transitionDuration: isCooling ? `${BREAK_COOL_S * 1000}ms` : "300ms",
  };

  const sparks = sparksFor(level);

  return (
    <div
      className={cn(
        "relative w-64 overflow-hidden rounded-4 border p-5 transition-colors",
        className,
      )}
      style={panelStyle}
    >
      {motionSafe && ambientLevel >= 3 && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{ width: SHIMMER_W, left: 0, background: SHIMMER_GRADIENT }}
          animate={{ x: [-140, 340] }}
          transition={{
            duration: SHIMMER_S,
            times: [0, 1],
            ease: easings.move,
            repeat: Infinity,
            repeatDelay: SHIMMER_GAP_S,
          }}
        />
      )}

      {motionSafe && ambientLevel >= 5 && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {HAZE_BARS.map((bar, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 rounded-full"
              style={{
                left: bar.left,
                width: 3,
                height: HAZE_H,
                background: HAZE_COLOR,
              }}
              animate={{ y: [0, -HAZE_RISE, 0], opacity: [0, 0.5, 0] }}
              transition={{
                duration: HAZE_S,
                times: [...PULSE_TIMES],
                ease: easings.move,
                repeat: Infinity,
                delay: bar.delay,
              }}
            />
          ))}
        </span>
      )}

      <div className="relative z-10">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          heat
        </span>

        <div className="relative flex h-24 items-center justify-center">
          {motionSafe && ambientLevel >= 4 && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                width: GLOW_SIZE,
                height: GLOW_SIZE,
                left: "50%",
                top: "50%",
                marginLeft: -GLOW_SIZE / 2,
                marginTop: -GLOW_SIZE / 2,
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: GLOW_ROTATE_S,
                ease: easings.linear,
                repeat: Infinity,
              }}
            >
              <span
                className="absolute rounded-full blur-md"
                style={{
                  width: GLOW_BLOB,
                  height: GLOW_BLOB,
                  top: 0,
                  left: "50%",
                  marginLeft: -GLOW_BLOB / 2,
                  background: GLOW_COLOR,
                }}
              />
            </motion.span>
          )}

          <motion.div
            className="relative inline-flex items-center justify-center"
            animate={
              motionSafe && ambientLevel >= 2
                ? { scale: [...PULSE_SCALE] }
                : { scale: 1 }
            }
            transition={
              motionSafe && ambientLevel >= 2
                ? {
                    duration: ambientLevel >= 3 ? PULSE_FAST_S : PULSE_SLOW_S,
                    times: [...PULSE_TIMES],
                    ease: easings.move,
                    repeat: Infinity,
                  }
                : { duration: 0 }
            }
          >
            <motion.span
              aria-hidden
              className={cn(
                "relative inline-flex items-baseline font-mono leading-none text-ink tabular-nums",
                sizeClassFor(level),
              )}
              style={{
                scale: numberScale,
                scaleX: flipScaleX,
                y: rollY,
                opacity: rollOpacity,
              }}
            >
              <span className="mr-0.5">×</span>
              {numeralLevel}
            </motion.span>
          </motion.div>

          {motionSafe && ringKey > 0 && (
            <motion.span
              key={ringKey}
              aria-hidden
              className="pointer-events-none absolute rounded-full border-2"
              style={{
                width: RING_SIZE,
                height: RING_SIZE,
                left: "50%",
                top: "50%",
                marginLeft: -RING_SIZE / 2,
                marginTop: -RING_SIZE / 2,
                borderColor: RING_COLOR,
              }}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}

          {motionSafe && sparkKey > 0 && (
            <span
              key={sparkKey}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2"
            >
              {sparks.map((spark, i) => (
                <motion.span
                  key={i}
                  className="absolute size-[3px] rounded-full"
                  style={{ background: SPARK_COLOR, left: 0, top: 0 }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: spark.dx, y: spark.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          <span className="sr-only">Multiplier times {level}</span>
        </div>

        <div className="mt-1 flex items-center justify-center gap-1.5">
          <Readout value={streak} size="sm" />
          <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
            streak
          </span>
        </div>

        <div
          aria-hidden
          className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="absolute inset-y-0 left-0 origin-left rounded-full bg-primary"
            style={{ scaleX: barValue }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
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

          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            streak {streak} · best {best}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            aria-label="Advance the streak"
            onClick={handleAdvance}
            className={cn(
              "flex-1 rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            {buttonLabelFor(level)}
          </button>

          <button
            type="button"
            aria-label="Break the streak"
            onClick={handleBreak}
            className={cn(
              "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
              "hover:text-ink",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            break
          </button>
        </div>

        <span aria-live="polite" className="sr-only">
          {announce}
        </span>
      </div>
    </div>
  );
}
