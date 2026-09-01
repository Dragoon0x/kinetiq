"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Stage box in px. */
const STAGE_W = 150;
const STAGE_H = 96;
/** Top body width — the rotate origin sits at its bottom center (the tip). */
const TOP_W = 58;

/** Flick px/s → spin deg/s. */
const FLICK_SCALE = 1.8;
/** Spin caps and the standard click throw, deg/s. */
const MAX_SPIN = 2800;
const MEDIUM_SPIN = 1500;
/** Below this a release reads as a click, not a flick. */
const CLICK_SPIN_MIN = 320;
/** Velocity retention per 60Hz frame, applied time-based in the loop. */
const FRICTION = 0.985;
/** Clamp a long resumed frame so the sim never fast-forwards. */
const MAX_DT = 0.064;
/** A stalled drag (no move for this long before release) counts as a click. */
const VEL_STALE_MS = 120;

/** Under this speed the death wobble begins. */
const WOBBLE_START = 700;
/** Under this speed the top falls. */
const FALL_SPEED = 150;
/** Wobble amplitude at the moment of falling, deg. */
const WOBBLE_MAX_DEG = 13;
/** Precession rate: slower spin, slower (and wider) wobble. */
const WOBBLE_HZ_BASE = 1.1;
const WOBBLE_HZ_SPAN = 1.6;

/** Fallen rest tilt, and the one rock back on landing. */
const REST_TILT = 78;
const ROCK_DEG = 8;

/** Speed range over which the stripe smears into a ring. */
const BLUR_LO = 900;
const BLUR_HI = 2200;
/** Stripe travel across the belly, and the ghost-echo offset, px. */
const STRIPE_TRAVEL = 21;
const GHOST_OFFSET = 9;

const CAPTIONS = {
  rest: "flick it",
  spinning: "spinning",
  wobbling: "wobbling…",
  fallen: "down. again?",
} as const;

type Phase = keyof typeof CAPTIONS;

/** Body paint: primary mixed into the card, deeper toward the tip. */
const CROWN_FILL = "color-mix(in oklab, var(--primary) 22%, var(--card))";
const SHOULDER_FILL = "color-mix(in oklab, var(--primary) 16%, var(--card))";
const BELLY_FILL = "color-mix(in oklab, var(--primary) 10%, var(--card))";
const TAPER_FILL = "color-mix(in oklab, var(--primary) 24%, var(--card))";
const TIP_FILL = "color-mix(in oklab, var(--primary) 36%, var(--card))";
/** The painted segment that makes rotation legible. */
const STRIPE_FILL = "color-mix(in oklab, var(--primary) 85%, var(--card))";
/** Soft contact shadow — a radial wash, no filters. */
const SHADOW_FILL =
  "radial-gradient(closest-side, color-mix(in oklab, var(--ink-3) 55%, transparent), transparent)";

export type TopSpinProps = {
  /** Fires the moment the top tips over. */
  onFall?: () => void;
  className?: string;
};

/**
 * A spinning top that answers to a flick. Drag across it and release — the
 * horizontal velocity of the flick becomes spin, up to a fixed cap — or just
 * click (Enter and Space work too) for a standard medium throw. An rAF loop
 * bleeds speed through fixed friction: fast means dead straight with the
 * painted stripe smearing into a ring, slow means the death wobble, tilt
 * swinging wider as the spin dies, until the top glides over to a ~78 degree
 * rest and rocks once on landing. Click the fallen top and it snaps back
 * upright, ready for another throw, while a mono caption walks
 * "flick it" → "spinning" → "wobbling…" → "down. again?".
 * Reduced motion: no rAF loop — each activation swaps between three still
 * states (standing, a static spin with the stripe shown as a ring, fallen)
 * with instant transitions, and the caption still cycles.
 */
