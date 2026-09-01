"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Cookie geometry — the two lobes live in a 112×112 viewBox. */
const SIZE = 112;
const CENTER = 56;
const LOBE_W = 52;
const LOBE_H = 24;
const LOBE_RX = 12;
/** Each lobe's rest center sits this far out from the seam. */
const LOBE_OFFSET = 15;

/** Stage box: the cookie plus room below the seam for the slip to unfurl. */
const STAGE_W = 152;
const STAGE_H = 196;
const COOKIE_LEFT = (STAGE_W - SIZE) / 2;
const COOKIE_TOP = 10;

/** Slip geometry, anchored under the seam. */
const SLIP_W = 116;
const SLIP_LEFT = (STAGE_W - SLIP_W) / 2;
const SLIP_TOP = COOKIE_TOP + CENTER - 8;

/** Warm dough, mixed against the surface so it sits in either theme. */
const DOUGH = "color-mix(in oklab, var(--warning, #b45309) 45%, var(--card))";
const DOUGH_EDGE =
  "color-mix(in oklab, var(--warning, #b45309) 62%, var(--card))";
const DOUGH_LIGHT =
  "color-mix(in oklab, var(--warning, #b45309) 18%, transparent)";

/** Rest tilt of each lobe, degrees — mirrored across the seam. */
const REST_ROTATE = 13;

/** Pre-snap squeeze: a small pull toward the seam, spring `flick`. */
const SQUEEZE_LEFT = { x: 3, y: 1, rotate: -8 };
const SQUEEZE_RIGHT = { x: -3, y: 1, rotate: 8 };

/** Split keyframes — squeeze pose, arc peak, settled apart. ~0.5s tween. */
const SPLIT_TIMES = [0, 0.45, 1] as const;
const SPLIT_S = 0.5;
const SPLIT_LEFT_X = [SQUEEZE_LEFT.x, -24, -44] as const;
const SPLIT_LEFT_Y = [SQUEEZE_LEFT.y, -13, -5] as const;
const SPLIT_LEFT_ROTATE = [SQUEEZE_LEFT.rotate, -24, -32] as const;
const SPLIT_RIGHT_X = [SQUEEZE_RIGHT.x, 24, 44] as const;
const SPLIT_RIGHT_Y = [SQUEEZE_RIGHT.y, -13, -5] as const;
const SPLIT_RIGHT_ROTATE = [SQUEEZE_RIGHT.rotate, 24, 32] as const;

/** Reduced-motion still: halves land straight on the split end pose. */
const STILL_LEFT = { x: -44, y: -5, rotate: -32 };
const STILL_RIGHT = { x: 44, y: -5, rotate: 32 };

/** Choreography beats. */
const SQUEEZE_MS = 130;
const SPLIT_MS = 500;
const RESET_MS = 330;

/** Three crumbs thrown from the break on fixed vectors. */
const CRUMBS = [
  { dx: -13, fall: 20, r: 2.4, delay: 0 },
  { dx: 2, fall: 26, r: 2, delay: 0.05 },
  { dx: 15, fall: 18, r: 2.8, delay: 0.02 },
] as const;

/** Six dry one-liners, house voice, cycled in a fixed order — no mysticism. */
const DEFAULT_FORTUNES: string[] = [
  "The board will be wrong. Correct it once.",
  "Someone will ask for the price. Tell them.",
  "You will ship on a Tuesday.",
  "The demo will break. Not now. Later.",
  "Nobody reads the README. Write it anyway.",
  "The retro will surface it. Say it today.",
];

export type FortuneCrackProps = {
  /** Fortunes to cycle through, in fixed order. @default the built-in six */
  fortunes?: string[];
  /** Fires the instant a fortune is revealed, with its text. */
  onCrack?: (fortune: string) => void;
  className?: string;
};

/**
 * A fortune cookie that snaps in two the moment you press it. The first beat
 * is a quick anticipatory squeeze toward the seam on `flick`, then the two
 * lobes tear apart on a tilting, tumbling tween while three crumbs pop loose
 * at the break and fall away on their own exit tweens. A paper slip rises out
 * of the crack and unfurls on `glide`, carrying one fortune from a fixed
 * six-line cycle in small mono type. The next click sends it back: the slip
 * slides in and fades, the halves swing home and re-fuse on `snap`, and the
 * next fortune in the cycle is queued for the following crack. Clicks are
 * ignored while any beat is still playing. Reduced motion: a click swaps
 * straight to the cracked still — halves apart, slip out, fortune already
 * legible — with no squeeze, tumble, or crumbs, and the reset swaps directly
 * back.
 */
