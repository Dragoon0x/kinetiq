"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Orb and window geometry, px. */
const ORB_SIZE = 152;
const WINDOW_SIZE = 72;
const WINDOW_BOTTOM = 14;
const TRIANGLE_W = 54;
const TRIANGLE_H = 46;

/** Sphere shading: sheen highlight + lower shadow over a deep ink-2 tint. */
const ORB_BACKGROUND = [
  "radial-gradient(circle at 30% 24%, oklch(1 0 0 / 0.3) 0%, transparent 42%)",
  "radial-gradient(circle at 74% 82%, oklch(0 0 0 / 0.32) 0%, transparent 58%)",
  "radial-gradient(120% 120% at 40% 30%, color-mix(in oklab, var(--ink-2) 42%, var(--card)) 0%, color-mix(in oklab, var(--ink-2) 90%, var(--ink)) 100%)",
].join(", ");

/** The fluid behind the glass — always present, churns harder mid-shake. */
const FLUID_BG = [
  "radial-gradient(120% 100% at 30% 18%, color-mix(in oklab, var(--ink-2) 40%, transparent) 0%, transparent 55%)",
  "radial-gradient(130% 110% at 74% 84%, color-mix(in oklab, var(--ink-3) 42%, transparent) 0%, transparent 62%)",
  "radial-gradient(140% 120% at 50% 40%, color-mix(in oklab, var(--ink) 55%, var(--card)) 0%, color-mix(in oklab, var(--ink) 90%, var(--card)) 100%)",
].join(", ");

/** A thin specular streak sold as glass, always on top. */
const WINDOW_SHEEN =
  "linear-gradient(155deg, oklch(1 0 0 / 0.18) 0%, transparent 40%)";

/** The die: a pale triangle badge floating in the fluid. */
const TRIANGLE_CLIP = "polygon(50% 4%, 96% 94%, 4% 94%)";
const TRIANGLE_BG = [
  "linear-gradient(160deg, oklch(1 0 0 / 0.14) 0%, transparent 45%, oklch(0 0 0 / 0.1) 100%)",
  "linear-gradient(0deg, var(--card), var(--card))",
].join(", ");

/** Shake: six keyframes, decaying amplitude, ~0.5s. First frame is null so
 *  a re-shake mid-swing starts from wherever the orb currently sits. */
const SHAKE_S = 0.5;
const SHAKE_TIMES = [0, 0.14, 0.32, 0.5, 0.72, 1] as const;
const SHAKE_X = [null, -10, 8, -6, 3, 0] as const;
const SHAKE_ROTATE = [null, -7, 6, -4, 2, 0] as const;

/** How long the window stays cloudy before the die surfaces. */
const DIE_DELAY_MS = 420;
/** Mist churn duration matches the cloudy window exactly. */
const MIST_S = DIE_DELAY_MS / 1000;
const MIST_TIMES = [0, 0.3, 0.7, 1] as const;

type MistBlob = {
  readonly w: number;
  readonly h: number;
  readonly left: number;
  readonly top: number;
  readonly gradient: string;
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly opacity: readonly number[];
};

/** Three drifting translucent blobs — layered gradients, never filter blur. */
const MIST_BLOBS: readonly MistBlob[] = [
  {
    w: 36,
    h: 26,
    left: 8,
    top: 10,
    gradient:
      "radial-gradient(circle, color-mix(in oklab, var(--ink-2) 60%, transparent) 0%, transparent 72%)",
    x: [0, 4, -3, 0],
    y: [0, -3, 2, 0],
    opacity: [0, 0.7, 0.65, 0],
  },
  {
    w: 30,
    h: 32,
    left: 24,
    top: 18,
    gradient:
      "radial-gradient(circle, color-mix(in oklab, var(--ink-3) 62%, transparent) 0%, transparent 70%)",
    x: [0, -5, 3, 0],
    y: [0, 3, -2, 0],
    opacity: [0, 0.65, 0.7, 0],
  },
  {
    w: 26,
    h: 22,
    left: 14,
    top: 30,
    gradient:
      "radial-gradient(circle, color-mix(in oklab, var(--ink) 42%, transparent) 0%, transparent 75%)",
    x: [0, 3, -4, 0],
    y: [0, -2, 3, 0],
    opacity: [0, 0.6, 0.6, 0],
  },
] as const;

/** Eight dry, useful-sounding answers, cycled in fixed order — never chance. */
const DEFAULT_ANSWERS: string[] = [
  "Ask again Monday",
  "The board says no",
  "Ship it",
  "Not before coffee",
  "Check the ledger",
  "Yes, with conditions",
  "Someone already did",
  "Not your call",
];

export type OracleOrbProps = {
  /** Answers to cycle through, in fixed order. @default the built-in eight */
  answers?: string[];
  /** Fires the moment an answer is decided, with its text. */
  onAnswer?: (answer: string) => void;
  className?: string;
};

/**
 * A magic-eight-ball you shake for an answer: a dark sphere, its deep tint
 * color-mixed toward `--ink-2`, with a small glass window low on its face
 * where misty fluid sits behind a triangular die. The orb is a real
 * button — click it (or activate it from the keyboard) and it SHAKES on a
 * decaying, six-keyframe x/rotate tween while the window goes cloudy: the
 * current answer fades and three translucent gradients churn behind the
 * glass on short tweens, no filter blur involved. As the shake settles the
 * die SURFACES — a triangle scales up from small on spring `glide` — and
 * the next line from a fixed, house-voiced eight-answer table (or the
 * `answers` prop) fades in on its face; re-shaking mid-answer just restarts
 * the whole sequence, the way a real toy would. Reduced motion: no shake
 * and no mist churn — a click swaps the window straight to the next answer
 * with the die already resting in place.
 */
