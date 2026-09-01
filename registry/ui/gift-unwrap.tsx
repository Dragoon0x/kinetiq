"use client";

import * as React from "react";

import { Heart, Rocket, Star } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* Paper leans on primary, ribbon and bow lean on success, the glow leans on
   warning, and every edge/interior tone leans on ink-2 — the whole scene
   reads from four tokens. */
const BOX_PAPER =
  "color-mix(in oklab, var(--primary) 14%, var(--color-surface-2))";
const BOX_PAPER_DEEP =
  "color-mix(in oklab, var(--primary) 28%, var(--color-surface-2))";
const RIBBON = "color-mix(in oklab, var(--success, #047857) 55%, var(--card))";
const BOW_FILL =
  "color-mix(in oklab, var(--success, #047857) 70%, var(--card))";
const EDGE = "color-mix(in oklab, var(--ink-2) 50%, transparent)";
const INTERIOR =
  "color-mix(in oklab, var(--ink-2) 32%, var(--color-surface-0))";
const GROUND = "color-mix(in oklab, var(--ink-2) 18%, transparent)";
const GLOW = "color-mix(in oklab, var(--warning, #b45309) 55%, transparent)";
const GIFT_PLATE = "color-mix(in oklab, var(--primary) 20%, var(--card))";
const ICON_COLOR = "var(--ink)";

/** Box geometry — hand-set so paper, ribbon, lid, and bow all line up. */
const BOX_X = 32;
const BOX_Y = 72;
const BOX_W = 76;
const BOX_H = 54;
const BOX_CENTER_X = BOX_X + BOX_W / 2;

const LID_X = 25;
const LID_Y = 56;
const LID_W = 90;
const LID_H = 22;

const RIBBON_V_X = BOX_CENTER_X - 7;
const RIBBON_V_W = 14;
const RIBBON_H_Y = BOX_Y + BOX_H / 2 - 7;
const RIBBON_H_H = 14;
/** How far a ribbon band travels off the box, in opposite directions. */
const RIBBON_OFF = 80;

const GIFT_PLATE_X = 48;
const GIFT_PLATE_Y = 44;
const GIFT_PLATE_SIZE = 44;
const GIFT_ICON_OFFSET = (GIFT_PLATE_SIZE - 24) / 2;
/** The gift starts this far below rest, sunk inside the box, before rising. */
const GIFT_SUNK_Y = 40;
const GLOW_R = 32;

/** The bow's own loops and tails carry a fixed tilt; only the group moves. */
const BOW_EXIT_X = 30;
const BOW_EXIT_Y = 34;
const BOW_EXIT_ROTATE = 14;
/** ~0.5s authored exit, per spec. */
const BOW_EXIT_S = 0.5;

/** The lid's momentary anticipatory hop, in px. */
const LID_HOP_PEAK = -6;
/** Where the lid starts when it drops back on after a reset. */
const LID_DROP_PEAK_Y = -46;
const LID_DROP_ROTATE = -14;
/** Multi-keyframe pop-away: lift, tumble, fall out of frame. ~0.7s. */
const LID_POP_X = [0, 10, 54] as const;
const LID_POP_Y = [0, -18, 90] as const;
const LID_POP_ROTATE = [0, -10, 38] as const;
const LID_POP_OPACITY = [1, 1, 0] as const;
const LID_POP_TIMES = [0, 0.32, 1] as const;
const LID_POP_S = 0.7;

/** Stagger and delay between the two ribbon bands and the reset choreography. */
const RIBBON_STAGGER_S = 0.08;
const BANDS_RESET_DELAY_S = 0.12;

/** Click-guard windows, tuned to outlast each transition's longest tween. */
const PULL_GUARD_MS = 560;
const POP_GUARD_MS = 720;
const RESET_GUARD_MS = 620;

/** Fixed gift cycle — star, heart, rocket, forever in that order. */
const GIFTS = [
  { icon: Star, label: "star", caption: "a star. of course." },
  { icon: Heart, label: "heart", caption: "a heart. obviously." },
  { icon: Rocket, label: "rocket", caption: "a rocket. naturally." },
] as const;

type GiftEntry = (typeof GIFTS)[number];

export type GiftUnwrapProps = {
  /** Fires the instant the lid pops, with the label of the gift revealed. */
  onOpen?: (gift: string) => void;
  className?: string;
};

