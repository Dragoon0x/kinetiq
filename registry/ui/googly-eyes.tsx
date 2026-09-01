"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Pupil diameter as a fraction of the socket diameter. */
const PUPIL_RATIO = 0.42;
/** Gap between the two sockets as a fraction of socket diameter. */
const GAP_RATIO = 0.32;
/** Crossed-pose pupil offset as a fraction of the socket's max travel. */
const CROSS_POSE_RATIO = 0.72;
/** Pointer proximity to the eyes' midpoint that triggers the cross-eyed pose, px. */
const CROSS_RADIUS = 24;

/** Fixed blink clock — deterministic, mount-driven. */
const BLINK_EVERY_MS = 4200;
const BLINK_MS = 120;
/** Gap from a tick to the second blink of a double-blink. */
const DOUBLE_BLINK_GAP_MS = 170;
const BLINK_KEYFRAMES = [0, 1, 0] as const;
const BLINK_TIMES = [0, 0.5, 1] as const;

/** Click squash peaks — spring `flick` carries the pair home. */
const SQUASH_PEAK_X = 1.1;
const SQUASH_PEAK_Y = 0.88;

/** Pupil jiggle table, fractions of socket size — fixed, never random. */
const JIGGLE_MS = 450;
const JIGGLE_X_UNITS = [0, -0.22, 0.24, -0.14, 0.08, 0] as const;
const JIGGLE_Y_UNITS = [0, 0.16, -0.18, 0.1, -0.05, 0] as const;
const JIGGLE_TIMES = [0, 0.16, 0.38, 0.6, 0.82, 1] as const;

/** How long a reduced-motion click holds the static crossed pose, ms. */
const REDUCED_BOOP_HOLD_MS = 380;

const SOCKET_SHADOW =
  "inset 0 2px 3px color-mix(in oklab, var(--ink) 22%, transparent), " +
  "inset 0 -3px 4px color-mix(in oklab, var(--card) 100%, transparent), " +
  "0 1px 2px color-mix(in oklab, var(--ink) 18%, transparent)";
const PUPIL_FILL = "color-mix(in oklab, var(--ink-2) 65%, var(--ink))";

type EyeCenter = { x: number; y: number };

/** Vector from `center` to the pointer, clamped to `maxOffset` in magnitude. */
function clampedOffset(
  pointerX: number,
  pointerY: number,
  center: EyeCenter,
  maxOffset: number,
): EyeCenter {
  const dx = pointerX - center.x;
  const dy = pointerY - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxOffset || dist === 0) return { x: dx, y: dy };
  const scale = maxOffset / dist;
  return { x: dx * scale, y: dy * scale };
}

type EyeSocketProps = {
  size: number;
  pupilSize: number;
  pupilX: MotionValue<number>;
  pupilY: MotionValue<number>;
  eyelidScale: MotionValue<number>;
  socketRef: (node: HTMLSpanElement | null) => void;
};

/** One socket: a white plastic dome holding a pupil and its blink eyelid. */
function EyeSocket({
  size,
  pupilSize,
  pupilX,
  pupilY,
  eyelidScale,
  socketRef,
}: EyeSocketProps): React.JSX.Element {
  return (
    <span
      ref={socketRef}
      className="relative block shrink-0 overflow-hidden rounded-full border border-hairline-strong"
      style={{
        width: size,
        height: size,
        background: "var(--card)",
        boxShadow: SOCKET_SHADOW,
      }}
    >
      <motion.span
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: pupilSize,
          height: pupilSize,
          marginLeft: -pupilSize / 2,
          marginTop: -pupilSize / 2,
          background: PUPIL_FILL,
          x: pupilX,
          y: pupilY,
        }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-surface-2"
        style={{ scaleY: eyelidScale, transformOrigin: "50% 0%" }}
      />
    </span>
  );
}

export type GooglyEyesProps = {
  /** Eye diameter, in px. @default 44 */
  size?: number;
  /** Fires on every boop (click, tap, or Enter/Space). */
  onBoop?: () => void;
  className?: string;
};

