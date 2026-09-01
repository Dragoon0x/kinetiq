"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage footprint — the whole rope + piñata + candy scatter lives here. */
const STAGE_W = 240;
const STAGE_H = 250;

/** Geometry, hand-set so the rope meets the head and the head meets the body. */
const ROPE_LEN = 30;
const HEAD_D = 36;
const HEAD_OVERLAP = 10;
const BODY_W = 80;
const BODY_H = 90;
const BODY_RADIUS = 24;
const LEG_W = 10;
const LEG_H = 18;

/** Anchor point for the independent candy layer, in stage coordinates. */
const BURST_ORIGIN_TOP = 100;

/** Beat between the burst settling and the candy fade cascade starting. */
const RESET_DELAY_MS = 2000;
/** How long the candy fade cascade takes to finish before the refill. */
const FADE_MS = 800;

/** Paper-mache tones mixed off the card surface, not painted flat on top. */
const BODY_FILL = "color-mix(in oklab, var(--ink-2) 16%, var(--card))";
const HEAD_FILL = "color-mix(in oklab, var(--ink-2) 24%, var(--card))";
const LEG_FILL = "color-mix(in oklab, var(--ink-2) 34%, var(--card))";
const EDGE = "color-mix(in oklab, var(--ink-3) 55%, transparent)";

/** Fixed alternating fringe / candy tint cycle — token tints only. */
const TINTS = [
  "color-mix(in oklab, var(--primary) 55%, var(--card))",
  "color-mix(in oklab, var(--warning, #b45309) 55%, var(--card))",
  "color-mix(in oklab, var(--success, #047857) 55%, var(--card))",
  "color-mix(in oklab, var(--ink-2) 45%, var(--card))",
] as const;

/** Caption ladder — the last entry repeats for any hit beyond it. */
const CAPTION_WORDS = ["swing", "again", "almost", "it is going"] as const;

/**
 * Fixed fringe rows, torn top-to-bottom-first: row 0 (nearest the legs)
 * tears on hit 1, row 3 (nearest the head) tears on hit 4.
 */
const FRINGE_ROWS = [
  { top: 60, width: 60, tint: 0 },
  { top: 42, width: 68, tint: 1 },
  { top: 24, width: 70, tint: 2 },
  { top: 6, width: 56, tint: 3 },
] as const;

/** One torn scrap per fringe row, thrown on a fixed vector. */
const SCRAP_VECTORS = [
  { dx: -26, fall: 46, rot: -130, duration: 0.5 },
  { dx: 22, fall: 52, rot: 110, duration: 0.55 },
  { dx: -18, fall: 58, rot: -100, duration: 0.6 },
  { dx: 16, fall: 64, rot: 95, duration: 0.62 },
] as const;

/** Authored swing amplitude per hit — the last entry repeats past hit 4. */
const SWING_TABLE = [
  { keys: [0, -14, 8, -4, 0], times: [0, 0.35, 0.6, 0.85, 1], duration: 0.5 },
  {
    keys: [0, -20, 12, -6, 2, 0],
    times: [0, 0.3, 0.55, 0.75, 0.9, 1],
    duration: 0.58,
  },
  {
    keys: [0, -27, 16, -8, 3, 0],
    times: [0, 0.28, 0.52, 0.72, 0.88, 1],
    duration: 0.64,
  },
  {
    keys: [0, -34, 20, -10, 4, 0],
    times: [0, 0.26, 0.5, 0.7, 0.86, 1],
    duration: 0.7,
  },
] as const;

/**
 * Fixed launch table for the twelve candies: horizontal spread, the peak of
 * the rise, where each one lands, its final spin, shape, and tint. No
 * randomness — the same burst throws the same candy every time.
 */