export function OracleOrb({
  answers = DEFAULT_ANSWERS,
  onAnswer,
  className,
}: OracleOrbProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const shakeX = useMotionValue(0);
  const shakeRotate = useMotionValue(0);

  const [cloudy, setCloudy] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [answer, setAnswer] = React.useState("");
  const [cycle, setCycle] = React.useState(0);

  const answerIndex = React.useRef(0);
  const shakeAnims = React.useRef<Array<ReturnType<typeof animate>>>([]);
  const dieTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (dieTimer.current !== null) window.clearTimeout(dieTimer.current);
      const anims = shakeAnims.current;
      anims.forEach((controls) => controls.stop());
    };
  }, []);

  const stopShakeAnims = () => {
    shakeAnims.current.forEach((controls) => controls.stop());
  };

  const handleClick = () => {
    const source = answers.length > 0 ? answers : DEFAULT_ANSWERS;
    const picked =
      source[answerIndex.current % source.length] ?? DEFAULT_ANSWERS[0] ?? "";
    answerIndex.current += 1;
    onAnswer?.(picked);
    setCycle((c) => c + 1);

    if (dieTimer.current !== null) {
      window.clearTimeout(dieTimer.current);
      dieTimer.current = null;
    }
    stopShakeAnims();

    if (!motionSafe) {
      shakeX.jump(0);
      shakeRotate.jump(0);
      setCloudy(false);
      setAnswer(picked);
      setRevealed(true);
      return;
    }

    setCloudy(true);
    setRevealed(false);
    shakeAnims.current = [
      animate(shakeX, [...SHAKE_X], {
        duration: SHAKE_S,
        ease: easings.move,
        times: [...SHAKE_TIMES],
      }),
      animate(shakeRotate, [...SHAKE_ROTATE], {
        duration: SHAKE_S,
        ease: easings.move,
        times: [...SHAKE_TIMES],
      }),
    ];

    dieTimer.current = window.setTimeout(() => {
      setCloudy(false);
      setAnswer(picked);
      setRevealed(true);
    }, DIE_DELAY_MS);
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Shake the orb"
        onClick={handleClick}
        className={cn(
          "relative inline-flex rounded-full p-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        )}
      >
        <span
          aria-hidden
          className="relative block"
          style={{ width: ORB_SIZE, height: ORB_SIZE }}
        >
          <motion.span
            className="absolute inset-0 rounded-full border border-hairline-strong shadow-raised"
            style={{
              x: shakeX,
              rotate: shakeRotate,
              background: ORB_BACKGROUND,
              transformOrigin: "50% 50%",
            }}
          >
            {/* The window: misty fluid behind glass, low on the sphere. */}
            <span
              className="absolute overflow-hidden rounded-full border border-hairline-strong"
              style={{
                width: WINDOW_SIZE,
                height: WINDOW_SIZE,
                left: "50%",
                marginLeft: -(WINDOW_SIZE / 2),
                bottom: WINDOW_BOTTOM,
                background: FLUID_BG,
                boxShadow:
                  "inset 0 3px 6px oklch(0 0 0 / 0.4), inset 0 -1px 2px oklch(1 0 0 / 0.06)",
              }}
            >
              <AnimatePresence>
                {motionSafe &&
                  cloudy &&
                  MIST_BLOBS.map((blob, i) => (
                    <motion.span
                      key={`mist-${i}-${cycle}`}
                      className="absolute rounded-full"
                      style={{
                        width: blob.w,
                        height: blob.h,
                        left: blob.left,
                        top: blob.top,
                        background: blob.gradient,
                      }}
                      initial={{ opacity: 0, x: 0, y: 0 }}
                      animate={{
                        opacity: [...blob.opacity],
                        x: [...blob.x],
                        y: [...blob.y],
                      }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }}
                      transition={{
                        duration: MIST_S,
                        ease: easings.move,
                        times: [...MIST_TIMES],
                      }}
                    />
                  ))}
              </AnimatePresence>

              <AnimatePresence>
                {revealed && (
                  <motion.div
                    key="die"
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ transformOrigin: "50% 50%" }}
                    initial={motionSafe ? { opacity: 0, scale: 0.35 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      motionSafe
                        ? {
                            opacity: 0,
                            scale: 0.6,
                            transition: {
                              duration: durations.fast,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                    transition={
                      motionSafe
                        ? {
                            scale: springs.glide,
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }
                        : { duration: 0 }
                    }
                  >
                    <span
                      className="relative"
                      style={{ width: TRIANGLE_W, height: TRIANGLE_H }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          clipPath: TRIANGLE_CLIP,
                          background: TRIANGLE_BG,
                          boxShadow: "0 1px 2px oklch(0 0 0 / 0.25)",
                        }}
                      />
                      <motion.span
                        className="absolute inset-0 flex items-center justify-center px-1 pt-1 text-center font-mono text-[8px] leading-[1.25] font-medium tracking-[0.02em] text-ink"
                        initial={motionSafe ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={
                          motionSafe
                            ? {
                                duration: durations.fast,
                                ease: easings.enter,
                                delay: 0.18,
                              }
                            : { duration: 0 }
                        }
                      >
                        {answer}
                      </motion.span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: WINDOW_SHEEN }}
              />
            </span>
          </motion.span>
        </span>
      </button>

      <span aria-hidden className="text-label font-mono text-ink-3 normal-case">
        shake it
      </span>

      <span aria-live="polite" className="sr-only">
        {revealed ? `Answer: ${answer}` : ""}
      </span>
    </div>
  );
}