export function FortuneCrack({
  fortunes = DEFAULT_FORTUNES,
  onCrack,
  className,
}: FortuneCrackProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const leftX = useMotionValue(0);
  const leftY = useMotionValue(0);
  const leftRotate = useMotionValue(-REST_ROTATE);
  const rightX = useMotionValue(0);
  const rightY = useMotionValue(0);
  const rightRotate = useMotionValue(REST_ROTATE);

  const [cracked, setCracked] = React.useState(false);
  const [transitioning, setTransitioning] = React.useState(false);
  const [showCrumbs, setShowCrumbs] = React.useState(false);
  const [fortune, setFortune] = React.useState("");

  const fortuneIndex = React.useRef(0);
  const halfAnims = React.useRef<Array<ReturnType<typeof animate>>>([]);
  const squeezeTimer = React.useRef<number | null>(null);
  const splitTimer = React.useRef<number | null>(null);
  const resetTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (squeezeTimer.current !== null)
        window.clearTimeout(squeezeTimer.current);
      if (splitTimer.current !== null) window.clearTimeout(splitTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      halfAnims.current.forEach((controls) => controls.stop());
    };
  }, []);

  const stopHalfAnims = () => {
    halfAnims.current.forEach((controls) => controls.stop());
  };

  const handleClick = () => {
    if (transitioning) return;

    if (!cracked) {
      const source = fortunes.length > 0 ? fortunes : DEFAULT_FORTUNES;
      const picked =
        source[fortuneIndex.current % source.length] ??
        DEFAULT_FORTUNES[0] ??
        "";
      setFortune(picked);
      onCrack?.(picked);

      if (!motionSafe) {
        leftX.set(STILL_LEFT.x);
        leftY.set(STILL_LEFT.y);
        leftRotate.set(STILL_LEFT.rotate);
        rightX.set(STILL_RIGHT.x);
        rightY.set(STILL_RIGHT.y);
        rightRotate.set(STILL_RIGHT.rotate);
        setCracked(true);
        return;
      }

      setTransitioning(true);
      stopHalfAnims();
      halfAnims.current = [
        animate(leftX, SQUEEZE_LEFT.x, springs.flick),
        animate(leftY, SQUEEZE_LEFT.y, springs.flick),
        animate(leftRotate, SQUEEZE_LEFT.rotate, springs.flick),
        animate(rightX, SQUEEZE_RIGHT.x, springs.flick),
        animate(rightY, SQUEEZE_RIGHT.y, springs.flick),
        animate(rightRotate, SQUEEZE_RIGHT.rotate, springs.flick),
      ];

      squeezeTimer.current = window.setTimeout(() => {
        setShowCrumbs(true);
        stopHalfAnims();
        const splitTransition = {
          duration: SPLIT_S,
          ease: easings.move,
          times: [...SPLIT_TIMES],
        };
        halfAnims.current = [
          animate(leftX, [...SPLIT_LEFT_X], splitTransition),
          animate(leftY, [...SPLIT_LEFT_Y], splitTransition),
          animate(leftRotate, [...SPLIT_LEFT_ROTATE], splitTransition),
          animate(rightX, [...SPLIT_RIGHT_X], splitTransition),
          animate(rightY, [...SPLIT_RIGHT_Y], splitTransition),
          animate(rightRotate, [...SPLIT_RIGHT_ROTATE], splitTransition),
        ];

        splitTimer.current = window.setTimeout(() => {
          setShowCrumbs(false);
          setCracked(true);
          setTransitioning(false);
        }, SPLIT_MS);
      }, SQUEEZE_MS);

      return;
    }

    // Second click: reset and queue the next fortune in the cycle.
    const source = fortunes.length > 0 ? fortunes : DEFAULT_FORTUNES;
    fortuneIndex.current = (fortuneIndex.current + 1) % source.length;

    if (!motionSafe) {
      leftX.set(0);
      leftY.set(0);
      leftRotate.set(-REST_ROTATE);
      rightX.set(0);
      rightY.set(0);
      rightRotate.set(REST_ROTATE);
      setCracked(false);
      return;
    }

    setTransitioning(true);
    setCracked(false);
    stopHalfAnims();
    halfAnims.current = [
      animate(leftX, 0, springs.snap),
      animate(leftY, 0, springs.snap),
      animate(leftRotate, -REST_ROTATE, springs.snap),
      animate(rightX, 0, springs.snap),
      animate(rightY, 0, springs.snap),
      animate(rightRotate, REST_ROTATE, springs.snap),
    ];

    resetTimer.current = window.setTimeout(() => {
      setTransitioning(false);
    }, RESET_MS);
  };

  const caption = cracked ? "…" : "crack it";
  const liveMessage = cracked ? `Fortune: ${fortune}` : "";

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Crack the fortune cookie"
        aria-pressed={cracked}
        onClick={handleClick}
        className={cn(
          "relative inline-flex rounded-3 p-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          !motionSafe && "active:brightness-95",
        )}
      >
        <span
          aria-hidden
          className="relative block"
          style={{ width: STAGE_W, height: STAGE_H }}
        >
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute overflow-visible"
            style={{
              left: COOKIE_LEFT,
              top: COOKIE_TOP,
              width: SIZE,
              height: SIZE,
            }}
          >
            {/* Seam shadow — sits behind the lobes, exposed once they part. */}
            <rect
              x={CENTER - 3}
              y={CENTER - 10}
              width={6}
              height={20}
              rx={3}
              fill={DOUGH_EDGE}
            />

            <motion.g
              style={{
                x: leftX,
                y: leftY,
                rotate: leftRotate,
                originX: "50%",
                originY: "50%",
              }}
            >
              <rect
                x={CENTER - LOBE_OFFSET - LOBE_W / 2}
                y={CENTER - LOBE_H / 2}
                width={LOBE_W}
                height={LOBE_H}
                rx={LOBE_RX}
                fill={DOUGH}
                stroke={DOUGH_EDGE}
                strokeWidth={2}
              />
              <ellipse
                cx={CENTER - LOBE_OFFSET - 8}
                cy={CENTER - 4}
                rx={14}
                ry={6}
                fill={DOUGH_LIGHT}
              />
            </motion.g>

            <motion.g
              style={{
                x: rightX,
                y: rightY,
                rotate: rightRotate,
                originX: "50%",
                originY: "50%",
              }}
            >
              <rect
                x={CENTER + LOBE_OFFSET - LOBE_W / 2}
                y={CENTER - LOBE_H / 2}
                width={LOBE_W}
                height={LOBE_H}
                rx={LOBE_RX}
                fill={DOUGH}
                stroke={DOUGH_EDGE}
                strokeWidth={2}
              />
              <ellipse
                cx={CENTER + LOBE_OFFSET + 8}
                cy={CENTER - 4}
                rx={14}
                ry={6}
                fill={DOUGH_LIGHT}
              />
            </motion.g>

            <AnimatePresence>
              {showCrumbs &&
                CRUMBS.map((crumb, i) => (
                  <motion.circle
                    key={`crumb-${i}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={crumb.r}
                    fill={DOUGH_EDGE}
                    initial={{ opacity: 1, x: 0, y: 0 }}
                    exit={{
                      opacity: 0,
                      x: crumb.dx,
                      y: crumb.fall,
                      transition: {
                        duration: durations.slow,
                        ease: easings.exit,
                        delay: crumb.delay,
                      },
                    }}
                  />
                ))}
            </AnimatePresence>
          </svg>

          <AnimatePresence>
            {cracked && (
              <motion.div
                key="slip"
                className="absolute flex items-center justify-center rounded-1 border border-hairline-strong bg-card px-3 py-2 text-center"
                style={{
                  left: SLIP_LEFT,
                  top: SLIP_TOP,
                  width: SLIP_W,
                  originX: "50%",
                  originY: "0%",
                }}
                initial={motionSafe ? { scaleY: 0.2, opacity: 0 } : false}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        scaleY: 0.2,
                        opacity: 0,
                        transition: {
                          duration: durations.base,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? {
                        scaleY: springs.glide,
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }
                    : { duration: 0 }
                }
              >
                <span className="block font-mono text-xs leading-snug text-ink-2">
                  {fortune}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </span>
      </button>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={caption}
          className="text-label font-mono text-ink-3 normal-case"
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
