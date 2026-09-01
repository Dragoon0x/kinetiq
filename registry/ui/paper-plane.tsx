"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px. */
const STAGE_W = 280;
const STAGE_H = 200;

/** The pad — bottom-left launch ledge, the plane's resting anchor point. */
const PAD_X = 42;
const PAD_Y = 160;

/** Plane glyph box, px. */
const PLANE_W = 28;
const PLANE_H = 14;
const PLANE_OUTLINE = "M26 7 L4 1.5 L11 7 L4 12.5 Z";
const PLANE_FOLD = "M26 7 L11 7";
const PLANE_FILL = "var(--color-surface-2)";
const PLANE_STROKE = "var(--color-hairline-strong)";

/** Idle anticipatory hover — a lazy ±2px y tween loop while parked. */
const HOVER_S = 1.8;
const HOVER_TIMES = [0, 0.5, 1] as const;
const HOVER_Y = [0, -2, 0] as const;

/** One flight, one clock. */
const FLIGHT_S = 3.2;
/** Caption / reduced-motion still hold. */
const BEAT_MS = 1400;

/**
 * Flight 1 (default): climb, a banked turn at top-right, a floaty dip across
 * the middle (the two slowest gaps in `times`), one small loop near the
 * left, then a glide home with a soft settle. Offsets are dx/dy from the pad;
 * rotate is degrees, 0 = nose east, so every value tracks the heading the
 * plane is actually carrying at that instant. The first x/y keyframe is
 * `null` so a mid-hover launch picks up wherever the bob left it; rotate
 * never moves during the hover, so a literal 0 there is always safe. The
 * flight lands exactly at 360 — visually identical to 0, so the idle loop
 * resumes with no pop.
 */
const FLIGHT_1_TIMES = [
  0, 0.09, 0.2, 0.3, 0.36, 0.44, 0.52, 0.64, 0.76, 0.83, 0.88, 0.92, 0.94,
  0.975, 1,
] as const;
const FLIGHT_1_X = [
  null,
  32,
  90,
  158,
  202,
  205,
  168,
  108,
  58,
  36,
  8,
  28,
  15,
  3,
  0,
] as const;
const FLIGHT_1_Y = [
  null,
  -42,
  -100,
  -134,
  -138,
  -90,
  -58,
  -74,
  -50,
  -80,
  -92,
  -52,
  -14,
  5,
  0,
] as const;
const FLIGHT_1_ROTATE = [
  0, -52, -38, -12, 40, 122, 150, 162, 172, 208, 275, 345, 385, 400, 360,
] as const;

/**
 * Flight 2 (`loops={2}`): the same climb, turn and dip, then a second loop
 * chained onto the first before the glide home — an alternate authored
 * table, not a derived one, so both stay hand-tuned. Ends at 720 (two full
 * turns), again congruent with the idle loop's rotate.
 */
const FLIGHT_2_TIMES = [
  0, 0.08, 0.18, 0.27, 0.32, 0.39, 0.46, 0.57, 0.67, 0.71, 0.75, 0.79, 0.83,
  0.87, 0.9, 0.95, 0.975, 1,
] as const;
const FLIGHT_2_X = [
  null,
  32,
  90,
  158,
  202,
  205,
  168,
  108,
  58,
  36,
  8,
  30,
  4,
  -12,
  22,
  15,
  3,
  0,
] as const;
const FLIGHT_2_Y = [
  null,
  -42,
  -100,
  -134,
  -138,
  -90,
  -58,
  -74,
  -50,
  -80,
  -92,
  -56,
  -88,
  -100,
  -60,
  -16,
  5,
  0,
] as const;
const FLIGHT_2_ROTATE = [
  0, -52, -38, -12, 40, 122, 150, 162, 172, 208, 275, 340, 405, 470, 540, 610,
  650, 720,
] as const;

/** Reduced motion: three stills — pad, apex (shared by both flight tables), pad. */
const REST_STILL = { x: 0, y: 0, rotate: 0 } as const;
const APEX_STILL = { x: 202, y: -138, rotate: 40 } as const;

/** Dashed trail, roughly matching each flight's curve — absolute stage px. */
const TRAIL_D_1 =
  "M42,160 L74,118 L132,60 L200,26 L244,22 L247,70 L210,102 L150,86 L100,110 L78,80 L50,68 L70,108 L57,146 L45,165 L42,160";
const TRAIL_D_2 =
  "M42,160 L74,118 L132,60 L200,26 L244,22 L247,70 L210,102 L150,86 L100,110 L78,80 L50,68 L72,104 L46,72 L30,60 L64,100 L57,144 L45,165 L42,160";

const CAPTIONS = {
  idle: "fold. aim. launch.",
  flying: "airborne",
  landed: "stuck the landing.",
} as const;

type Phase = keyof typeof CAPTIONS;

export type PaperPlaneProps = {
  /** A second mid-air loop on an alternate flight table. @default 1 */
  loops?: 1 | 2;
  /** Fires once per flight, the instant it touches back down. */
  onLand?: () => void;
  className?: string;
};

