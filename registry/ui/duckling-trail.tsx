"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — a small pond card. */
const STAGE_W = 300;
const STAGE_H = 200;
/** How close to the stage edge the mother may travel. */
const MARGIN_X = 32;
const MARGIN_Y = 24;
/** Bottom-center rest spot the family drifts to once the pointer leaves. */
const REST_X = STAGE_W / 2;
const REST_Y = STAGE_H - MARGIN_Y - 6;

/** Mother glyph footprint; ducklings render the same shape at half size. */
const MOTHER_W = 64;
const MOTHER_H = 44;
const DUCKLING_W = 32;
const DUCKLING_H = 22;

/** Horizontal travel below this (px) does not flip facing — kills jitter. */
const FACING_THRESHOLD = 1.5;
/** How long "come back" holds before the caption settles on the idle hint. */
const LEAVE_SETTLE_MS = 1100;

/** `springs.glide`, shaped as a bare `useSpring` smoothing config. */
const GLIDE_SPRING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};
/** `springs.drift`, laggier still — every duckling chases on this one. */
const DRIFT_SPRING = {
  stiffness: springs.drift.stiffness,
  damping: springs.drift.damping,
  mass: springs.drift.mass,
};

const BOB_AMPLITUDE = 3;
const BOB_DURATION = 2.4;
const BOB_PHASE_STEP = 0.35;

const RIPPLE_SIZE = 16;
const RIPPLE_DURATION = 2;
const RIPPLE_STEP = 0.22;

const POND_TINT =
  "color-mix(in oklab, var(--primary) 16%, var(--color-surface-2))";
const WAKE_TINT = "color-mix(in oklab, var(--primary) 55%, transparent)";
const MOTHER_TINT =
  "color-mix(in oklab, var(--warning, #b45309) 50%, var(--card))";
const DUCKLING_TINT =
  "color-mix(in oklab, var(--warning, #b45309) 34%, var(--card))";
const DUCK_BEAK = "var(--warning, #b45309)";
const DUCK_EYE = "var(--ink)";
const DUCK_EDGE = "color-mix(in oklab, var(--ink-3) 50%, transparent)";

type Point = { x: number; y: number };

/** A small fixed table of keyboard waypoints — corners, then center. */
const WAYPOINTS: Point[] = [
  { x: MARGIN_X, y: MARGIN_Y },
  { x: STAGE_W - MARGIN_X, y: MARGIN_Y },
  { x: STAGE_W - MARGIN_X, y: STAGE_H - MARGIN_Y },
  { x: MARGIN_X, y: STAGE_H - MARGIN_Y },
  { x: STAGE_W / 2, y: STAGE_H / 2 },
];
const DEFAULT_WAYPOINT: Point = { x: REST_X, y: REST_Y };

/** Fixed formation ducklings 1–5 snap to behind the mother under reduced motion. */
const REST_OFFSET_1: Point = { x: -14, y: 10 };
const REST_OFFSET_2: Point = { x: -24, y: 20 };
const REST_OFFSET_3: Point = { x: -32, y: 30 };
const REST_OFFSET_4: Point = { x: -38, y: 40 };
const REST_OFFSET_5: Point = { x: -42, y: 48 };

type DuckGlyphProps = {
  width: number;
  bodyTint: string;
};

/** Oval body, round head, a small beak, a dot eye — the shared duck shape. */
function DuckGlyph({ width, bodyTint }: DuckGlyphProps): React.JSX.Element {
  const height = Math.round((width * MOTHER_H) / MOTHER_W);
  return (
    <svg
      viewBox="0 0 64 44"
      width={width}
      height={height}
      aria-hidden
      className="block overflow-visible"
    >
      <ellipse
        cx={28}
        cy={30}
        rx={22}
        ry={12}
        fill={bodyTint}
        stroke={DUCK_EDGE}
        strokeWidth={1}
      />
      <circle
        cx={46}
        cy={15}
        r={11}
        fill={bodyTint}
        stroke={DUCK_EDGE}
        strokeWidth={1}
      />
      <path d="M56 13 L63 15.5 L56 18 Z" fill={DUCK_BEAK} />
      <circle cx={49} cy={12} r={1.8} fill={DUCK_EYE} />
    </svg>
  );
}

type DucklingMotionSet = {
  chainX: MotionValue<number>;
  chainY: MotionValue<number>;
  fallbackX: MotionValue<number>;
  fallbackY: MotionValue<number>;
};

type DucklingSpriteProps = DucklingMotionSet & {
  index: number;
  facing: MotionValue<number>;
  motionSafe: boolean;
};

