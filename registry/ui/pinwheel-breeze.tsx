"use client";

import * as React from "react";

import { motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — room for the wheel plus a stick down to the edge. */
const STAGE_W = 176;
const STAGE_H = 248;
/** Wheel center measured from the stage top; the stick hangs from here. */
const HEAD_CENTER = 78;
/** Wheel diameter in px (the SVG is authored in a -60..60 viewBox). */
const WHEEL_D = 118;
/** Blend disc diameter — slightly inside the vane sweep. */
const DISC_D = WHEEL_D - 20;

/** Exponential friction per second — the coast from a hard spin lasts ~4s. */
const FRICTION = 1.1;
/** Below this angular speed (deg/s) the wheel is considered at rest. */
const REST_VELOCITY = 10;
/** Angular speed ceiling (deg/s) — no breeze can wind it past this. */
const MAX_VELOCITY = 1400;
/** One click or Enter press adds this much (deg/s) — always a brisk start. */
const KICK_VELOCITY = 420;
/** `onSpin` fires when velocity crosses this pace (deg/s) from below. */
const BRISK_VELOCITY = 360;
/** Degrees of velocity gained per px of pointer travel (impulse = speed × dt × gain). */
const BREEZE_GAIN = 2.2;
/** Per-event impulse cap (deg/s) so one wild jump cannot slam the wheel. */
const BREEZE_MAX_PUSH = 60;
/** Pointer samples further apart than this (s) restart the speed estimate. */
const BREEZE_MAX_GAP = 0.1;
/** Clamp a long stalled frame so a background tab cannot leap the sim. */
const MAX_FRAME_DT = 0.1;
/** Idle sway: ±2deg on a slow phase — the paper never looks dead. */
const SWAY_DEG = 2;
const SWAY_RATE = 0.9;

/** Vane blade — hub to tip, outer bulge, curling back to the hub. */
const VANE_PATH =
  "M 0 0 C -3 -20 -6 -40 -7 -54 C 14 -58 30 -44 34 -26 C 37 -12 24 -3 6 -1 Z";
/** The folded crease — a sliver hugging the blade edge, tinted deeper. */
const FOLD_PATH =
  "M -7 -54 C 5 -44 9 -27 5 -10 C 4 -5 2 -1 0 0 C -3 -20 -6 -40 -7 -54 Z";

/** Alternating paper tints — primary and success washed into the card. */
const VANE_A = "color-mix(in oklab, var(--primary) 62%, var(--card))";
const VANE_B = "color-mix(in oklab, var(--success, #047857) 55%, var(--card))";
const FOLD_A = "color-mix(in oklab, var(--primary) 82%, var(--card))";
const FOLD_B = "color-mix(in oklab, var(--success, #047857) 74%, var(--card))";
/** At speed the two tints read as one — the disc is their midpoint. */
const DISC_COLOR =
  "color-mix(in oklab, var(--primary) 50%, var(--success, #047857))";

const VANES = [0, 1, 2, 3] as const;

type BreezeSample = { x: number; y: number; t: number };

export type PinwheelBreezeProps = {
  /** Fires when a kick or breeze pushes the wheel past a brisk pace. */
  onSpin?: () => void;
  className?: string;
};

/**
 * A paper pinwheel that spins from the breeze your cursor makes. Sweeping the
 * pointer across the stage measures its speed and feeds it to the wheel as
 * angular velocity; one rAF loop advances a single rotation motion value while
 * fixed friction bleeds it off, so the wheel whirls and then coasts down
 * gracefully. At speed the vane tints wash together behind a translucent disc
 * whose opacity tracks velocity, and at rest the wheel sways a lazy two
 * degrees so the paper never looks dead. The whole toy is a real button —
 * click or Enter gives it a fixed push, and `onSpin` fires whenever a push or
 * breeze sends it past a brisk pace. Breeze tracking engages only for fine
 * pointers; everyone else plays through pushes.
 * Reduced motion: no continuous spin, no idle sway, no blend disc — each
 * activation steps the wheel a crisp 90 degrees instead.
 */
export function PinwheelBreeze({
  onSpin,
  className,
}: PinwheelBreezeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();

  /** Accumulated rotation in degrees — the one value the loop advances. */
  const angle = useMotionValue(0);
  /** Normalized angular speed (0..1 of MAX_VELOCITY), written per frame. */
  const speed = useMotionValue(0);
  const discOpacity = useTransform(speed, [0.25, 1], [0, 0.45]);

  const velocityRef = React.useRef(0);
  const breezeRef = React.useRef<BreezeSample | null>(null);
  const rafRef = React.useRef(0);
  const tickRef = React.useRef<(now: number) => void>(() => {});

  // The loop: started here, advanced entirely through refs and motion values,
  // so React never re-renders while the wheel turns.
  React.useEffect(() => {
    if (!motionSafe) return;
    let lastTime: number | null = null;
    let restAngle = angle.get();
    let swayPhase = 0;
    let wasSpinning = false;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tickRef.current);
      if (lastTime === null) {
        lastTime = now;
        return;
      }
      let dt = (now - lastTime) / 1000;
      lastTime = now;
      if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

      let velocity = velocityRef.current * Math.exp(-FRICTION * dt);
      if (velocity < REST_VELOCITY) velocity = 0;
      velocityRef.current = velocity;
      speed.set(Math.min(1, velocity / MAX_VELOCITY));

      if (velocity > 0) {
        wasSpinning = true;
        angle.set(angle.get() + velocity * dt);
        return;
      }
      if (wasSpinning) {
        // The coast just ended — rebase near zero and sway from here.
        wasSpinning = false;
        restAngle = angle.get() % 360;
        angle.set(restAngle);
        swayPhase = 0;
      }
      swayPhase += dt * SWAY_RATE;
      angle.set(restAngle + Math.sin(swayPhase) * SWAY_DEG);
    };

    tickRef.current = tick;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      velocityRef.current = 0;
      speed.set(0);
    };
  }, [motionSafe, angle, speed]);

  const addVelocity = (push: number) => {
    const prev = velocityRef.current;
    const next = Math.min(prev + push, MAX_VELOCITY);
    velocityRef.current = next;
    if (prev < BRISK_VELOCITY && next >= BRISK_VELOCITY) onSpin?.();
  };

  const handleBreeze = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || !pointerFine) return;
    const last = breezeRef.current;
    breezeRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };
    if (!last) return;
    const dt = (event.timeStamp - last.t) / 1000;
    if (dt <= 0 || dt > BREEZE_MAX_GAP) return;
    const travel = Math.hypot(event.clientX - last.x, event.clientY - last.y);
    const pointerSpeed = travel / dt; // px/s across the stage
    addVelocity(Math.min(pointerSpeed * dt * BREEZE_GAIN, BREEZE_MAX_PUSH));
  };

  const clearBreeze = () => {
    breezeRef.current = null;
  };

  const handleKick = () => {
    if (!motionSafe) {
      // Stepped, never continuous — one crisp quarter turn per activation.
      angle.set(angle.get() + 90);
      onSpin?.();
      return;
    }
    addVelocity(KICK_VELOCITY);
  };

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-3", className)}
      onPointerMove={handleBreeze}
      onPointerLeave={clearBreeze}
    >
      <button
        type="button"
        aria-label="Give the pinwheel a push"
        onClick={handleKick}
        className={cn(
          "relative block cursor-pointer overflow-hidden rounded-3 border border-hairline bg-surface-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* The stick, planted from the hub down to the stage edge. */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full border border-hairline bg-surface-2"
          style={{ top: HEAD_CENTER, width: 5, height: STAGE_H - HEAD_CENTER }}
        />

        {/* The wheel — four folded vanes on one rotating motion value. */}
        <motion.span
          aria-hidden
          className="absolute block"
          style={{
            left: "50%",
            top: HEAD_CENTER,
            width: WHEEL_D,
            height: WHEEL_D,
            marginLeft: -WHEEL_D / 2,
            marginTop: -WHEEL_D / 2,
            rotate: angle,
          }}
        >
          <svg
            viewBox="-60 -60 120 120"
            width={WHEEL_D}
            height={WHEEL_D}
            className="block"
          >
            {VANES.map((i) => (
              <g key={i} transform={`rotate(${i * 90})`}>
                <path d={VANE_PATH} fill={i % 2 === 0 ? VANE_A : VANE_B} />
                <path
                  d={FOLD_PATH}
                  fill={i % 2 === 0 ? FOLD_A : FOLD_B}
                  opacity={0.9}
                />
              </g>
            ))}
          </svg>
        </motion.span>

        {/* At speed the tints visually blend — a blur-free translucent disc. */}
        {motionSafe && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: "50%",
              top: HEAD_CENTER,
              width: DISC_D,
              height: DISC_D,
              marginLeft: -DISC_D / 2,
              marginTop: -DISC_D / 2,
              background: DISC_COLOR,
              opacity: discOpacity,
            }}
          />
        )}

        {/* The hub pin, always on top and never rotating. */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
          style={{
            left: "50%",
            top: HEAD_CENTER,
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
          }}
        />
      </button>

      <p className="text-label font-mono text-ink-3 select-none">
        wave a breeze · click for a push
      </p>
    </div>
  );
}
