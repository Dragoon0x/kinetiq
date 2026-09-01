"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* Shell tones lean warm off the surface ramp; the chick mixes deeper. */
const SHELL =
  "color-mix(in oklab, var(--warning, #b45309) 12%, var(--color-surface-2))";
const SHELL_DEEP =
  "color-mix(in oklab, var(--warning, #b45309) 24%, var(--color-surface-2))";
const EDGE = "color-mix(in oklab, var(--ink-3) 55%, transparent)";
const INTERIOR =
  "color-mix(in oklab, var(--ink-3) 35%, var(--color-surface-0))";
const CHICK = "color-mix(in oklab, var(--warning, #b45309) 42%, var(--card))";
const BEAK = "var(--warning, #b45309)";
const GROUND = "color-mix(in oklab, var(--ink-3) 22%, transparent)";

/** The unbroken egg, and the two halves it becomes on hatch. */
const EGG =
  "M60 18 C79 18 93 46 93 82 C93 108 78.5 128 60 128 C41.5 128 27 108 27 82 C27 46 41 18 60 18 Z";
const LID =
  "M31 70 C31 44 43 18 60 18 C77 18 89 44 89 70 L82 65 L75 73 L68 65 L60 73 L52 65 L45 73 L38 65 Z";
const CUP =
  "M31 70 L38 65 L45 73 L52 65 L60 73 L68 65 L75 73 L82 65 L89 70 C91.5 74 93 78 93 82 C93 108 78.5 128 60 128 C41.5 128 27 108 27 82 C27 78 28.5 74 31 70 Z";
const CRACK_1 = "M73 33 L67 41 L72 48 L65 56";
const CRACK_2 = "M43 44 L49 52 L42 59 L50 66 L45 73";
const CHIP = "M45 66 L53 63 L50 72 Z";

/** Caption per stage — the egg keeps its own counsel until it does not. */
const CAPTIONS = ["…", "again?", "…", "oh. hello."] as const;

export type HatchlingProps = {
  /** Fires once, on the third tap, the moment the shell opens. */
  onHatch?: () => void;
  className?: string;
};

/**
 * An egg with three taps of patience. The first tap jolts it and draws a
 * hairline crack, the second jolts it harder, cracks it wider, and throws a
 * tiny chip of shell; the third pops the top clean off — a chick rises from
 * the lower half, looks left, looks right, winks, and settles into a content
 * bob. A small mono caption murmurs along and a fourth tap tucks everything
 * back in so the whole ritual can replay, on exactly the same fixed timings
 * every time. Reduced motion: taps swap instantly between four still states —
 * whole egg, cracked, more cracked, hatched with the chick visible — with no
 * sway, chip, bob, or wink.
 */