/**
 * A pair of stick-on googly eyes that watches the pointer. Two plastic domes
 * hold dark pupils on a `glide` spring, so they lag a beat behind the cursor
 * before settling — each pupil reach is clamped to its own socket, measured
 * fresh inside the pointermove handler rather than during render. Every few
 * seconds both eyelids blink shut and open on a quick tween, and every third
 * blink doubles up. Clicking the pair (it is a real button) rattles the
 * pupils loose on a multi-keyframe jiggle and gives the whole set a tiny
 * `flick` squash before tracking resumes; drifting the cursor very close to
 * the midpoint between the eyes crosses both pupils inward until it moves
 * away.
 * Reduced motion: pupils still track the pointer directly, with no spring
 * lag; blinking stops, and a click swaps to a held crossed pose instead of
 * jiggling.
 */
export function GooglyEyes({
  size = 44,
  onBoop,
  className,
}: GooglyEyesProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const pupilSize = Math.round(size * PUPIL_RATIO);
  const maxOffset = Math.max(0, size / 2 - pupilSize / 2);
  const crossOffset = maxOffset * CROSS_POSE_RATIO;
  const gap = Math.round(size * GAP_RATIO);

  const leftSocketRef = React.useRef<HTMLSpanElement | null>(null);
  const rightSocketRef = React.useRef<HTMLSpanElement | null>(null);
  const centersRef = React.useRef<{
    left: EyeCenter | null;
    right: EyeCenter | null;
  }>({ left: null, right: null });
  const boopHoldRef = React.useRef(false);
  const blinkCountRef = React.useRef(0);
  const doubleBlinkTimer = React.useRef<number | null>(null);
  const boopTimer = React.useRef<number | null>(null);

  const leftRawX = useMotionValue(0);
  const leftRawY = useMotionValue(0);
  const rightRawX = useMotionValue(0);
  const rightRawY = useMotionValue(0);
  const jiggleX = useMotionValue(0);
  const jiggleY = useMotionValue(0);
  const pairScaleX = useMotionValue(1);
  const pairScaleY = useMotionValue(1);
  const eyelidScale = useMotionValue(0);

  const leftSpringX = useSpring(leftRawX, springs.glide);
  const leftSpringY = useSpring(leftRawY, springs.glide);
  const rightSpringX = useSpring(rightRawX, springs.glide);
  const rightSpringY = useSpring(rightRawY, springs.glide);

  // The jiggle is an additive overlay on top of the tracking spring, so a
  // click never has to pause and resume tracking by hand — it just decays.
  const leftTrackedX = useTransform(
    [leftSpringX, jiggleX],
    ([s = 0, j = 0]: number[]) => s + j,
  );
  const leftTrackedY = useTransform(
    [leftSpringY, jiggleY],
    ([s = 0, j = 0]: number[]) => s + j,
  );
  const rightTrackedX = useTransform(
    [rightSpringX, jiggleX],
    ([s = 0, j = 0]: number[]) => s + j,
  );
  const rightTrackedY = useTransform(
    [rightSpringY, jiggleY],
    ([s = 0, j = 0]: number[]) => s + j,
  );

  const leftPupilX = motionSafe ? leftTrackedX : leftRawX;
  const leftPupilY = motionSafe ? leftTrackedY : leftRawY;
  const rightPupilX = motionSafe ? rightTrackedX : rightRawX;
  const rightPupilY = motionSafe ? rightTrackedY : rightRawY;

  // Blink clock: fixed cadence, every 3rd blink doubles up. Skipped entirely
  // under reduced motion — state only ever changes inside the callbacks.
  React.useEffect(() => {
    if (!motionSafe) return;
    const playBlink = () => {
      animate(eyelidScale, [...BLINK_KEYFRAMES], {
        duration: BLINK_MS / 1000,
        ease: easings.move,
        times: [...BLINK_TIMES],
      });
    };
    const interval = window.setInterval(() => {
      blinkCountRef.current += 1;
      playBlink();
      if (blinkCountRef.current % 3 === 0) {
        doubleBlinkTimer.current = window.setTimeout(
          playBlink,
          DOUBLE_BLINK_GAP_MS,
        );
      }
    }, BLINK_EVERY_MS);
    return () => {
      window.clearInterval(interval);
      if (doubleBlinkTimer.current !== null) {
        window.clearTimeout(doubleBlinkTimer.current);
        doubleBlinkTimer.current = null;
      }
    };
  }, [motionSafe, eyelidScale]);

  // Pointer tracking: centers are measured here and in the handler, never
  // during render. Runs regardless of reduced motion — direct manipulation
  // stays on; only the spring lag and the click/blink flourishes are gated.
  React.useEffect(() => {
    const measure = () => {
      const left = leftSocketRef.current?.getBoundingClientRect();
      const right = rightSocketRef.current?.getBoundingClientRect();
      centersRef.current = {
        left: left
          ? { x: left.left + left.width / 2, y: left.top + left.height / 2 }
          : null,
        right: right
          ? { x: right.left + right.width / 2, y: right.top + right.height / 2 }
          : null,
      };
    };
    measure();

    const handleMove = (event: PointerEvent) => {
      if (boopHoldRef.current) return;
      const centers = centersRef.current;
      if (!centers.left || !centers.right) return;

      const noseX = (centers.left.x + centers.right.x) / 2;
      const noseY = (centers.left.y + centers.right.y) / 2;
      const noseDist = Math.hypot(event.clientX - noseX, event.clientY - noseY);

      if (noseDist <= CROSS_RADIUS) {
        leftRawX.set(crossOffset);
        leftRawY.set(0);
        rightRawX.set(-crossOffset);
        rightRawY.set(0);
        return;
      }

      const left = clampedOffset(
        event.clientX,
        event.clientY,
        centers.left,
        maxOffset,
      );
      leftRawX.set(left.x);
      leftRawY.set(left.y);

      const right = clampedOffset(
        event.clientX,
        event.clientY,
        centers.right,
        maxOffset,
      );
      rightRawX.set(right.x);
      rightRawY.set(right.y);
    };

    document.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("scroll", measure, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (leftSocketRef.current) observer?.observe(leftSocketRef.current);
    if (rightSocketRef.current) observer?.observe(rightSocketRef.current);

    return () => {
      document.removeEventListener("pointermove", handleMove);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [leftRawX, leftRawY, rightRawX, rightRawY, maxOffset, crossOffset]);

  // A timer started outside an effect (the reduced-motion boop hold) still
  // needs its own unmount sweep.
  React.useEffect(() => {
    return () => {
      if (boopTimer.current !== null) window.clearTimeout(boopTimer.current);
    };
  }, []);

  const setLeftSocket = (node: HTMLSpanElement | null) => {
    leftSocketRef.current = node;
  };
  const setRightSocket = (node: HTMLSpanElement | null) => {
    rightSocketRef.current = node;
  };

  const handleClick = () => {
    onBoop?.();

    if (!motionSafe) {
      boopHoldRef.current = true;
      leftRawX.set(crossOffset);
      leftRawY.set(0);
      rightRawX.set(-crossOffset);
      rightRawY.set(0);
      if (boopTimer.current !== null) window.clearTimeout(boopTimer.current);
      boopTimer.current = window.setTimeout(() => {
        boopHoldRef.current = false;
      }, REDUCED_BOOP_HOLD_MS);
      return;
    }

    // Squash: set-then-animate, two keyframes total, spring `flick`.
    pairScaleX.set(SQUASH_PEAK_X);
    animate(pairScaleX, 1, springs.flick);
    pairScaleY.set(SQUASH_PEAK_Y);
    animate(pairScaleY, 1, springs.flick);

    // Jiggle: fixed multi-keyframe tween, never a spring, never random.
    animate(
      jiggleX,
      JIGGLE_X_UNITS.map((unit) => unit * size),
      {
        duration: JIGGLE_MS / 1000,
        ease: easings.move,
        times: [...JIGGLE_TIMES],
      },
    );
    animate(
      jiggleY,
      JIGGLE_Y_UNITS.map((unit) => unit * size),
      {
        duration: JIGGLE_MS / 1000,
        ease: easings.move,
        times: [...JIGGLE_TIMES],
      },
    );
  };

  return (
    <button
      type="button"
      aria-label="Boop the googly eyes"
      onClick={handleClick}
      className={cn(
        "relative inline-flex items-center justify-center rounded-4 p-2 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        className,
      )}
    >
      <motion.span
        aria-hidden
        className="inline-flex items-center"
        style={{ gap, scaleX: pairScaleX, scaleY: pairScaleY }}
      >
        <EyeSocket
          size={size}
          pupilSize={pupilSize}
          pupilX={leftPupilX}
          pupilY={leftPupilY}
          eyelidScale={eyelidScale}
          socketRef={setLeftSocket}
        />
        <EyeSocket
          size={size}
          pupilSize={pupilSize}
          pupilX={rightPupilX}
          pupilY={rightPupilY}
          eyelidScale={eyelidScale}
          socketRef={setRightSocket}
        />
      </motion.span>
    </button>
  );
}