const LAUNCH_TABLE = [
  { dx: -92, peakY: -58, landY: 96, rot: -140, shape: "rect", tint: 0 },
  { dx: -68, peakY: -78, landY: 104, rot: 110, shape: "circle", tint: 1 },
  { dx: -46, peakY: -50, landY: 88, rot: -95, shape: "rect", tint: 2 },
  { dx: -24, peakY: -70, landY: 110, rot: 150, shape: "circle", tint: 3 },
  { dx: -8, peakY: -86, landY: 100, rot: -60, shape: "rect", tint: 0 },
  { dx: 10, peakY: -64, landY: 92, rot: 80, shape: "circle", tint: 1 },
  { dx: 28, peakY: -82, landY: 112, rot: -120, shape: "rect", tint: 2 },
  { dx: 46, peakY: -52, landY: 86, rot: 100, shape: "circle", tint: 3 },
  { dx: 66, peakY: -72, landY: 106, rot: -70, shape: "rect", tint: 0 },
  { dx: 88, peakY: -56, landY: 98, rot: 130, shape: "circle", tint: 1 },
  { dx: -36, peakY: -96, landY: 118, rot: -150, shape: "rect", tint: 2 },
  { dx: 38, peakY: -92, landY: 116, rot: 60, shape: "circle", tint: 3 },
] as const;

const instant = { duration: 0 };

export type PinataTapProps = {
  /** Hits to burst. Clamped to 3–7. @default 5 */
  hits?: number;
  /** Fires once, the instant the final hit lands and the body splits. */
  onBurst?: () => void;
  className?: string;
};

/**
 * A piñata on a rope that takes a fixed run of hits before it gives up its
 * candy. Each tap swings the body harder on an authored tween, tears one
 * paper-fringe strip loose with a scrap that flutters away on a fixed exit
 * vector, and by the fourth hit cracks the shell, while a mono caption climbs
 * from "swing" toward "it is going". The final hit splits the body in two,
 * throws twelve candies out on fixed launch vectors under an authored gravity
 * curve, and once they land and linger a fresh piñata glides back onto the
 * rope on a `glide` spring with one settling sway. A polite live region
 * reports the hit count and announces "candy" at the burst; taps are ignored
 * while the burst plays out. Reduced motion: no idle sway, swing, or arcs —
 * each tap swaps to the next damage state instantly, the burst shows the
 * halves already gone and the candies already scattered at their fixed
 * landing spots, and the reset swaps back the same way.
 */
