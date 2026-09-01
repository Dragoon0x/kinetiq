"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Coordinate box the flame lives in — everything else is measured from it. */
const BASE_W = 30;
const BASE_H = 48;

/** Outer body footprint, anchored to the base of the coordinate box. */
const BODY_W = 20;
const BODY_H = 34;
/** Inner core footprint, tucked a little above the body's own base. */
const CORE_W = 11;
const CORE_H = 19;
const CORE_BOTTOM = 4;

/** Stage box the flame sits in — a touch of breathing room beyond BASE. */
const STAGE_W = BASE_W + 10;
const STAGE_H = BASE_H + 4;

/** Embers spawn where the body's tip actually sits. */
const TIP_OFFSET_Y = BASE_H - BODY_H;
/** Flare ring + sparks fire from roughly the body's vertical middle. */
const FLARE_ANCHOR_Y = BASE_H - BODY_H / 2;

const RING_SIZE = 74;
const SMOKE_H = 26;

/** Teardrop recipe: a tall vertical radius up top tapers to a peak, a short
 * one at the bottom lets the shape bulge — the same asymmetric-radius trick
 * as an ear or a petal, no rotation required. */
const BODY_RADIUS = "55% 55% 42% 42% / 88% 88% 30% 30%";
const CORE_RADIUS = "50% 50% 46% 46% / 82% 82% 34% 34%";

const FLAME_BODY =
  "color-mix(in oklab, var(--warning, #b45309) 58%, var(--card))";
const FLAME_CORE =
  "color-mix(in oklab, var(--warning, #b45309) 88%, var(--primary-foreground))";
const EMBER_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 80%, var(--primary-foreground))";
const RING_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 62%, transparent)";
const SMOKE_COLOR = "color-mix(in oklab, var(--ink-2) 40%, transparent)";

/** The fixed size ladder: 1-2 small, 3-6 medium, 7-13 tall, 14-29 taller, 30+ largest. */
const BRACKET_SCALE = [0.62, 0.82, 1, 1.24, 1.5] as const;
const DEFAULT_BRACKET_SCALE = BRACKET_SCALE[2] ?? 1;
const scaleForBracket = (index: number): number =>
  BRACKET_SCALE[index] ?? DEFAULT_BRACKET_SCALE;

const bracketIndexFor = (streak: number): number => {
  if (streak <= 2) return 0;
  if (streak <= 6) return 1;
  if (streak <= 13) return 2;
  if (streak <= 29) return 3;
  return 4;
};

/** Smaller than the smallest bracket — a guttered wisp, not a size step. */
const WISP_SCALE = 0.3;
const GUTTER_OPACITY = 0.55;

const isMilestone = (streak: number): boolean =>
  streak === 7 || (streak >= 30 && streak % 30 === 0);

const captionFor = (streak: number): string => {
  if (streak === 7) return "a week.";
  if (streak === 30) return "a month.";
  return "still going.";
};

/** How far the surge overshoots on a press before recoil settles it. */
const SURGE_PEAK = 1.16;

/** Flicker loop period — long enough to read as breathing, not strobing. */
const FLICKER_S = 1.4;
/** Fixed offset that keeps the core's loop out of step with the body's,
 * forever — the same period, a permanent phase difference. */
const CORE_PHASE_DELAY_S = 0.22;

const BODY_TIMES = [0, 0.16, 0.34, 0.5, 0.66, 0.84, 1] as const;
const BODY_SCALE_Y = [1, 1.07, 0.95, 1.05, 0.97, 1.04, 1] as const;
const BODY_SCALE_X = [1, 0.95, 1.05, 0.96, 1.03, 0.97, 1] as const;
const BODY_X = [0, 1, -1, 0.5, -0.6, 0.3, 0] as const;

const CORE_TIMES = [0, 0.14, 0.3, 0.48, 0.64, 0.8, 1] as const;
const CORE_SCALE_Y = [1, 0.93, 1.08, 0.96, 1.06, 0.95, 1] as const;
const CORE_SCALE_X = [1, 1.06, 0.92, 1.05, 0.94, 1.05, 1] as const;
const CORE_X = [0, -0.8, 0.9, -0.5, 0.6, -0.4, 0] as const;

/** Three fixed ember vectors rising from the tip — never random. */
const EMBERS = [
  { dx: -7, dy: -30 },
  { dx: 2, dy: -38 },
  { dx: 8, dy: -26 },
] as const;
const EMBER_RISE_S = 0.65;

