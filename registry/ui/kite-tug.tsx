"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* Kite tints lean on the primary; edges and line mix from the ink ramp. */
const KITE_DEEP = "color-mix(in oklab, var(--primary) 82%, var(--card))";
const KITE_LIGHT = "color-mix(in oklab, var(--primary) 48%, var(--card))";
const EDGE = "color-mix(in oklab, var(--ink-3) 55%, transparent)";
const LINE = "color-mix(in oklab, var(--ink-3) 70%, transparent)";
const CLOUD = "color-mix(in oklab, var(--ink-3) 12%, transparent)";
const GROUND = "color-mix(in oklab, var(--ink-3) 22%, transparent)";

/** Stage geometry, px — reel bottom-left, kite home up in the sky. */
const STAGE_W = 260;
const STAGE_H = 220;
const REEL_X = 30;
const REEL_Y = 186;
const KITE_X = 182;
const KITE_Y = 78;

/** Line sag: how far the quadratic control point drops below the chord. */
const SAG_IDLE = 22;
const SAG_TAUT = 2.5;
/** The sag scales gently with the kite's y offset, so the bob breathes it. */
const BREATHE = 0.014;
const MIN_DROP = 0.6;

/** Idle bob — one lazy authored loop, offsets from home. */
const BOB_SECONDS = 7;
const BOB_TIMES = [0, 0.28, 0.55, 0.8, 1];
const BOB_X = [0, 9, 3, -7, 0];
const BOB_Y = [0, -7, 5, -3, 0];
const BOB_ROT = [0, 3, -2, 2, 0];

/**
 * The swoop — a dip toward the reel, then one loop-the-loop and a glide home.
 * The first keyframe is null so the dive starts from wherever the bob left
 * the kite; rotate traces the direction of travel on the same times and ends
 * at 360, which renders identically to the idle loop's opening 0.
 */
const SWOOP_SECONDS = 1.6;
const SWOOP_TIMES = [0, 0.16, 0.3, 0.45, 0.58, 0.7, 0.82, 1];
const SWOOP_X = [null, -58, -84, -52, -20, -52, -80, 0];
const SWOOP_Y = [null, 56, 0, -50, -26, -2, -30, 0];
const SWOOP_ROT = [null, -125, -20, 35, 135, 225, 315, 360];

/** Reduced motion holds this banked pose for a beat instead of swooping. */
const RM_SWOOP = { x: -30, y: -14, rotate: -26 } as const;
const RM_HOLD_MS = 700;

/** Three tail bows, hung along the tail with their own wag phases. */
const RIBBONS = [
  { x: 1, y: 36, tint: KITE_LIGHT, delay: 0, rest: -8, stream: 24 },
  { x: -1, y: 47, tint: KITE_DEEP, delay: 0.22, rest: 6, stream: 30 },
  { x: 1.5, y: 58, tint: KITE_LIGHT, delay: 0.44, rest: -4, stream: 36 },
] as const;

/** One bow: two triangles pinched at the tail. Bbox center is exactly 0,0. */
const BOW = "M0 0 L-6.5 -3.5 L-6.5 3.5 Z M0 0 L6.5 -3.5 L6.5 3.5 Z";

const fmt = (n: number): number => Math.round(n * 10) / 10;

export type KiteTugProps = {
  /** Fires the instant a tug takes and the swoop begins. */
  onSwoop?: () => void;
  className?: string;
};

/**
 * A diamond kite bobbing in an idle sky, held to a little reel by a quadratic
 * SVG line whose sag breathes with the bob — slack while the kite drifts,
 * near-straight the moment you pull. The stage is a real button: a tug snaps
 * the line taut, dips the kite toward the reel, and sends it around one
 * authored loop-the-loop with its rotation chasing the direction of travel
 * and the tail ribbons fluttering hard, then it settles back into the bob.
 * Tugs during a swoop are ignored, the caption cheers "wheee", and a polite
 * live region narrates the flight; every path is an authored constant on
 * fixed timings — nothing random, nothing simulated.
 * Reduced motion: no idle bob — the kite holds a gently sagged pose, and a
 * tug swaps instantly to a brief banked, line-taut pose before returning.
 */