export function Hatchling({
  onHatch,
  className,
}: HatchlingProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const [stage, setStage] = React.useState<0 | 1 | 2 | 3>(0);
  const [closing, setClosing] = React.useState(false);

  // The jolt rides its own wrapper so it can stack on the idle sway.
  const joltRotate = useMotionValue(0);
  const joltAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const resetTimer = React.useRef<number | null>(null);

  const hatched = stage === 3;
  const open = hatched && !closing;
  // Keyframed choreography (look, wink, bob, blink) only runs while open.
  const alive = open && motionSafe;
  const instant = { duration: 0 };

  React.useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      joltAnim.current?.stop();
    };
  }, []);

  const handleTap = () => {
    if (closing) return;

    if (stage === 3) {
      if (!motionSafe) {
        setStage(0);
        return;
      }
      // Chick ducks, lid drops back, then the whole egg returns and the
      // cracks fade — the timer just waits out that exit choreography.
      setClosing(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setStage(0);
        setClosing(false);
      }, 560);
      return;
    }

    const next = (stage + 1) as 1 | 2 | 3;
    setStage(next);

    if (next === 3) {
      if (motionSafe) {
        joltAnim.current?.stop();
        joltAnim.current = animate(joltRotate, 0, springs.flick);
      }
      onHatch?.();
      return;
    }
    if (!motionSafe) return;
    // Jolt: flick to a small angle, then flick back — bigger on the second tap.
    joltAnim.current?.stop();
    joltAnim.current = animate(joltRotate, next === 1 ? -5 : -9, {
      ...springs.flick,
      onComplete: () => {
        joltAnim.current = animate(joltRotate, 0, springs.flick);
      },
    });
  };

  const crackTransition = (on: boolean) =>
    !motionSafe
      ? instant
      : on
        ? {
            pathLength: { duration: durations.slow, ease: easings.enter },
            opacity: { duration: durations.fast, ease: easings.enter },
          }
        : {
            opacity: { duration: durations.slow, ease: easings.exit },
            pathLength: { delay: durations.slow, duration: 0 },
          };

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        aria-label="Tap the egg"
        onClick={handleTap}
        className={cn(
          "relative rounded-4 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          !motionSafe && "active:brightness-95",
        )}
      >
        <motion.div style={{ rotate: joltRotate, transformOrigin: "50% 82%" }}>
          <motion.div
            style={{ transformOrigin: "50% 82%" }}
            initial={false}
            animate={
              motionSafe && !hatched
                ? { rotate: [0, -1.5, 0, 1.5, 0] }
                : { rotate: 0 }
            }
            transition={
              motionSafe && !hatched
                ? {
                    duration: 3.6,
                    ease: easings.move,
                    times: [0, 0.25, 0.5, 0.75, 1],
                    repeat: Infinity,
                  }
                : { duration: durations.fast }
            }
          >
            <svg
              viewBox="0 0 120 140"
              width={120}
              height={140}
              aria-hidden
              className="block overflow-visible"
            >
              <ellipse cx={60} cy={130.5} rx={27} ry={4} fill={GROUND} />

              {/* Whole egg with its cracks; hidden the instant the lid pops. */}
              <motion.g
                initial={false}
                animate={{ opacity: hatched ? 0 : 1 }}
                transition={instant}
              >
                <path d={EGG} fill={SHELL} stroke={EDGE} strokeWidth={1.25} />
                <motion.path
                  d={CRACK_1}
                  fill="none"
                  stroke={EDGE}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  initial={false}
                  animate={{
                    pathLength: stage >= 1 ? 1 : 0,
                    opacity: stage >= 1 ? 1 : 0,
                  }}
                  transition={crackTransition(stage >= 1)}
                />
                <motion.path
                  d={CRACK_2}
                  fill="none"
                  stroke={EDGE}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  initial={false}
                  animate={{
                    pathLength: stage >= 2 ? 1 : 0,
                    opacity: stage >= 2 ? 1 : 0,
                  }}
                  transition={crackTransition(stage >= 2)}
                />
                {motionSafe && stage === 2 && (
                  <motion.path
                    d={CHIP}
                    fill={SHELL_DEEP}
                    stroke={EDGE}
                    strokeWidth={0.75}
                    style={{ originX: "50%", originY: "50%" }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: -22, y: -18, rotate: -110, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                )}
              </motion.g>

              {/* Hatched scene: dark interior, chick, lower cup, flying lid. */}
              <motion.g
                initial={false}
                animate={{ opacity: hatched ? 1 : 0 }}
                transition={instant}
              >
                <ellipse cx={60} cy={69.5} rx={28} ry={5.5} fill={INTERIOR} />

                {/* Chick rises out of the cup, ducks back on reset. */}
                <motion.g
                  initial={false}
                  animate={{ y: open ? 0 : 40 }}
                  transition={
                    !motionSafe
                      ? instant
                      : open
                        ? { ...springs.glide, delay: 0.18 }
                        : { duration: durations.base, ease: easings.exit }
                  }
                >
                  {/* Content idle: a slow bob once the greeting is done. */}
                  <motion.g
                    initial={false}
                    animate={alive ? { y: [0, -2.5, 0] } : { y: 0 }}
                    transition={
                      alive
                        ? {
                            duration: 2.4,
                            ease: easings.move,
                            times: [0, 0.5, 1],
                            repeat: Infinity,
                            delay: 3.3,
                          }
                        : instant
                    }
                  >
                    <circle
                      cx={60}
                      cy={51}
                      r={17}
                      fill={CHICK}
                      stroke={EDGE}
                      strokeWidth={1}
                    />
                    <path
                      d="M55 36 Q57 30.5 59.5 34.5 Q62 29.5 64.5 35.5"
                      fill="none"
                      stroke={CHICK}
                      strokeWidth={2.25}
                      strokeLinecap="round"
                    />
                    {/* Face slides to look left, then right, then home. */}
                    <motion.g
                      initial={false}
                      animate={
                        alive ? { x: [0, -3.5, -3.5, 3.5, 3.5, 0] } : { x: 0 }
                      }
                      transition={
                        alive
                          ? {
                              duration: 1.5,
                              ease: easings.move,
                              times: [0, 0.18, 0.42, 0.58, 0.85, 1],
                              delay: 0.9,
                            }
                          : instant
                      }
                    >
                      {/* Both eyes share a lazy blink loop after settling. */}
                      <motion.g
                        initial={false}
                        style={{ originX: "50%", originY: "50%" }}
                        animate={
                          alive ? { scaleY: [1, 1, 0.15, 1] } : { scaleY: 1 }
                        }
                        transition={
                          alive
                            ? {
                                duration: 3.4,
                                ease: easings.move,
                                times: [0, 0.9, 0.95, 1],
                                repeat: Infinity,
                                delay: 3.6,
                              }
                            : instant
                        }
                      >
                        {/* The left eye also throws one wink after the look. */}
                        <motion.circle
                          cx={53}
                          cy={49}
                          r={2.8}
                          fill="var(--ink)"
                          style={{ originX: "50%", originY: "50%" }}
                          initial={false}
                          animate={
                            alive
                              ? { scaleY: [1, 0.12, 0.12, 1] }
                              : { scaleY: 1 }
                          }
                          transition={
                            alive
                              ? {
                                  duration: 0.55,
                                  ease: easings.move,
                                  times: [0, 0.3, 0.7, 1],
                                  delay: 2.6,
                                }
                              : instant
                          }
                        />
                        <circle cx={67} cy={49} r={2.8} fill="var(--ink)" />
                      </motion.g>
                      <path d="M56.5 55 L63.5 55 L60 60.5 Z" fill={BEAK} />
                    </motion.g>
                  </motion.g>
                </motion.g>

                <path d={CUP} fill={SHELL} stroke={EDGE} strokeWidth={1.25} />

                {/* Lid pops up and tips aside on recoil; drops back on reset. */}
                <motion.g
                  initial={false}
                  style={{ originX: "50%", originY: "50%" }}
                  animate={
                    open
                      ? { x: 24, y: -36, rotate: 26 }
                      : { x: 0, y: 0, rotate: 0 }
                  }
                  transition={
                    !motionSafe
                      ? instant
                      : open
                        ? {
                            x: springs.recoil,
                            y: springs.recoil,
                            rotate: springs.recoil,
                          }
                        : {
                            duration: durations.base,
                            ease: easings.exit,
                            delay: closing ? 0.1 : 0,
                          }
                  }
                >
                  <path d={LID} fill={SHELL} stroke={EDGE} strokeWidth={1.25} />
                </motion.g>
              </motion.g>
            </svg>
          </motion.div>
        </motion.div>
      </button>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={stage}
          className="text-label text-ink-3 normal-case"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : instant
          }
        >
          {CAPTIONS[stage]}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {stage === 3 ? "hatched" : stage > 0 ? "cracked" : ""}
      </span>
    </div>
  );
}
