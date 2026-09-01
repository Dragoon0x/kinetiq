"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Ball count is clamped to this range regardless of what the prop asks for. */
const MIN_BALLS = 3;
const MAX_BALLS = 5;

/** Card geometry, in px. */
const CARD_W = 280;
const CARD_H = 208;

/** Catch points — where a ball's center rests the instant it is "in hand" —
 * and the apex height the arcs rise to. */
const HAND_L_X = 96;
const HAND_R_X = 184;
const HAND_Y = 156;
const APEX_Y = 40;
const THROW_DX = HAND_R_X - HAND_L_X;
const THROW_DY = APEX_Y - HAND_Y;

/** Ball glyph size, and its fixed anchor — every ball is authored to start
 * its cycle parked at the left hand; a per-index delay alone tells them
 * apart, which is what turns one repeating tween into a cascade. */
const BALL_D = 18;
const BALL_ANCHOR_LEFT = HAND_L_X - BALL_D / 2;
const BALL_ANCHOR_TOP = HAND_Y - BALL_D / 2;

/** Hand glyph size. */
const HAND_W = 34;
const HAND_H = 14;

/**
 * One authored cascade cycle: left hand, up into a parabola, across to the
 * right hand, back up into a second parabola, and home to the left hand —
 * two throws per loop, ending exactly where it started for a seamless
 * repeat. `easings.move` (symmetric ease-in-out) is applied to every segment,
 * which decelerates the ball into each apex and each landing alike.
 */
const JUGGLE_TIMES = [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1] as const;
const JUGGLE_X = [
  0,
  THROW_DX * 0.22,
  THROW_DX * 0.5,
  THROW_DX,
  THROW_DX * 0.5,
  THROW_DX * 0.22,
  0,
] as const;
const JUGGLE_Y = [
  0,
  THROW_DY * 0.68,
  THROW_DY,
  0,
  THROW_DY,
  THROW_DY * 0.68,
  0,
] as const;

/** Fixed period-by-count table, seconds — more balls in the air means a
 * slightly brisker toss so the pattern stays plausible. */
const periodFor = (count: number): number => {
  if (count >= 5) return 1.4;
  if (count === 4) return 1.6;
  return 1.8;
};

/** Hover slows the entire pattern — hands and balls alike — by this factor. */
const HOVER_SCALE = 2.2;

/** Reduced motion parks balls at these five fixed slots — hand, apex, hand,
 * plus two mid-rise spots for a 4th/5th ball — instead of animating them. */
const REST_SLOTS = [
  { x: HAND_L_X, y: HAND_Y },
  { x: (HAND_L_X + HAND_R_X) / 2, y: APEX_Y },
  { x: HAND_R_X, y: HAND_Y },
  { x: HAND_L_X + THROW_DX * 0.28, y: HAND_Y + THROW_DY * 0.55 },
  { x: HAND_L_X + THROW_DX * 0.72, y: HAND_Y + THROW_DY * 0.55 },
];

const restSlot = (index: number): { x: number; y: number } =>
  REST_SLOTS[index] ?? REST_SLOTS[1] ?? { x: HAND_L_X, y: APEX_Y };

/** Ball tints cycle through the calibrated four; color-mix keeps every one a
 * touch lighter than the raw token. */
const BALL_TINTS = [
  "color-mix(in oklab, var(--primary) 85%, white)",
  "color-mix(in oklab, var(--success, #047857) 85%, white)",
  "color-mix(in oklab, var(--warning, #b45309) 85%, white)",
  "color-mix(in oklab, var(--ink-2) 85%, white)",
] as const;

const tintFor = (index: number): string =>
  BALL_TINTS[index % BALL_TINTS.length] ?? "var(--ink-2)";

/** How long the "dropped them." beat holds before the fresh 3 start. */
const DROP_BEAT_MS = 650;

type Phase = "playing" | "dropping";

const clampBalls = (count: number): number =>
  Math.min(MAX_BALLS, Math.max(MIN_BALLS, Math.round(count)));

export type JuggleLoopProps = {
  /** Starting ball count, clamped to 3–5. @default 3 */
  balls?: number;
  /** Fires the instant a click at 5 balls resets the pattern back to 3. */
  onDrop?: () => void;
  className?: string;
};

/**
 * Three (or more) balls cascading between two simple hands, forever. Every
 * ball plays the identical authored arc — left hand, parabola, right hand,
 * parabola, home — as a repeating tween, offset only by a fixed per-index
 * delay, so the cascade reads correctly with zero hooks inside the ball
 * loop. Hovering slows the whole pattern to a lazy 2.2x; clicking the card
 * adds a ball up to 5 (the shared period ticks down a notch each time, from
 * a fixed table), and a click at 5 instead drops every ball off the bottom
 * on a quick tween while the mono caption reads "dropped them.", then a
 * fresh 3 pick back up. Reduced motion: no juggling at all — the balls sit
 * still in a fixed arrangement (one in each hand, one at the apex), the
 * hands do not dip, and clicking still walks the count and the caption
 * through the same states.
 */