/**
 * A folded paper plane waiting on its launch ledge with a tiny anticipatory
 * hover, ready to go the moment you press. Launching sends it through one
 * authored flight — a climb, a banked turn at the top-right corner with the
 * nose tracking every heading change, a floaty dip across the middle, a
 * small loop near the left, and a soft-settling glide back to the pad —
 * while a dashed trail draws in behind it on the same clock and fades once
 * it is down. A caption walks "fold. aim. launch." to "airborne" to "stuck
 * the landing." and back, and a polite live region echoes the launch and
 * the touchdown; a second press mid-flight is ignored until this one lands.
 * Set `loops` to 2 for an extra loop on an alternate flight table.
 * Reduced motion: no hover, and a launch instead steps the plane through
 * three still frames — pad, apex with the trail shown at rest, pad — on
 * timed beats, with the caption and `onLand` still firing on schedule.
 */
export function PaperPlane({
  loops = 1,
  onLand,
  className,
}: PaperPlaneProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const [phase, setPhase] = React.useState<Phase>("idle");

  const landTimer = React.useRef<number | null>(null);
  const idleTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

  // Copied out of the frozen tables: motion's keyframe targets are mutable
  // arrays, and the authored tables stay `as const` so they cannot drift.
  const flightTimes = [...(loops === 2 ? FLIGHT_2_TIMES : FLIGHT_1_TIMES)];
  const flightX = [...(loops === 2 ? FLIGHT_2_X : FLIGHT_1_X)];
  const flightY = [...(loops === 2 ? FLIGHT_2_Y : FLIGHT_1_Y)];
  const flightRotate = [...(loops === 2 ? FLIGHT_2_ROTATE : FLIGHT_1_ROTATE)];
  const trailD = loops === 2 ? TRAIL_D_2 : TRAIL_D_1;

  const land = () => {
    setPhase("landed");
    onLand?.();
    idleTimer.current = window.setTimeout(() => {
      idleTimer.current = null;
      setPhase("idle");
    }, BEAT_MS);
  };

  const handleLaunch = () => {
    if (phase === "flying") return;
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    setPhase("flying");
    if (!motionSafe) {
      landTimer.current = window.setTimeout(() => {
        landTimer.current = null;
        land();
      }, BEAT_MS);
    }
    // Motion-safe landing is driven by the flight tween's own completion.
  };

  const handleFlightComplete = () => {
    if (!motionSafe || phase !== "flying") return;
    land();
  };

  const still = phase === "flying" ? APEX_STILL : REST_STILL;

  return (
    <button
      type="button"
      onClick={handleLaunch}
      aria-label="Launch the paper plane"
      className={cn(
        "relative block overflow-hidden rounded-4 border border-hairline bg-surface-1 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        !motionSafe && "active:brightness-95",
        className,
      )}
      style={{ width: STAGE_W, height: STAGE_H }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        className="pointer-events-none absolute inset-0 size-full"
      >
        {/* Launch ledge. */}
        <rect
          x={PAD_X - 17}
          y={PAD_Y + 5}
          width={38}
          height={5}
          rx={2}
          fill="var(--color-surface-2)"
          stroke="var(--color-hairline-strong)"
          strokeWidth={0.75}
        />

        {/* Dashed flight trail — draws in behind the plane, fades after landing. */}
        <motion.path
          d={trailD}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.25}
          strokeDasharray="4 4"
          strokeLinecap="round"
          initial={false}
          animate={
            motionSafe
              ? phase === "flying"
                ? { pathLength: 1, opacity: 0.85 }
                : phase === "landed"
                  ? { pathLength: 1, opacity: 0 }
                  : { pathLength: 0, opacity: 0 }
              : {
                  pathLength: phase === "flying" ? 1 : 0,
                  opacity: phase === "flying" ? 0.85 : 0,
                }
          }
          transition={
            motionSafe
              ? phase === "flying"
                ? {
                    pathLength: { duration: FLIGHT_S, ease: "linear" },
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.slow, ease: easings.exit }
              : { duration: 0 }
          }
        />
      </svg>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: PAD_X - PLANE_W / 2,
          top: PAD_Y - PLANE_H / 2,
          width: PLANE_W,
          height: PLANE_H,
        }}
        initial={false}
        animate={
          motionSafe
            ? phase === "flying"
              ? { x: flightX, y: flightY, rotate: flightRotate }
              : { x: 0, y: [...HOVER_Y] }
            : { x: still.x, y: still.y, rotate: still.rotate }
        }
        transition={
          motionSafe
            ? phase === "flying"
              ? { duration: FLIGHT_S, ease: "easeInOut", times: flightTimes }
              : {
                  duration: HOVER_S,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [...HOVER_TIMES],
                }
            : { duration: 0 }
        }
        onAnimationComplete={handleFlightComplete}
      >
        <svg
          viewBox={`0 0 ${PLANE_W} ${PLANE_H}`}
          width={PLANE_W}
          height={PLANE_H}
          className="block"
        >
          <path
            d={PLANE_OUTLINE}
            fill={PLANE_FILL}
            stroke={PLANE_STROKE}
            strokeWidth={0.9}
            strokeLinejoin="round"
          />
          <path
            d={PLANE_FOLD}
            fill="none"
            stroke={PLANE_STROKE}
            strokeWidth={0.7}
          />
        </svg>
      </motion.div>

      <motion.span
        key={phase}
        aria-hidden
        className="absolute inset-x-0 bottom-3 text-center text-label font-mono text-ink-3"
        initial={motionSafe ? { opacity: 0, y: 3 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { duration: durations.base, ease: easings.enter }
            : { duration: 0 }
        }
      >
        {CAPTIONS[phase]}
      </motion.span>

      <span aria-live="polite" className="sr-only">
        {phase === "flying" ? "Launched." : phase === "landed" ? "Landed." : ""}
      </span>
    </button>
  );
}
