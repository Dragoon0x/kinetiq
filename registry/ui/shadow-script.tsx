"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Light swing limit either side of overhead, in degrees. */
const RANGE = 60;
/** Literal for aria-valuemin — the a11y linter wants a plain number. */
const MIN_ANGLE = -60;
/** Legibility line: |angle| at and past which the shadow reads. */
const REVEAL_AT = 42;
/** Arrow-key nudge, degrees. */
const KEY_STEP = 4;
/** Reduced motion parks the light here so the secret is legible at rest. */
const RM_ANGLE = 45;
/** Shear per degree of swing — the shadow leans away from the lamp. */
const SKEW_GAIN = 0.9;
/** Horizontal throw per degree, px — the slab slides opposite the light. */
const THROW_PX = 0.45;
/** Lamp arc: horizontal reach as a % of the arc row, vertical drop in px. */
const ARC_SPAN = 42;
const ARC_DROP = 26;
const ARC_APEX = 18;
/** Arc row height, px — the guide path below is plotted against it. */
const ROW_H = 64;

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * The cast-shadow pose at a light angle: overhead squashes the secret to an
 * unreadable sliver; a low lamp stretches it long, dark, and legible.
 */
const shadowPose = (angle: number) => ({
  skewX: -angle * SKEW_GAIN,
  scaleY: mapRange(Math.abs(angle), 0, RANGE, 0.18, 0.92),
  x: -angle * THROW_PX,
  opacity: mapRange(Math.abs(angle), 0, RANGE, 0.12, 0.55),
  letterSpacing: `${mapRange(Math.abs(angle), 0, RANGE, 0.2, 0)}em`,
});

/** The fixed reduced-motion pose — pre-stretched readable. */
const RM_POSE = shadowPose(RM_ANGLE);

export type ShadowScriptProps = {
  /** The standing headline — one short word or phrase. */
  text: string;
  /** The message hidden in the cast shadow. */
  secret: string;
  /** Starting light angle, −60..60; 0 hangs the lamp overhead. @default 0 */
  defaultAngle?: number;
  /** Fires crossing |angle| ≥ 42 — the legibility line — deduped both ways. */
  onReveal?: (revealed: boolean) => void;
  className?: string;
  /** Accessible name for the light slider. @default "Light angle" */
  "aria-label"?: string;
};

/**
 * A shadow theater for type. The headline stands on a ground hairline while
 * a sun lamp rides an arc overhead; its cast shadow below the baseline is a
 * different text entirely — the secret. The lamp is a real slider (arrows ±4°,
 * Home/End to the rails, drag anywhere on the arc row, pointer captured) and
 * the angle lives in a motion value chased by `glide`; every shadow property
 * — skew, vertical squash, throw, ink density, letter-spacing — derives from
 * that sprung angle. Overhead the shadow is a mute sliver; past ±42° it
 * stretches legible, its tracking settles, and an accent underline tweens in.
 * Both texts are always in one sr-only sentence — the optics never gate
 * content. Reduced motion: the slider works 1:1 with no spring lag, and the
 * shadow renders pre-stretched readable at a fixed 45°.
 */