export function PinataTap({
  hits = 5,
  onBurst,
  className,
}: PinataTapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const hitTarget = Math.min(7, Math.max(3, Math.round(hits)));

  const [hitCount, setHitCount] = React.useState(0);
  const [phase, setPhase] = React.useState<"hanging" | "burst">("hanging");
  const [resetting, setResetting] = React.useState(false);

  const hitRotate = useMotionValue(0);
  const hitAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const burstTimer = React.useRef<number | null>(null);
  const fadeTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      hitAnim.current?.stop();
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  const crackThreshold = Math.min(4, hitTarget - 1);
  const showCrack = phase === "hanging" && hitCount >= crackThreshold;
  const cascadeStep = cascade(LAUNCH_TABLE.length);

  const latestScrap =
    hitCount >= 1 && hitCount <= 4
      ? (SCRAP_VECTORS[hitCount - 1] ?? SCRAP_VECTORS[0])
      : null;
  const latestRow =
    hitCount >= 1 && hitCount <= 4
      ? (FRINGE_ROWS[hitCount - 1] ?? FRINGE_ROWS[0])
      : null;

  const captionWord =
    phase === "burst"
      ? "CANDY"
      : (CAPTION_WORDS[Math.min(hitCount, CAPTION_WORDS.length - 1)] ??
        CAPTION_WORDS[0]);

  const liveText =
    phase === "burst"
      ? "candy"
      : hitCount > 0
        ? `Hit ${hitCount} of ${hitTarget}`
        : "";

  const swingHit = (idx: number) => {
    if (!motionSafe) return;
    const entry =
      SWING_TABLE[Math.min(idx, SWING_TABLE.length - 1)] ?? SWING_TABLE[0];
    hitAnim.current?.stop();
    hitAnim.current = animate(hitRotate, [...entry.keys], {
      duration: entry.duration,
      ease: easings.move,
      times: [...entry.times],
    });
  };

  const handleTap = () => {
    if (phase === "burst") return;

    const next = hitCount + 1;
    setHitCount(next);
    swingHit(next - 1);

    if (next >= hitTarget) {
      setPhase("burst");
      onBurst?.();
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => {
        setResetting(true);
        if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
        fadeTimer.current = window.setTimeout(
          () => {
            setPhase("hanging");
            setResetting(false);
            setHitCount(0);
          },
          motionSafe ? FADE_MS : 0,
        );
      }, RESET_DELAY_MS);
    }
  };

  const settleOnRefill = () => {
    if (phase === "hanging" && hitCount === 0 && motionSafe) {
      hitAnim.current?.stop();
      hitAnim.current = animate(hitRotate, [0, -9, 5, -2, 0], {
        duration: 0.55,
        ease: easings.move,
        times: [0, 0.3, 0.6, 0.85, 1],
      });
    }
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <div
        className="relative flex flex-col items-center"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Ceiling hook — static attachment point. */}
        <span
          aria-hidden
          className="block rounded-full"
          style={{ width: 4, height: 4, background: "var(--ink-3)" }}
        />

        {/* Reaction swing rides on top of the continuous idle sway. */}
        <motion.div
          style={{ rotate: hitRotate, transformOrigin: "top center" }}
        >
          <motion.div
            className="flex flex-col items-center"
            style={{ transformOrigin: "top center" }}
            initial={false}
            animate={
              motionSafe && phase === "hanging"
                ? { rotate: [0, -4, 0, 4, 0] }
                : { rotate: 0 }
            }
            transition={
              motionSafe && phase === "hanging"
                ? {
                    duration: 3.4,
                    ease: easings.move,
                    times: [0, 0.25, 0.5, 0.75, 1],
                    repeat: Infinity,
                  }
                : instant
            }
          >
            <span
              aria-hidden
              className="block"
              style={{
                width: 1,
                height: ROPE_LEN,
                background: "var(--hairline-strong)",
              }}
            />

            <button
              type="button"
              aria-label="Swing at the piñata"
              onClick={handleTap}
              className={cn(
                "relative flex flex-col items-center rounded-2 p-1 outline-none select-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                !motionSafe && "active:brightness-95",
              )}
            >
              {/* Head — fades with the body when the burst lands, glides
                  back with the fresh piñata on refill. */}
              <motion.div
                aria-hidden
                className="relative"
                style={{
                  width: HEAD_D,
                  height: HEAD_D,
                  marginBottom: -HEAD_OVERLAP,
                  borderRadius: 9999,
                  background: HEAD_FILL,
                  border: `1px solid ${EDGE}`,
                }}
                initial={false}
                animate={{
                  opacity: phase === "burst" ? 0 : 1,
                  y: phase === "burst" ? -20 : 0,
                }}
                transition={
                  phase === "burst"
                    ? motionSafe
                      ? { duration: durations.fast, ease: easings.exit }
                      : instant
                    : motionSafe
                      ? {
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                          y: springs.glide,
                        }
                      : instant
                }
                onAnimationComplete={settleOnRefill}
              >
                <span
                  aria-hidden
                  className="absolute rounded-full"
                  style={{
                    width: 4,
                    height: 4,
                    left: HEAD_D / 2 - 8,
                    top: HEAD_D / 2 - 2,
                    background: "var(--ink)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute rounded-full"
                  style={{
                    width: 4,
                    height: 4,
                    left: HEAD_D / 2 + 4,
                    top: HEAD_D / 2 - 2,
                    background: "var(--ink)",
                  }}
                />
              </motion.div>

              {/* Body — intact fringe/crack, or the two halves once burst. */}
              <span
                aria-hidden
                className="relative block"
                style={{
                  width: BODY_W,
                  height: BODY_H,
                  borderRadius: BODY_RADIUS,
                  background: phase === "burst" ? "transparent" : BODY_FILL,
                  border: phase === "burst" ? undefined : `1px solid ${EDGE}`,
                }}
              >
                {phase !== "burst" ? (
                  <>
                    {FRINGE_ROWS.map((row, i) => {
                      if (hitCount > i) return null;
                      const tint = TINTS[row.tint] ?? TINTS[0];
                      return (
                        <div
                          key={i}
                          aria-hidden
                          className="absolute flex"
                          style={{
                            top: row.top,
                            left: (BODY_W - row.width) / 2,
                            width: row.width,
                            justifyContent: "space-between",
                          }}
                        >
                          {Array.from({ length: 5 }, (_, barIndex) => (
                            <span
                              key={barIndex}
                              className="block"
                              style={{
                                width: 8,
                                height: 11,
                                borderRadius: 4,
                                background: tint,
                              }}
                            />
                          ))}
                        </div>
                      );
                    })}

                    {showCrack && (
                      <svg
                        aria-hidden
                        viewBox={`0 0 ${BODY_W} ${BODY_H}`}
                        width={BODY_W}
                        height={BODY_H}
                        className="pointer-events-none absolute inset-0"
                      >
                        <motion.path
                          d="M46 8 L36 26 L44 40 L34 58 L40 74"
                          fill="none"
                          stroke={EDGE}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          initial={
                            motionSafe ? { pathLength: 0, opacity: 0 } : false
                          }
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  pathLength: {
                                    duration: durations.slow,
                                    ease: easings.enter,
                                  },
                                  opacity: { duration: durations.fast },
                                }
                              : instant
                          }
                        />
                      </svg>
                    )}

                    <AnimatePresence>
                      {motionSafe && latestScrap && latestRow && (
                        <motion.span
                          key={`scrap-${hitCount}`}
                          aria-hidden
                          className="absolute block"
                          style={{
                            top: latestRow.top,
                            left: BODY_W / 2 - 4,
                            width: 8,
                            height: 11,
                            borderRadius: 4,
                            background:
                              TINTS[(hitCount - 1) % TINTS.length] ?? TINTS[0],
                          }}
                          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                          animate={{
                            x: [0, latestScrap.dx * 0.6, latestScrap.dx],
                            y: [0, latestScrap.fall * 0.5, latestScrap.fall],
                            rotate: [0, latestScrap.rot * 0.6, latestScrap.rot],
                            opacity: [1, 1, 0],
                          }}
                          exit={{
                            opacity: 0,
                            transition: {
                              duration: durations.blink,
                              ease: easings.exit,
                            },
                          }}
                          transition={{
                            duration: latestScrap.duration,
                            ease: easings.exit,
                            times: [0, 0.4, 1],
                          }}
                        />
                      )}
                    </AnimatePresence>
                  </>
                ) : motionSafe ? (
                  <>
                    <motion.span
                      aria-hidden
                      className="absolute top-0 left-0 block"
                      style={{
                        width: BODY_W / 2,
                        height: BODY_H,
                        borderRadius: `${BODY_RADIUS}px 0 0 ${BODY_RADIUS}px`,
                        background: BODY_FILL,
                        border: `1px solid ${EDGE}`,
                      }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      animate={{
                        x: [0, -4, -42],
                        y: [0, 8, 64],
                        rotate: [0, -8, -46],
                        opacity: [1, 1, 0],
                      }}
                      transition={{
                        duration: 0.6,
                        ease: easings.exit,
                        times: [0, 0.35, 1],
                      }}
                    />
                    <motion.span
                      aria-hidden
                      className="absolute top-0 block"
                      style={{
                        left: BODY_W / 2,
                        width: BODY_W / 2,
                        height: BODY_H,
                        borderRadius: `0 ${BODY_RADIUS}px ${BODY_RADIUS}px 0`,
                        background: BODY_FILL,
                        border: `1px solid ${EDGE}`,
                      }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      animate={{
                        x: [0, 4, 42],
                        y: [0, 8, 64],
                        rotate: [0, 8, 46],
                        opacity: [1, 1, 0],
                      }}
                      transition={{
                        duration: 0.6,
                        ease: easings.exit,
                        times: [0, 0.35, 1],
                      }}
                    />
                  </>
                ) : null}
              </span>

              {/* Legs — fade and glide with the head. */}
              <motion.div
                aria-hidden
                className="flex justify-center"
                style={{ marginTop: -4, columnGap: 16 }}
                initial={false}
                animate={{
                  opacity: phase === "burst" ? 0 : 1,
                  y: phase === "burst" ? -20 : 0,
                }}
                transition={
                  phase === "burst"
                    ? motionSafe
                      ? { duration: durations.fast, ease: easings.exit }
                      : instant
                    : motionSafe
                      ? {
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                          y: springs.glide,
                        }
                      : instant
                }
              >
                <span
                  className="block"
                  style={{
                    width: LEG_W,
                    height: LEG_H,
                    borderRadius: 6,
                    background: LEG_FILL,
                  }}
                />
                <span
                  className="block"
                  style={{
                    width: LEG_W,
                    height: LEG_H,
                    borderRadius: 6,
                    background: LEG_FILL,
                  }}
                />
              </motion.div>
            </button>
          </motion.div>
        </motion.div>

        {/* Candy burst — independent of the swinging assembly. */}
        {phase === "burst" && (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: "50%", top: BURST_ORIGIN_TOP }}
          >
            {LAUNCH_TABLE.map((candy, i) => {
              const tint = TINTS[candy.tint] ?? TINTS[0];
              const shapeStyle =
                candy.shape === "circle"
                  ? {
                      width: 10,
                      height: 10,
                      marginLeft: -5,
                      marginTop: -5,
                      borderRadius: 9999,
                    }
                  : {
                      width: 12,
                      height: 8,
                      marginLeft: -6,
                      marginTop: -4,
                      borderRadius: 3,
                    };

              return (
                <motion.span
                  key={i}
                  className="absolute block"
                  style={{ ...shapeStyle, background: tint }}
                  initial={
                    motionSafe
                      ? { x: 0, y: 0, rotate: 0, opacity: 1 }
                      : {
                          x: candy.dx,
                          y: candy.landY,
                          rotate: candy.rot,
                          opacity: 1,
                        }
                  }
                  animate={
                    resetting
                      ? { opacity: 0 }
                      : {
                          x: motionSafe
                            ? [0, candy.dx * 0.7, candy.dx]
                            : candy.dx,
                          y: motionSafe
                            ? [0, candy.peakY, candy.landY]
                            : candy.landY,
                          rotate: candy.rot,
                          opacity: 1,
                        }
                  }
                  transition={
                    !motionSafe
                      ? instant
                      : resetting
                        ? {
                            opacity: {
                              duration: durations.base,
                              ease: easings.exit,
                              delay: i * cascadeStep,
                            },
                          }
                        : {
                            x: {
                              duration: 1.1,
                              ease: [easings.move, easings.exit],
                              times: [0, 0.4, 1],
                            },
                            y: {
                              duration: 1.1,
                              ease: [easings.move, easings.exit],
                              times: [0, 0.4, 1],
                            },
                            rotate: { duration: 1.1, ease: easings.move },
                            opacity: { duration: durations.fast },
                          }
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={captionWord}
          className="text-label font-mono text-ink-3 normal-case"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : instant
          }
        >
          {captionWord}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {liveText}
      </span>
    </div>
  );
}