export function JuggleLoop({
  balls = 3,
  onDrop,
  className,
}: JuggleLoopProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const [count, setCount] = React.useState(() => clampBalls(balls));
  const [phase, setPhase] = React.useState<Phase>("playing");
  const [hovering, setHovering] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);

  const dropTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    };
  }, []);

  const period = periodFor(count) * (hovering ? HOVER_SCALE : 1);
  const stagger = period / count;

  const handlePointerEnter = () => {
    if (motionSafe) setHovering(true);
  };
  const handlePointerLeave = () => {
    setHovering(false);
  };

  const handleClick = () => {
    if (phase === "dropping") return;

    if (count >= MAX_BALLS) {
      onDrop?.();
      setPhase("dropping");
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
      dropTimer.current = window.setTimeout(() => {
        dropTimer.current = null;
        setCount(MIN_BALLS);
        setEpoch((e) => e + 1);
        setPhase("playing");
      }, DROP_BEAT_MS);
      return;
    }

    setCount((c) => Math.min(MAX_BALLS, c + 1));
  };

  const caption = phase === "dropping" ? "dropped them." : `${count} balls`;
  const ballIndices = Array.from({ length: count }, (_, index) => index);

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Add a ball"
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "relative block cursor-pointer overflow-hidden rounded-4 border border-hairline bg-surface-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          !motionSafe && "active:brightness-95",
        )}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {/* Hands — rounded, phase-offset dip on the shared clock. No
            collision detection: the dip cadence just tracks how often
            *some* ball lands, not any particular one. */}
        <motion.div
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
          style={{
            left: HAND_L_X - HAND_W / 2,
            top: HAND_Y - 2,
            width: HAND_W,
            height: HAND_H,
          }}
          initial={false}
          animate={motionSafe ? { y: [0, distances.nudge, 0] } : { y: 0 }}
          transition={
            motionSafe
              ? {
                  duration: stagger,
                  times: [0, 0.3, 1],
                  ease: easings.move,
                  repeat: Infinity,
                }
              : { duration: 0 }
          }
        />
        <motion.div
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
          style={{
            left: HAND_R_X - HAND_W / 2,
            top: HAND_Y - 2,
            width: HAND_W,
            height: HAND_H,
          }}
          initial={false}
          animate={motionSafe ? { y: [0, distances.nudge, 0] } : { y: 0 }}
          transition={
            motionSafe
              ? {
                  duration: stagger,
                  delay: stagger / 2,
                  times: [0, 0.3, 1],
                  ease: easings.move,
                  repeat: Infinity,
                }
              : { duration: 0 }
          }
        />

        {/* Balls — a motion-safe cascade, or a still reduced-motion tableau. */}
        {motionSafe ? (
          <AnimatePresence>
            {phase === "playing" &&
              ballIndices.map((index) => (
                <motion.div
                  key={`${epoch}-${index}`}
                  aria-hidden
                  className="pointer-events-none absolute rounded-full shadow-raised"
                  style={{
                    left: BALL_ANCHOR_LEFT,
                    top: BALL_ANCHOR_TOP,
                    width: BALL_D,
                    height: BALL_D,
                    background: tintFor(index),
                  }}
                  initial={false}
                  animate={{ x: [...JUGGLE_X], y: [...JUGGLE_Y] }}
                  transition={{
                    duration: period,
                    delay: index * stagger,
                    times: [...JUGGLE_TIMES],
                    ease: easings.move,
                    repeat: Infinity,
                  }}
                  exit={{
                    y: CARD_H,
                    opacity: 0,
                    transition: {
                      duration: durations.base,
                      delay: index * cascade(count),
                      ease: easings.exit,
                    },
                  }}
                />
              ))}
          </AnimatePresence>
        ) : (
          phase === "playing" &&
          ballIndices.map((index) => {
            const slot = restSlot(index);
            return (
              <div
                key={index}
                aria-hidden
                className="pointer-events-none absolute rounded-full shadow-raised"
                style={{
                  left: slot.x - BALL_D / 2,
                  top: slot.y - BALL_D / 2,
                  width: BALL_D,
                  height: BALL_D,
                  background: tintFor(index),
                }}
              />
            );
          })
        )}
      </button>

      <motion.span
        key={caption}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3"
        initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        {caption}
      </motion.span>

      <span role="status" aria-live="polite" className="sr-only">
        {caption}
      </span>
    </div>
  );
}