export function ShadowScript({
  text,
  secret,
  defaultAngle = 0,
  onReveal,
  className,
  "aria-label": ariaLabel = "Light angle",
}: ShadowScriptProps) {
  const motionSafe = useMotionSafe();
  const rowRef = React.useRef<HTMLDivElement>(null);
  const target = useMotionValue(clamp(defaultAngle, -RANGE, RANGE));
  const sprung = useSpring(target, GLIDE);
  const live = motionSafe ? sprung : target;

  /** Commanded angle for the slider semantics. */
  const [announced, setAnnounced] = React.useState(() =>
    Math.round(clamp(defaultAngle, -RANGE, RANGE)),
  );
  /** Sprung angle for the mono readout, deduped per whole degree. */
  const [readout, setReadout] = React.useState(announced);
  const [revealed, setRevealed] = React.useState(
    () => Math.abs(clamp(defaultAngle, -RANGE, RANGE)) >= REVEAL_AT,
  );
  const revealedRef = React.useRef(
    Math.abs(clamp(defaultAngle, -RANGE, RANGE)) >= REVEAL_AT,
  );

  const onRevealRef = React.useRef(onReveal);
  React.useEffect(() => {
    onRevealRef.current = onReveal;
  });

  // The reveal tracks the value the shadow is actually drawn from — the
  // sprung angle (the raw target under reduced motion) — deduped so each
  // crossing of the legibility line reports exactly once per direction.
  useMotionValueEvent(live, "change", (angle) => {
    setReadout(Math.round(angle));
    const over = Math.abs(angle) >= REVEAL_AT;
    if (over !== revealedRef.current) {
      revealedRef.current = over;
      setRevealed(over);
      onRevealRef.current?.(over);
    }
  });

  const commit = (next: number) => {
    const v = clamp(next, -RANGE, RANGE);
    target.set(v);
    setAnnounced(Math.round(v));
  };

  const moveTo = (clientX: number) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    commit(mapRange(clientX, rect.left, rect.right, -RANGE, RANGE));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveTo(event.clientX);
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Lamp on its arc: an ellipse over the row, apex at overhead.
  const lampLeft = useTransform(
    live,
    (a) => `${50 + Math.sin(toRad(a)) * ARC_SPAN}%`,
  );
  const lampTop = useTransform(
    live,
    (a) => ARC_APEX + (1 - Math.cos(toRad(a))) * ARC_DROP,
  );

  // The cast shadow, wholly derived from the sprung angle.
  const skewX = useTransform(live, (a) => shadowPose(a).skewX);
  const scaleY = useTransform(live, (a) => shadowPose(a).scaleY);
  const throwX = useTransform(live, (a) => shadowPose(a).x);
  const shadowOpacity = useTransform(live, (a) => shadowPose(a).opacity);
  const shadowTracking = useTransform(live, (a) => shadowPose(a).letterSpacing);

  // Arc guide endpoints, in the row's 100×ROW_H viewBox.
  const edgeX = Math.sin(toRad(RANGE)) * ARC_SPAN;
  const edgeY = ARC_APEX + (1 - Math.cos(toRad(RANGE))) * ARC_DROP;
  const guide = `M ${(50 - edgeX).toFixed(1)} ${edgeY} Q 50 ${
    2 * ARC_APEX - edgeY
  } ${(50 + edgeX).toFixed(1)} ${edgeY}`;

  return (
    <div
      className={cn(
        "border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border select-none",
        className,
      )}
    >
      {/* The optics are a trick; the words never are. */}
      <p className="sr-only">
        {text}. Hidden note: {secret}.
      </p>

      {/* Instrument readout — the commanded light angle, live per degree. */}
      <div className="flex justify-end px-4 pt-3">
        <p
          aria-hidden
          className="text-ink-3 font-mono text-[10px] tracking-[0.15em] uppercase tabular-nums"
        >
          Light &middot; {readout < 0 ? "-" : "+"}
          {Math.abs(readout)}&deg;
        </p>
      </div>

      {/* The arc row: drag anywhere here to steer the lamp. */}
      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative mx-3 mt-1 cursor-ew-resize touch-none"
        style={{ height: ROW_H }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 100 ${ROW_H}`}
          preserveAspectRatio="none"
        >
          <path
            d={guide}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The lamp: sun disc + mast, ray aimed down the radius at the type. */}
        <motion.div
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          aria-valuemin={MIN_ANGLE}
          aria-valuemax={RANGE}
          aria-valuenow={announced}
          aria-valuetext={
            announced === 0
              ? "Overhead"
              : `${Math.abs(announced)} degrees ${announced < 0 ? "left" : "right"}`
          }
          onKeyDown={(event) => {
            let next: number | null = null;
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              next = target.get() - KEY_STEP;
            } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              next = target.get() + KEY_STEP;
            } else if (event.key === "Home") {
              next = -RANGE;
            } else if (event.key === "End") {
              next = RANGE;
            }
            if (next === null) return;
            event.preventDefault();
            commit(next);
          }}
          style={{ left: lampLeft, top: lampTop, x: "-50%", y: "-50%", rotate: live }}
          className="bg-cobalt-bright absolute size-5 cursor-ew-resize rounded-full shadow-[0_0_12px_2px_var(--accent-wash)]"
        >
          <span
            aria-hidden
            className="bg-cobalt-bright absolute bottom-full left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full"
          />
          <span
            aria-hidden
            className="from-cobalt-bright/70 absolute top-full left-1/2 h-6 w-px -translate-x-1/2 bg-gradient-to-b to-transparent"
          />
        </motion.div>
      </div>

      {/* The standing type, its ground, and the shadow it throws. */}
      <div aria-hidden>
        <p className="text-ink px-4 pt-1 text-center text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {text}
        </p>
        <div className="bg-hairline-strong mt-1 h-px w-full" />
        <div className="flex flex-col items-center overflow-hidden px-3 pt-1 pb-4">
          <motion.p
            style={{
              skewX: motionSafe ? skewX : RM_POSE.skewX,
              scaleY: motionSafe ? scaleY : RM_POSE.scaleY,
              x: motionSafe ? throwX : RM_POSE.x,
              opacity: motionSafe ? shadowOpacity : RM_POSE.opacity,
              letterSpacing: motionSafe ? shadowTracking : RM_POSE.letterSpacing,
              transformOrigin: "top center",
            }}
            className="text-ink text-lg font-semibold whitespace-nowrap sm:text-xl"
          >
            {secret}
          </motion.p>
          <motion.div
            initial={false}
            animate={{ opacity: motionSafe ? (revealed ? 1 : 0) : 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="bg-cobalt mt-2 h-px w-3/5 max-w-64 rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