/** One duckling: chain-follow (or fixed-offset) position, a phase-delayed bob, and its own wake. */
function DucklingSprite({
  index,
  chainX,
  chainY,
  fallbackX,
  fallbackY,
  facing,
  motionSafe,
}: DucklingSpriteProps): React.JSX.Element {
  const x = motionSafe ? chainX : fallbackX;
  const y = motionSafe ? chainY : fallbackY;

  return (
    <motion.div
      aria-hidden
      className="absolute top-0 left-0"
      style={{ x, y, marginLeft: -DUCKLING_W / 2, marginTop: -DUCKLING_H / 2 }}
    >
      <motion.div
        animate={motionSafe ? { y: [0, -BOB_AMPLITUDE, 0] } : { y: 0 }}
        transition={
          motionSafe
            ? {
                duration: BOB_DURATION,
                repeat: Infinity,
                ease: easings.move,
                times: [0, 0.5, 1],
                delay: index * BOB_PHASE_STEP,
              }
            : { duration: 0 }
        }
      >
        <motion.div style={{ scaleX: facing }}>
          <DuckGlyph width={DUCKLING_W} bodyTint={DUCKLING_TINT} />
        </motion.div>

        {motionSafe && (
          <div className="pointer-events-none absolute top-[70%] left-1/2 -translate-x-1/2">
            {[0, 1, 2].map((ripple) => (
              <motion.span
                key={ripple}
                className="absolute rounded-full border"
                style={{
                  borderColor: WAKE_TINT,
                  width: RIPPLE_SIZE,
                  height: RIPPLE_SIZE * 0.5,
                  marginLeft: -RIPPLE_SIZE / 2,
                }}
                animate={{ opacity: [0, 0.4, 0], scale: [0.6, 1.15, 0.6] }}
                transition={{
                  duration: RIPPLE_DURATION,
                  repeat: Infinity,
                  ease: easings.move,
                  times: [0, 0.5, 1],
                  delay: index * 0.12 + ripple * RIPPLE_STEP,
                }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export type DucklingTrailProps = {
  /** Number of ducklings in the chain, clamped to 1–5. @default 3 */
  ducklings?: number;
  className?: string;
};

/**
 * A pond card where a mother duck chases your pointer while her ducklings
 * chain in behind her, each spring a touch laggier than the last so the line
 * bows and catches up like a real conga of ducks rather than a physics loop.
 * She flips to face the way she is travelling, the ducklings wag a slow
 * phase-delayed bob, and three fixed ripple spans pulse under each one as a
 * cheap, deterministic wake — nothing is ever spawned. Leave the stage and
 * the family drifts to a bottom-center rest, bunching up while a caption
 * reads "come back" and then settles on "follow the pointer"; the stage is a
 * real button, so Enter, Space, and the arrow keys step the mother through a
 * fixed table of waypoints for pointer-free play.
 * Reduced motion: no springs, bob, or ripple pulse — the mother jumps
 * straight to the pointer or waypoint and the ducklings snap to a fixed
 * offset table behind her.
 */
export function DucklingTrail({
  ducklings = 3,
  className,
}: DucklingTrailProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const count = Math.min(5, Math.max(1, Math.round(ducklings)));

  const [phase, setPhase] = React.useState<"idle" | "active" | "leaving">(
    "idle",
  );
  const prevXRef = React.useRef(REST_X);
  const waypointIndexRef = React.useRef(0);
  const leaveTimerRef = React.useRef<number | null>(null);

  const pointerTargetX = useMotionValue(REST_X);
  const pointerTargetY = useMotionValue(REST_Y);
  const facing = useMotionValue(1);

  const motherX = useSpring(pointerTargetX, GLIDE_SPRING);
  const motherY = useSpring(pointerTargetY, GLIDE_SPRING);

  // The chain: each duckling springs off the one ahead of it, never off the
  // pointer directly — a natural conga line with no rAF loop of its own.
  const d1X = useSpring(motherX, DRIFT_SPRING);
  const d1Y = useSpring(motherY, DRIFT_SPRING);
  const d2X = useSpring(d1X, DRIFT_SPRING);
  const d2Y = useSpring(d1Y, DRIFT_SPRING);
  const d3X = useSpring(d2X, DRIFT_SPRING);
  const d3Y = useSpring(d2Y, DRIFT_SPRING);
  const d4X = useSpring(d3X, DRIFT_SPRING);
  const d4Y = useSpring(d3Y, DRIFT_SPRING);
  const d5X = useSpring(d4X, DRIFT_SPRING);
  const d5Y = useSpring(d4Y, DRIFT_SPRING);

  // Reduced-motion fallback: a fixed offset from the mother's raw (unsprung)
  // position, so the family snaps as one formation with no chain lag at all.
  const f1X = useTransform(pointerTargetX, (v) => v + REST_OFFSET_1.x);
  const f1Y = useTransform(pointerTargetY, (v) => v + REST_OFFSET_1.y);
  const f2X = useTransform(pointerTargetX, (v) => v + REST_OFFSET_2.x);
  const f2Y = useTransform(pointerTargetY, (v) => v + REST_OFFSET_2.y);
  const f3X = useTransform(pointerTargetX, (v) => v + REST_OFFSET_3.x);
  const f3Y = useTransform(pointerTargetY, (v) => v + REST_OFFSET_3.y);
  const f4X = useTransform(pointerTargetX, (v) => v + REST_OFFSET_4.x);
  const f4Y = useTransform(pointerTargetY, (v) => v + REST_OFFSET_4.y);
  const f5X = useTransform(pointerTargetX, (v) => v + REST_OFFSET_5.x);
  const f5Y = useTransform(pointerTargetY, (v) => v + REST_OFFSET_5.y);

  React.useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null)
        window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const updateFacing = (nextX: number) => {
    const dx = nextX - prevXRef.current;
    if (Math.abs(dx) > FACING_THRESHOLD) facing.set(dx > 0 ? 1 : -1);
    prevXRef.current = nextX;
  };

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const handlePointerEnter = () => {
    clearLeaveTimer();
    setPhase("active");
  };

  // High-frequency: writes motion values only, never React state.
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const clampedX = Math.min(STAGE_W - MARGIN_X, Math.max(MARGIN_X, rawX));
    const clampedY = Math.min(STAGE_H - MARGIN_Y, Math.max(MARGIN_Y, rawY));
    pointerTargetX.set(clampedX);
    pointerTargetY.set(clampedY);
    updateFacing(clampedX);
  };

  const handlePointerLeave = () => {
    // A tab-through that never engaged the toy should not flash "come back".
    if (phase === "idle") return;
    pointerTargetX.set(REST_X);
    pointerTargetY.set(REST_Y);
    updateFacing(REST_X);
    setPhase("leaving");
    clearLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setPhase("idle");
    }, LEAVE_SETTLE_MS);
  };

  const stepToWaypoint = () => {
    clearLeaveTimer();
    const next = (waypointIndexRef.current + 1) % WAYPOINTS.length;
    waypointIndexRef.current = next;
    const waypoint = WAYPOINTS[next] ?? DEFAULT_WAYPOINT;
    pointerTargetX.set(waypoint.x);
    pointerTargetY.set(waypoint.y);
    updateFacing(waypoint.x);
    setPhase("active");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    stepToWaypoint();
  };

  const ducklingMotion: DucklingMotionSet[] = [
    { chainX: d1X, chainY: d1Y, fallbackX: f1X, fallbackY: f1Y },
    { chainX: d2X, chainY: d2Y, fallbackX: f2X, fallbackY: f2Y },
    { chainX: d3X, chainY: d3Y, fallbackX: f3X, fallbackY: f3Y },
    { chainX: d4X, chainY: d4Y, fallbackX: f4X, fallbackY: f4Y },
    { chainX: d5X, chainY: d5Y, fallbackX: f5X, fallbackY: f5Y },
  ];
  const visibleDucklings = ducklingMotion.slice(0, count);

  const caption =
    phase === "leaving"
      ? "come back"
      : phase === "idle"
        ? "follow the pointer"
        : "";
  const statusText =
    phase === "leaving"
      ? "come back"
      : phase === "idle"
        ? "follow the pointer"
        : "leading the ducklings";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Lead the ducklings"
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={stepToWaypoint}
        onKeyDown={handleKeyDown}
        onBlur={handlePointerLeave}
        className={cn(
          "relative block overflow-hidden rounded-4 border border-hairline bg-surface-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* The pond: a cooler inner ellipse sunk into the surface. */}
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[999px]"
          style={{
            left: "9%",
            right: "9%",
            top: "16%",
            bottom: "12%",
            background: POND_TINT,
          }}
        />

        {visibleDucklings.map((duckling, index) => (
          <DucklingSprite
            key={index}
            index={index}
            chainX={duckling.chainX}
            chainY={duckling.chainY}
            fallbackX={duckling.fallbackX}
            fallbackY={duckling.fallbackY}
            facing={facing}
            motionSafe={motionSafe}
          />
        ))}

        <motion.div
          aria-hidden
          className="absolute top-0 left-0"
          style={{
            x: motionSafe ? motherX : pointerTargetX,
            y: motionSafe ? motherY : pointerTargetY,
            marginLeft: -MOTHER_W / 2,
            marginTop: -MOTHER_H / 2,
          }}
        >
          <motion.div style={{ scaleX: facing }}>
            <DuckGlyph width={MOTHER_W} bodyTint={MOTHER_TINT} />
          </motion.div>
        </motion.div>
      </button>

      <div aria-hidden className="flex h-4 items-center">
        {caption && (
          <motion.span
            key={caption}
            className="text-label text-ink-3 normal-case"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {caption}
          </motion.span>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}