/**
 * A wrapped present that takes three taps to give up its contents. The first
 * pulls the ribbon loose — the bow slackens off to one side, the crossed
 * bands slide away in opposite directions, and the lid gives an anticipatory
 * hop on `flick`. The second pops the lid clean off on a tumbling multi-beat
 * tween while a glyph rises out of the box on `recoil` behind an expanding
 * glow — a fixed cycle of a star, a heart, and a rocket, one per gift. The
 * third sinks the gift back down and reassembles the box: the lid drops on
 * `snap`, the bands slide back in, and the bow re-ties by scaling in on
 * `snap`, ready for the next gift in the cycle. Clicks are ignored while any
 * of these beats is still playing. Reduced motion: each tap swaps straight to
 * the next still frame — wrapped, unwrapped-with-lid, open-with-gift,
 * wrapped — with no motion, and the glow renders as a static ring on the
 * open still.
 */
export function GiftUnwrap({
  onOpen,
  className,
}: GiftUnwrapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [stage, setStage] = React.useState<0 | 1 | 2>(0);
  const [transitioning, setTransitioning] = React.useState(false);
  const [currentGift, setCurrentGift] = React.useState<GiftEntry | null>(null);

  const giftIndex = React.useRef(0);
  const lidHopY = useMotionValue(0);
  const lidHopAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const transitionTimer = React.useRef<number | null>(null);

  const clearTransitionTimer = () => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      clearTransitionTimer();
      lidHopAnim.current?.stop();
    };
  }, []);

  const armGuard = (ms: number) => {
    setTransitioning(true);
    clearTransitionTimer();
    transitionTimer.current = window.setTimeout(() => {
      setTransitioning(false);
    }, ms);
  };

  const handleClick = () => {
    if (transitioning) return;

    if (stage === 0) {
      setStage(1);
      if (motionSafe) {
        armGuard(PULL_GUARD_MS);
        lidHopAnim.current?.stop();
        lidHopY.set(LID_HOP_PEAK);
        lidHopAnim.current = animate(lidHopY, 0, springs.flick);
      }
      return;
    }

    if (stage === 1) {
      const gift = GIFTS[giftIndex.current] ?? GIFTS[0];
      giftIndex.current = (giftIndex.current + 1) % GIFTS.length;
      setCurrentGift(gift);
      setStage(2);
      onOpen?.(gift.label);
      if (motionSafe) armGuard(POP_GUARD_MS);
      return;
    }

    // stage === 2: sink the gift, reassemble the box, queue the next gift.
    setCurrentGift(null);
    setStage(0);
    if (motionSafe) armGuard(RESET_GUARD_MS);
  };

  const caption =
    stage === 0
      ? "open it"
      : stage === 1
        ? "keep going"
        : (currentGift ?? GIFTS[0]).caption;

  const liveMessage =
    stage === 2 && currentGift
      ? `Revealed a ${currentGift.label}`
      : stage === 1
        ? "Ribbon loose"
        : "";

  const Icon = currentGift?.icon;

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        aria-label="Open the gift"
        onClick={handleClick}
        className={cn(
          "relative rounded-4 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          !motionSafe && "active:brightness-95",
        )}
      >
        <svg
          viewBox="0 0 140 150"
          width={140}
          height={150}
          aria-hidden
          className="block overflow-visible"
        >
          <ellipse cx={70} cy={140} rx={44} ry={5} fill={GROUND} />

          <rect
            x={BOX_X}
            y={BOX_Y}
            width={BOX_W}
            height={BOX_H}
            rx={8}
            fill={BOX_PAPER}
            stroke={EDGE}
            strokeWidth={1.25}
          />
          <rect
            x={BOX_X + 6}
            y={BOX_Y + 2}
            width={BOX_W - 12}
            height={12}
            rx={4}
            fill={INTERIOR}
          />

          <AnimatePresence initial={false}>
            {stage === 0 && (
              <motion.rect
                key="ribbon-v"
                x={RIBBON_V_X}
                y={BOX_Y}
                width={RIBBON_V_W}
                height={BOX_H}
                fill={RIBBON}
                initial={motionSafe ? { y: -RIBBON_OFF, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: BANDS_RESET_DELAY_S,
                      }
                    : { duration: 0 }
                }
                exit={
                  motionSafe
                    ? {
                        y: -RIBBON_OFF,
                        opacity: 0,
                        transition: {
                          duration: durations.slow,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              />
            )}

            {stage === 0 && (
              <motion.rect
                key="ribbon-h"
                x={BOX_X}
                y={RIBBON_H_Y}
                width={BOX_W}
                height={RIBBON_H_H}
                fill={RIBBON}
                initial={motionSafe ? { y: RIBBON_OFF, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: BANDS_RESET_DELAY_S + RIBBON_STAGGER_S,
                      }
                    : { duration: 0 }
                }
                exit={
                  motionSafe
                    ? {
                        y: RIBBON_OFF,
                        opacity: 0,
                        transition: {
                          duration: durations.slow,
                          ease: easings.exit,
                          delay: RIBBON_STAGGER_S,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              />
            )}

            {stage === 2 && currentGift && (
              <motion.circle
                key="glow"
                cx={BOX_CENTER_X}
                cy={GIFT_PLATE_Y + GIFT_PLATE_SIZE / 2}
                r={GLOW_R}
                fill={GLOW}
                style={{ originX: "50%", originY: "50%" }}
                initial={motionSafe ? { scale: 0.5, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 0.32 }}
                transition={
                  motionSafe
                    ? { duration: 0.55, ease: easings.enter, delay: 0.05 }
                    : { duration: 0 }
                }
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
              />
            )}

            {stage === 2 && currentGift && Icon && (
              <motion.g
                key={`gift-${currentGift.label}`}
                initial={motionSafe ? { y: GIFT_SUNK_Y, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={motionSafe ? springs.recoil : { duration: 0 }}
                exit={
                  motionSafe
                    ? {
                        y: GIFT_SUNK_Y,
                        opacity: 0,
                        transition: {
                          duration: durations.base,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              >
                <rect
                  x={GIFT_PLATE_X}
                  y={GIFT_PLATE_Y}
                  width={GIFT_PLATE_SIZE}
                  height={GIFT_PLATE_SIZE}
                  rx={10}
                  fill={GIFT_PLATE}
                  stroke={EDGE}
                  strokeWidth={1.25}
                />
                <g
                  transform={`translate(${GIFT_PLATE_X + GIFT_ICON_OFFSET} ${GIFT_PLATE_Y + GIFT_ICON_OFFSET})`}
                >
                  <Icon
                    width={24}
                    height={24}
                    color={ICON_COLOR}
                    strokeWidth={2}
                  />
                </g>
              </motion.g>
            )}

            {stage < 2 && (
              <motion.g
                key="lid"
                style={{ originX: "50%", originY: "50%" }}
                initial={
                  motionSafe
                    ? {
                        x: 0,
                        y: LID_DROP_PEAK_Y,
                        rotate: LID_DROP_ROTATE,
                        opacity: 1,
                      }
                    : false
                }
                animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? { x: springs.snap, y: springs.snap, rotate: springs.snap }
                    : { duration: 0 }
                }
                exit={
                  motionSafe
                    ? {
                        x: [...LID_POP_X],
                        y: [...LID_POP_Y],
                        rotate: [...LID_POP_ROTATE],
                        opacity: [...LID_POP_OPACITY],
                        transition: {
                          duration: LID_POP_S,
                          times: [...LID_POP_TIMES],
                          ease: [easings.move, easings.exit],
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              >
                <motion.g style={{ y: lidHopY }}>
                  <rect
                    x={LID_X}
                    y={LID_Y}
                    width={LID_W}
                    height={LID_H}
                    rx={7}
                    fill={BOX_PAPER_DEEP}
                    stroke={EDGE}
                    strokeWidth={1.25}
                  />
                </motion.g>
              </motion.g>
            )}

            {stage === 0 && (
              <motion.g
                key="bow"
                style={{ originX: "50%", originY: "50%" }}
                initial={
                  motionSafe
                    ? { x: 0, y: 0, rotate: 0, scale: 0, opacity: 1 }
                    : false
                }
                animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                exit={
                  motionSafe
                    ? {
                        x: BOW_EXIT_X,
                        y: BOW_EXIT_Y,
                        rotate: BOW_EXIT_ROTATE,
                        opacity: 0,
                        transition: {
                          duration: BOW_EXIT_S,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              >
                <ellipse
                  cx={57}
                  cy={50}
                  rx={13}
                  ry={8}
                  fill={BOW_FILL}
                  stroke={EDGE}
                  strokeWidth={1}
                  transform="rotate(-28 57 50)"
                />
                <ellipse
                  cx={83}
                  cy={50}
                  rx={13}
                  ry={8}
                  fill={BOW_FILL}
                  stroke={EDGE}
                  strokeWidth={1}
                  transform="rotate(28 83 50)"
                />
                <rect
                  x={63}
                  y={50}
                  width={7}
                  height={20}
                  rx={3}
                  fill={BOW_FILL}
                  stroke={EDGE}
                  strokeWidth={1}
                  transform="rotate(-14 66.5 50)"
                />
                <rect
                  x={70}
                  y={50}
                  width={7}
                  height={20}
                  rx={3}
                  fill={BOW_FILL}
                  stroke={EDGE}
                  strokeWidth={1}
                  transform="rotate(14 73.5 50)"
                />
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </button>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={stage}
          className="text-label text-ink-3 normal-case"
          initial={motionSafe ? { opacity: 0, y: 3 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        >
          {caption}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