export function TopSpin({
  onFall,
  className,
}: TopSpinProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("rest");
  const phaseRef = React.useRef<Phase>("rest");

  // Spin angle (deg, unbounded), body tilt about the tip (deg), and the
  // current spin speed (deg/s) that the smear layers key off.
  const angle = useMotionValue(0);
  const tilt = useMotionValue(0);
  const speed = useMotionValue(0);

  // The painted segment orbits the belly: x from sin, foreshortening from
  // cos, and a dimmer pass across the back half.
  const stripeX = useTransform(angle, (a) => Math.sin(a * DEG) * STRIPE_TRAVEL);
  const stripeScaleX = useTransform(angle, (a) =>
    Math.max(0.3, Math.abs(Math.cos(a * DEG))),
  );
  const stripeSide = useTransform(angle, (a) =>
    Math.cos(a * DEG) >= 0 ? 1 : 0.35,
  );
  const ghostLeftX = useTransform(stripeX, (v) => v - GHOST_OFFSET);
  const ghostRightX = useTransform(stripeX, (v) => v + GHOST_OFFSET);

  // The "blur" is opacity layering only: the crisp stripe dims with speed
  // while two ghost echoes and a full ring band fade up underneath it.
  const crispDim = useTransform(speed, [BLUR_LO, BLUR_HI], [1, 0.45]);
  const ghostOpacity = useTransform(speed, [BLUR_LO, BLUR_HI], [0, 0.4]);
  const bandOpacity = useTransform(speed, [BLUR_LO, BLUR_HI], [0, 0.55]);

  // Loop state lives in refs; the rAF callback is kept in a ref created by
  // the starting handler and re-scheduled through it, never via a hook binding.
  const rafRef = React.useRef<number | null>(null);
  const loopRef = React.useRef<((now: number) => void) | null>(null);
  const lastFrame = React.useRef<number | null>(null);
  const velRef = React.useRef(0);
  const wobblePhase = React.useRef(0);
  const tiltAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  // Flick measurement — handlers only, never render.
  const dragId = React.useRef<number | null>(null);
  const lastX = React.useRef(0);
  const lastT = React.useRef(0);
  const flickVel = React.useRef(0);

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      loopRef.current = null;
      tiltAnim.current?.stop();
    };
  }, []);

  // If the preference flips to reduced mid-spin, kill the live physics and
  // freeze into the static spinning pose (motion values only — no state).
  React.useEffect(() => {
    if (motionSafe) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    loopRef.current = null;
    lastFrame.current = null;
    tiltAnim.current?.stop();
    if (phaseRef.current === "spinning" || phaseRef.current === "wobbling") {
      tilt.set(0);
      speed.set(BLUR_HI);
    }
  }, [motionSafe, speed, tilt]);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stopLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    loopRef.current = null;
    lastFrame.current = null;
  };

  /** The spin has died: tip over on glide, then rock once on recoil. */
  const settleFall = () => {
    rafRef.current = null;
    loopRef.current = null;
    lastFrame.current = null;
    const dir = tilt.get() < 0 ? -1 : 1;
    setPhaseBoth("fallen");
    speed.set(0);
    onFall?.();
    tiltAnim.current = animate(tilt, REST_TILT * dir, {
      ...springs.glide,
      onComplete: () => {
        tilt.set((REST_TILT - ROCK_DEG) * dir);
        tiltAnim.current = animate(tilt, REST_TILT * dir, springs.recoil);
      },
    });
  };

  /** Release the flick: seed velocity, straighten up, start the loop. */
  const startSpin = (v0: number) => {
    stopLoop();
    tiltAnim.current?.stop();
    setPhaseBoth("spinning");
    velRef.current = v0;
    wobblePhase.current = 0;
    speed.set(Math.abs(v0));
    // Any leftover wobble exits fast — a tween, since the wobble is leaving.
    tiltAnim.current = animate(tilt, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });

    const tick = (now: number) => {
      const prev = lastFrame.current;
      lastFrame.current = now;
      const next = loopRef.current;
      if (prev === null) {
        if (next) rafRef.current = requestAnimationFrame(next);
        return;
      }
      const dt = Math.min((now - prev) / 1000, MAX_DT);
      velRef.current *= Math.pow(FRICTION, dt * 60);
      const speedAbs = Math.abs(velRef.current);
      angle.set(angle.get() + velRef.current * dt);
      speed.set(speedAbs);
      if (speedAbs <= FALL_SPEED) {
        settleFall();
        return;
      }
      if (speedAbs < WOBBLE_START) {
        if (phaseRef.current !== "wobbling") setPhaseBoth("wobbling");
        const norm = speedAbs / WOBBLE_START;
        wobblePhase.current +=
          (WOBBLE_HZ_BASE + WOBBLE_HZ_SPAN * norm) * TAU * dt;
        tilt.set(Math.sin(wobblePhase.current) * WOBBLE_MAX_DEG * (1 - norm));
      }
      if (next) rafRef.current = requestAnimationFrame(next);
    };
    loopRef.current = tick;
    rafRef.current = requestAnimationFrame(tick);
  };

  /** A click on the fallen top stands it back up, ready to flick. */
  const standUp = () => {
    stopLoop();
    tiltAnim.current?.stop();
    setPhaseBoth("rest");
    speed.set(0);
    tiltAnim.current = animate(tilt, 0, springs.snap);
  };

  /** Reduced motion: three still states, swapped instantly per activation. */
  const advanceReduced = () => {
    stopLoop();
    tiltAnim.current?.stop();
    const current = phaseRef.current;
    if (current === "rest") {
      angle.set(0);
      tilt.set(0);
      speed.set(BLUR_HI);
      setPhaseBoth("spinning");
    } else if (current === "spinning" || current === "wobbling") {
      speed.set(0);
      tilt.set(REST_TILT);
      setPhaseBoth("fallen");
      onFall?.();
    } else {
      speed.set(0);
      tilt.set(0);
      setPhaseBoth("rest");
    }
  };

  /** One entry point for release, click, and keyboard. */
  const activate = (pxVel: number) => {
    if (!motionSafe) {
      advanceReduced();
      return;
    }
    if (phaseRef.current === "fallen") {
      standUp();
      return;
    }
    let v0 = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, pxVel * FLICK_SCALE));
    if (Math.abs(v0) < CLICK_SPIN_MIN) v0 = MEDIUM_SPIN;
    startSpin(v0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragId.current = event.pointerId;
    lastX.current = event.clientX;
    lastT.current = event.timeStamp;
    flickVel.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragId.current !== event.pointerId) return;
    const dt = event.timeStamp - lastT.current;
    if (dt <= 0) return;
    const inst = ((event.clientX - lastX.current) / dt) * 1000;
    flickVel.current = flickVel.current * 0.55 + inst * 0.45;
    lastX.current = event.clientX;
    lastT.current = event.timeStamp;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragId.current !== event.pointerId) return;
    dragId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A drag that stalled before release is a click, not a flick.
    const stale = event.timeStamp - lastT.current > VEL_STALE_MS;
    activate(stale ? 0 : flickVel.current);
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (dragId.current !== event.pointerId) return;
    dragId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    activate(0);
  };

  return (
    <button
      type="button"
      aria-label="Spin the top"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex touch-none flex-col items-center gap-2 rounded-4 p-3 select-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        className,
      )}
    >
      <span
        aria-hidden
        className="relative block"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* The little stage it performs on */}
        <span className="absolute bottom-0 left-1/2 h-[8px] w-[92px] -translate-x-1/2 rounded-full border border-hairline bg-surface-2" />
        {/* Soft contact shadow at the tip */}
        <span
          className="absolute bottom-[5px] left-1/2 h-[10px] w-[48px] -translate-x-1/2 rounded-full"
          style={{ background: SHADOW_FILL }}
        />

        {/* The top — rotates about its tip (bottom center) */}
        <motion.span
          className="absolute bottom-[9px] left-1/2 flex flex-col items-center"
          style={{
            width: TOP_W,
            marginLeft: -TOP_W / 2,
            rotate: tilt,
            transformOrigin: "50% 100%",
          }}
        >
          {/* Stem */}
          <span className="block h-[13px] w-[7px] rounded-t-full border border-hairline bg-surface-2" />
          {/* Crown */}
          <span
            className="-mt-[2px] block h-[9px] w-[26px] rounded-full border border-hairline"
            style={{ background: CROWN_FILL }}
          />
          {/* Shoulder */}
          <span
            className="-mt-[3px] block h-[12px] w-[44px] rounded-full border border-hairline"
            style={{ background: SHOULDER_FILL }}
          />
          {/* Belly — widest layer, carries the painted segment */}
          <span
            className="relative -mt-1 block h-[16px] w-[58px] overflow-hidden rounded-full border border-hairline shadow-raised"
            style={{ background: BELLY_FILL }}
          >
            {/* Ring band — the stripe smeared at speed (and the static ring
                shown while "spinning" under reduced motion) */}
            <motion.span
              className="absolute inset-x-[5px] top-[4px] h-[8px] rounded-full"
              style={{ opacity: bandOpacity, background: STRIPE_FILL }}
            />
            {/* Ghost echoes flanking the stripe */}
            <motion.span
              className="absolute inset-0 block"
              style={{ opacity: ghostOpacity }}
            >
              <motion.span
                className="absolute top-[3px] left-1/2 -ml-[3.5px] h-[10px] w-[7px] rounded-full"
                style={{ x: ghostLeftX, background: STRIPE_FILL }}
              />
              <motion.span
                className="absolute top-[3px] left-1/2 -ml-[3.5px] h-[10px] w-[7px] rounded-full"
                style={{ x: ghostRightX, background: STRIPE_FILL }}
              />
            </motion.span>
            {/* The crisp painted segment itself */}
            <motion.span
              className="absolute inset-0 block"
              style={{ opacity: crispDim }}
            >
              <motion.span
                className="absolute top-[3px] left-1/2 -ml-[3.5px] h-[10px] w-[7px] rounded-full"
                style={{
                  x: stripeX,
                  scaleX: stripeScaleX,
                  opacity: stripeSide,
                  background: STRIPE_FILL,
                }}
              />
            </motion.span>
          </span>
          {/* Taper */}
          <span
            className="-mt-1 block h-[11px] w-[34px] rounded-full border border-hairline"
            style={{ background: TAPER_FILL }}
          />
          {/* Tip */}
          <span
            className="-mt-1 block h-[9px] w-[14px] rounded-b-full border border-hairline"
            style={{ background: TIP_FILL }}
          />
          {/* Point */}
          <span
            className="-mt-[2px] block h-[6px] w-[5px] rounded-b-full"
            style={{ background: TIP_FILL }}
          />
        </motion.span>
      </span>

      <span
        aria-hidden
        className="h-4 text-label font-mono leading-none text-ink-3"
      >
        {CAPTIONS[phase]}
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {phase === "spinning" || phase === "wobbling"
          ? "spinning"
          : phase === "fallen"
            ? "fell over"
            : ""}
      </span>
    </button>
  );
}