const TAU = Math.PI * 2;
const FLARE_SPARK_COUNT = 8;
const FLARE_SPARK_SPREAD = 28;

/** Eight fixed spark vectors, evenly spaced — precomputed so every flare is
 * identical and SSR-safe. No Math.random. */
const FLARE_SPARKS = Array.from({ length: FLARE_SPARK_COUNT }, (_, i) => {
  const angle = (i / FLARE_SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * FLARE_SPARK_SPREAD,
    dy: Math.sin(angle) * FLARE_SPARK_SPREAD,
  };
});

const FLARE_RING_S = 0.55;
const FLARE_CAPTION_MS = 1300;
/** Reduced motion has no fade to hide behind, so the ring holds this long. */
const RING_BEAT_MS = 550;

export type StreakFlameProps = {
  /** Starting streak count. @default 6 */
  streak?: number;
  /** Fires the moment a milestone flare starts (day 7, day 30, every 30 after). */
  onMilestone?: (streak: number) => void;
  className?: string;
};

/**
 * A streak counter whose flame keeps pace with the number. The flame is two
 * layered teardrops — a warm outer body and a hotter core — flickering on a
 * continuous ~1.4s tween loop, the core running a fixed beat out of phase
 * with the body so the two never quite sync. Its size climbs through five
 * fixed brackets as the streak grows, animated on `glide`; every press of
 * "Extend the streak" adds a quick `recoil` surge to the flame itself and
 * sends three fixed embers up from the tip while `Readout` rolls the new
 * count. Reaching day 7, day 30, and every 30 after fires a flare — an
 * expanding ring, eight fixed sparks, a mono caption ("a week.", "a month.",
 * "still going."), and the flame briefly overshoots into its next bracket
 * before settling back. "break the streak" guts the flame down to a wisp
 * with a fading smoke line and a "cold." caption; the next press relights it
 * with a `recoil` pop. Reduced motion: the flame holds a still shape at its
 * bracket size with no flicker, embers, or flare sparks — milestones swap
 * the ring on as a static beat instead — while `Readout` keeps its own
 * reduced-motion behavior.
 */