export function KiteTug({
  onSwoop,
  className,
}: KiteTugProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const [swooping, setSwooping] = React.useState(false);

  // The kite's offsets from home and the line's slack. Passed into style, so
  // the declarative animate targets below write straight into them and the
  // line path can be derived without ever reading the DOM.
  const kx = useMotionValue(0);
  const ky = useMotionValue(0);
  const sag = useMotionValue(SAG_IDLE);

  const sagAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const holdTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      sagAnim.current?.stop();
    };
  }, []);

  // The line: reel → kite bridle, control point dropped by the current sag.
  // The drop rides the kite's y offset so the idle bob makes it breathe.
  const lineD = useTransform(
    [kx, ky, sag],
    ([x = 0, y = 0, s = 0]: number[]) => {
      const tipX = KITE_X + x;
      const tipY = KITE_Y + y;
      const drop = Math.max(MIN_DROP, s * (1 + y * BREATHE));
      const cx = (REEL_X + tipX) / 2;
      const cy = (REEL_Y + tipY) / 2 + drop;
      return `M ${REEL_X} ${REEL_Y} Q ${fmt(cx)} ${fmt(cy)} ${fmt(tipX)} ${fmt(tipY)}`;
    },
  );

  const instant = { duration: 0 };

  const handleTug = () => {
    if (swooping) return;
    setSwooping(true);
    onSwoop?.();
    sagAnim.current?.stop();
    if (motionSafe) {
      // The line snaps taut just ahead of the dive; the swoop keyframes on
      // the kite group take over from here and report back on complete.
      sagAnim.current = animate(sag, SAG_TAUT, {
        duration: durations.fast,
        ease: easings.enter,
      });
    } else {
      // Reduced motion: taut line and banked pose swap in for a beat.
      sag.set(SAG_TAUT);
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        sag.set(SAG_IDLE);
        setSwooping(false);
      }, RM_HOLD_MS);
    }
  };

  const handleSwoopComplete = () => {
    // The reduced-motion beat is owned by its timer; instant target swaps
    // also complete immediately, so both bail here.
    if (!swooping || holdTimer.current !== null) return;
    setSwooping(false);
    sagAnim.current?.stop();
    sagAnim.current = animate(sag, SAG_IDLE, {
      duration: durations.slow,
      ease: easings.move,
    });
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        aria-label="Tug the kite line"
        onClick={handleTug}
        className={cn(
          "relative block cursor-pointer overflow-hidden rounded-4 border border-hairline bg-surface-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
          !motionSafe && "active:brightness-95",
        )}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          width={STAGE_W}
          height={STAGE_H}
          className="block"
        >
          {/* Still sky furniture. */}
          <g fill={CLOUD}>
            <ellipse cx={64} cy={44} rx={16} ry={6.5} />
            <ellipse cx={77} cy={39} rx={10} ry={5} />
            <ellipse cx={220} cy={150} rx={13} ry={5.5} />
          </g>
          <ellipse cx={REEL_X} cy={208} rx={13} ry={3} fill={GROUND} />

          {/* The line, recomputed from the kite's live offsets and the sag. */}
          <motion.path
            d={lineD}
            fill="none"
            stroke={LINE}
            strokeWidth={1.1}
            strokeLinecap="round"
          />

          {/* The reel: post, spool with its wound line, axle, and crank. */}
          <path
            d="M30 193 L30 204"
            stroke={EDGE}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle
            cx={REEL_X}
            cy={REEL_Y}
            r={8}
            fill="var(--color-surface-2)"
            stroke={EDGE}
            strokeWidth={1}
          />
          <circle
            cx={REEL_X}
            cy={REEL_Y}
            r={4}
            fill="none"
            stroke={LINE}
            strokeWidth={2.4}
          />
          <circle cx={REEL_X} cy={REEL_Y} r={1.4} fill="var(--ink-3)" />
          <path
            d="M30 186 L36.5 180.5"
            stroke={EDGE}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle cx={37.5} cy={179.5} r={2} fill="var(--ink-3)" />

          {/* The kite, hung at home; offsets and spin play out around it. */}
          <g transform={`translate(${KITE_X} ${KITE_Y})`}>
            <motion.g
              style={{ x: kx, y: ky }}
              initial={false}
              animate={
                motionSafe
                  ? swooping
                    ? { x: SWOOP_X, y: SWOOP_Y }
                    : { x: BOB_X, y: BOB_Y }
                  : swooping
                    ? { x: RM_SWOOP.x, y: RM_SWOOP.y }
                    : { x: 0, y: 0 }
              }
              transition={
                !motionSafe
                  ? instant
                  : swooping
                    ? {
                        duration: SWOOP_SECONDS,
                        ease: "easeInOut",
                        times: SWOOP_TIMES,
                      }
                    : {
                        duration: BOB_SECONDS,
                        ease: "easeInOut",
                        times: BOB_TIMES,
                        repeat: Infinity,
                      }
              }
              onAnimationComplete={handleSwoopComplete}
            >
              <motion.g
                style={{ originX: "50%", originY: "50%" }}
                initial={false}
                animate={
                  motionSafe
                    ? swooping
                      ? { rotate: SWOOP_ROT }
                      : { rotate: BOB_ROT }
                    : { rotate: swooping ? RM_SWOOP.rotate : 2 }
                }
                transition={
                  !motionSafe
                    ? instant
                    : swooping
                      ? {
                          duration: SWOOP_SECONDS,
                          ease: "easeInOut",
                          times: SWOOP_TIMES,
                        }
                      : {
                          duration: BOB_SECONDS,
                          ease: "easeInOut",
                          times: BOB_TIMES,
                          repeat: Infinity,
                        }
                }
              >
                {/* Invisible spacer that mirrors the tail above the nose, so
                    the group's bbox centers on 0,0 — the bridle point — and
                    originX/originY 50% spins the kite exactly where the line
                    attaches. */}
                <rect x={-14} y={-66} width={28} height={132} fill="none" />

                {/* Tail and its three bows. */}
                <path
                  d="M0 26 Q5 36 0 45 Q-5 54 2 62"
                  fill="none"
                  stroke={LINE}
                  strokeWidth={1}
                />
                {RIBBONS.map((ribbon) => (
                  <g
                    key={ribbon.y}
                    transform={`translate(${ribbon.x} ${ribbon.y})`}
                  >
                    <motion.path
                      d={BOW}
                      fill={ribbon.tint}
                      style={{ originX: "50%", originY: "50%" }}
                      initial={false}
                      animate={
                        motionSafe
                          ? {
                              rotate: swooping
                                ? [ribbon.stream - 12, ribbon.stream + 12]
                                : [ribbon.rest - 9, ribbon.rest + 9],
                            }
                          : { rotate: swooping ? ribbon.stream : ribbon.rest }
                      }
                      transition={
                        !motionSafe
                          ? instant
                          : swooping
                            ? {
                                duration: 0.22,
                                repeat: Infinity,
                                repeatType: "mirror",
                                ease: "easeInOut",
                              }
                            : {
                                duration: 1.9,
                                repeat: Infinity,
                                repeatType: "mirror",
                                ease: "easeInOut",
                                delay: ribbon.delay,
                              }
                      }
                    />
                  </g>
                ))}

                {/* Diamond in two tints, sewn with a spine and cross spar. */}
                <path d="M0 -22 L-14 0 L0 26 Z" fill={KITE_LIGHT} />
                <path d="M0 -22 L14 0 L0 26 Z" fill={KITE_DEEP} />
                <path
                  d="M0 -22 L14 0 L0 26 L-14 0 Z"
                  fill="none"
                  stroke={EDGE}
                  strokeWidth={1}
                />
                <path
                  d="M0 -22 L0 26 M-14 0 L14 0"
                  fill="none"
                  stroke={EDGE}
                  strokeWidth={0.8}
                />
              </motion.g>
            </motion.g>
          </g>
        </svg>
      </button>

      <span aria-hidden className="flex h-4 items-center">
        <motion.span
          key={swooping ? "swoop" : "idle"}
          className="font-mono text-xs text-ink-3"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : instant
          }
        >
          {swooping ? "wheee" : "tug the line"}
        </motion.span>
      </span>

      <span aria-live="polite" className="sr-only">
        {swooping ? "The kite swoops a loop." : ""}
      </span>
    </div>
  );
}