export function StreakFlame({
  streak: initialStreak = 6,
  onMilestone,
  className,
}: StreakFlameProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const startStreak = Math.max(0, Math.round(initialStreak));

  const [streak, setStreak] = React.useState(startStreak);
  const [flareCaption, setFlareCaption] = React.useState<string | null>(null);
  const [emberKey, setEmberKey] = React.useState(0);
  const [flareKey, setFlareKey] = React.useState(0);
  const [smokeKey, setSmokeKey] = React.useState(0);
  const [ringBeatVisible, setRingBeatVisible] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const guttered = streak === 0;

  // Refs are the source of truth for click handling — reading React state
  // inside a rapid double-click would race a stale closure.
  const streakRef = React.useRef(startStreak);
  const onMilestoneRef = React.useRef(onMilestone);
  React.useEffect(() => {
    onMilestoneRef.current = onMilestone;
  }, [onMilestone]);

  const initialScale =
    startStreak <= 0
      ? WISP_SCALE
      : scaleForBracket(bracketIndexFor(startStreak));
  const flameScale = useMotionValue(initialScale);
  const flameOpacity = useMotionValue(startStreak <= 0 ? GUTTER_OPACITY : 1);
  const surgeScale = useMotionValue(1);

  const flameScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const flameOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const surgeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const flareCaptionTimer = React.useRef<number | null>(null);
  const ringBeatTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (flareCaptionTimer.current !== null)
        window.clearTimeout(flareCaptionTimer.current);
      if (ringBeatTimer.current !== null)
        window.clearTimeout(ringBeatTimer.current);
      flameScaleAnim.current?.stop();
      flameOpacityAnim.current?.stop();
      surgeAnim.current?.stop();
    };
  }, []);

  const triggerFlare = (next: number, nextBracket: number) => {
    const bumpIndex = Math.min(BRACKET_SCALE.length - 1, nextBracket + 1);
    if (motionSafe) {
      flameScaleAnim.current?.stop();
      flameScale.set(scaleForBracket(bumpIndex));
      flameScaleAnim.current = animate(
        flameScale,
        scaleForBracket(nextBracket),
        springs.recoil,
      );
      setFlareKey((k) => k + 1);
    } else {
      flameScale.jump(scaleForBracket(nextBracket));
      setRingBeatVisible(true);
      if (ringBeatTimer.current !== null)
        window.clearTimeout(ringBeatTimer.current);
      ringBeatTimer.current = window.setTimeout(() => {
        ringBeatTimer.current = null;
        setRingBeatVisible(false);
      }, RING_BEAT_MS);
      setFlareKey((k) => k + 1);
    }

    setFlareCaption(captionFor(next));
    if (flareCaptionTimer.current !== null)
      window.clearTimeout(flareCaptionTimer.current);
    flareCaptionTimer.current = window.setTimeout(() => {
      flareCaptionTimer.current = null;
      setFlareCaption(null);
    }, FLARE_CAPTION_MS);

    onMilestoneRef.current?.(next);
    setAnnounce(`Milestone. ${next} day streak.`);
  };

  const handleExtend = () => {
    const current = streakRef.current;
    const next = current + 1;
    streakRef.current = next;

    if (current <= 0) {
      // Relight: the flame pops back from a wisp instead of surging.
      flameOpacityAnim.current?.stop();
      flameScaleAnim.current?.stop();
      if (motionSafe) {
        flameOpacityAnim.current = animate(flameOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        });
        flameScaleAnim.current = animate(
          flameScale,
          scaleForBracket(bracketIndexFor(next)),
          springs.recoil,
        );
      } else {
        flameOpacity.jump(1);
        flameScale.jump(scaleForBracket(bracketIndexFor(next)));
      }
      setAnnounce(`Streak relit. ${next} day streak.`);
      setStreak(next);
      return;
    }

    if (motionSafe) {
      surgeAnim.current?.stop();
      surgeScale.set(SURGE_PEAK);
      surgeAnim.current = animate(surgeScale, 1, springs.recoil);
      setEmberKey((k) => k + 1);
    }

    const prevBracket = bracketIndexFor(current);
    const nextBracket = bracketIndexFor(next);

    if (isMilestone(next)) {
      triggerFlare(next, nextBracket);
    } else {
      if (nextBracket !== prevBracket) {
        flameScaleAnim.current?.stop();
        if (motionSafe) {
          flameScaleAnim.current = animate(
            flameScale,
            scaleForBracket(nextBracket),
            springs.glide,
          );
        } else {
          flameScale.jump(scaleForBracket(nextBracket));
        }
      }
      setAnnounce(`Streak extended. ${next} day streak.`);
    }

    setStreak(next);
  };

  const handleReset = () => {
    if (streakRef.current === 0) return;
    streakRef.current = 0;

    if (flareCaptionTimer.current !== null)
      window.clearTimeout(flareCaptionTimer.current);
    flareCaptionTimer.current = null;
    setFlareCaption(null);

    flameScaleAnim.current?.stop();
    flameOpacityAnim.current?.stop();
    if (motionSafe) {
      flameScaleAnim.current = animate(flameScale, WISP_SCALE, {
        duration: durations.slow,
        ease: easings.exit,
      });
      flameOpacityAnim.current = animate(flameOpacity, GUTTER_OPACITY, {
        duration: durations.slow,
        ease: easings.exit,
      });
      setSmokeKey((k) => k + 1);
    } else {
      flameScale.jump(WISP_SCALE);
      flameOpacity.jump(GUTTER_OPACITY);
    }

    setAnnounce("Streak broken. Cold.");
    setStreak(0);
  };

  const captionText = guttered ? "cold." : (flareCaption ?? "");
  const captionKind = guttered ? "cold" : (flareCaption ?? "idle");

  return (
    <div
      className={cn(
        "w-64 rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className="relative shrink-0"
          style={{ width: STAGE_W, height: STAGE_H }}
        >
          <motion.div
            className="absolute bottom-0 left-1/2"
            style={{
              width: BASE_W,
              height: BASE_H,
              marginLeft: -BASE_W / 2,
              scale: flameScale,
              opacity: flameOpacity,
              transformOrigin: "50% 100%",
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ scale: surgeScale, transformOrigin: "50% 100%" }}
            >
              <motion.span
                className="absolute bottom-0 left-1/2"
                style={{
                  width: BODY_W,
                  height: BODY_H,
                  marginLeft: -BODY_W / 2,
                  background: FLAME_BODY,
                  borderRadius: BODY_RADIUS,
                }}
                animate={
                  motionSafe && !guttered
                    ? {
                        scaleY: [...BODY_SCALE_Y],
                        scaleX: [...BODY_SCALE_X],
                        x: [...BODY_X],
                      }
                    : { scaleY: 1, scaleX: 1, x: 0 }
                }
                transition={
                  motionSafe && !guttered
                    ? {
                        duration: FLICKER_S,
                        times: [...BODY_TIMES],
                        ease: easings.move,
                        repeat: Infinity,
                      }
                    : { duration: motionSafe ? durations.fast : 0 }
                }
              />
              <motion.span
                className="absolute left-1/2"
                style={{
                  bottom: CORE_BOTTOM,
                  width: CORE_W,
                  height: CORE_H,
                  marginLeft: -CORE_W / 2,
                  background: FLAME_CORE,
                  borderRadius: CORE_RADIUS,
                }}
                animate={
                  motionSafe && !guttered
                    ? {
                        scaleY: [...CORE_SCALE_Y],
                        scaleX: [...CORE_SCALE_X],
                        x: [...CORE_X],
                      }
                    : { scaleY: 1, scaleX: 1, x: 0 }
                }
                transition={
                  motionSafe && !guttered
                    ? {
                        duration: FLICKER_S,
                        times: [...CORE_TIMES],
                        ease: easings.move,
                        repeat: Infinity,
                        delay: CORE_PHASE_DELAY_S,
                      }
                    : { duration: motionSafe ? durations.fast : 0 }
                }
              />
            </motion.div>

            {motionSafe && emberKey > 0 && (
              <span
                key={emberKey}
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{ top: TIP_OFFSET_Y }}
              >
                {EMBERS.map((ember, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-[3px] rounded-full"
                    style={{ background: EMBER_COLOR }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: ember.dx,
                      y: ember.dy,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: EMBER_RISE_S, ease: easings.exit }}
                  />
                ))}
              </span>
            )}

            {flareKey > 0 &&
              (motionSafe ? (
                <span
                  key={flareKey}
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{ top: FLARE_ANCHOR_Y }}
                >
                  <motion.span
                    className="absolute rounded-full"
                    style={{
                      width: RING_SIZE,
                      height: RING_SIZE,
                      left: -RING_SIZE / 2,
                      top: -RING_SIZE / 2,
                      borderWidth: 2,
                      borderStyle: "solid",
                      borderColor: RING_COLOR,
                    }}
                    initial={{ scale: 0.5, opacity: 0.9 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: FLARE_RING_S, ease: easings.exit }}
                  />
                  {FLARE_SPARKS.map((spark, i) => (
                    <motion.span
                      key={i}
                      className="absolute size-[3px] rounded-full"
                      style={{ background: EMBER_COLOR }}
                      initial={{ x: 0, y: 0, opacity: 1 }}
                      animate={{ x: spark.dx, y: spark.dy, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ))}
                </span>
              ) : (
                ringBeatVisible && (
                  <span
                    key={flareKey}
                    className="pointer-events-none absolute left-1/2 rounded-full"
                    style={{
                      top: FLARE_ANCHOR_Y - RING_SIZE / 2,
                      width: RING_SIZE,
                      height: RING_SIZE,
                      marginLeft: -RING_SIZE / 2,
                      borderWidth: 2,
                      borderStyle: "solid",
                      borderColor: RING_COLOR,
                    }}
                  />
                )
              ))}

            {motionSafe && smokeKey > 0 && (
              <motion.span
                key={smokeKey}
                className="absolute bottom-0 left-1/2 rounded-full"
                style={{
                  width: 2,
                  height: SMOKE_H,
                  marginLeft: -1,
                  background: SMOKE_COLOR,
                }}
                initial={{ opacity: 0.85, scaleY: 1 }}
                animate={{ opacity: 0, scaleY: 0.3 }}
                transition={{
                  duration: durations.slow,
                  ease: easings.exit,
                  delay: 0.3,
                }}
              />
            )}
          </motion.div>
        </div>

        <div className="flex flex-col gap-0.5">
          <Readout value={streak} size="lg" />
          <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
            day streak
          </span>
        </div>
      </div>

      <span
        aria-hidden
        className="mt-3 flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKind}
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
            {captionText}
          </motion.span>
        </AnimatePresence>
      </span>

      <div className="mt-3 flex items-center gap-2">
        <motion.button
          type="button"
          aria-label="Extend the streak"
          onClick={handleExtend}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          +1
        </motion.button>

        <motion.button
          type="button"
          onClick={handleReset}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
            "hover:text-ink",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          break the streak
        </motion.button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
