"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

const ENTER_EASE = `cubic-bezier(${easings.enter.join(", ")})`;
/** Each ridge flip is a crisp blink — the swap itself stays discrete. */
const FLIP_TRANSITION = `opacity ${durations.blink}s ${ENTER_EASE}`;
/** The sheen steps ridge to ridge on the same blink. */
const SHEEN_TRANSITION = `left ${durations.blink}s ${ENTER_EASE}`;

export type LenticularCardProps = {
  /** The card's two faces — full-size content, sliced across the ridges. */
  a: React.ReactNode;
  b: React.ReactNode;
  /** Vertical ridge count. @default 14 */
  ridges?: number;
  /** Card height in px. @default 210 */
  height?: number;
  className?: string;
  /** Names the instrument. @default "Lenticular card" */
  "aria-label"?: string;
  /** Fires once per crossing, when >50% of ridges show the other face. */
  onDominantChange?: (side: "a" | "b") => void;
};

/**
 * A ridged-lens card. Both faces are sliced across vertical ridges, and a
 * sweep value decides each ridge's face discretely — ridge i shows face B
 * once the sweep passes its threshold — so moving across the card flips the
 * print ridge by ridge, like tilting a lenticular photo. The sweep is sprung
 * on `glide` so the flip wave trails the hand, while each individual flip is
 * an instant 0/1 opacity swap snapped by a `blink` tween: the discreteness is
 * the lenticular identity, no 3D rotation. A slider below the card is the
 * always-rendered accessible control (arrows ±5); fine pointers drive the
 * same value by sweeping the card. Under reduced motion pointer tracking is
 * off and the slider swaps the faces instantly.
 */
export function LenticularCard({
  a,
  b,
  ridges = 14,
  height = 210,
  className,
  "aria-label": ariaLabel = "Lenticular card",
  onDominantChange,
}: LenticularCardProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const tracking = motionSafe && pointerFine;

  const count = Math.min(Math.max(Math.round(ridges), 4), 28);

  // S (0..1): the sweep. Pointer and slider both write the target; ridges
  // read the sprung value so the flip wave trails the hand. Reduced motion
  // reads the raw target — instant, no spring.
  const target = useMotionValue(0);
  const sprung = useSpring(target, GLIDE);
  const live = motionSafe ? sprung : target;

  const stageRectRef = React.useRef<DOMRect | null>(null);
  const thumbRef = React.useRef<HTMLSpanElement>(null);
  const dominantRef = React.useRef<"a" | "b">("a");

  const [percent, setPercent] = React.useState(0);
  const [dominant, setDominant] = React.useState<"a" | "b">("a");

  // The slider readout and the dominant side both follow the sprung S.
  // Dominant crossings are deduped by side so the callback fires once each.
  useMotionValueEvent(live, "change", (value) => {
    const s = clamp(value, 0, 1);
    setPercent(Math.round(s * 100));
    const flipped = clamp(Math.round(s * count), 0, count);
    const side: "a" | "b" = flipped * 2 > count ? "b" : "a";
    if (side !== dominantRef.current) {
      dominantRef.current = side;
      setDominant(side);
      onDominantChange?.(side);
    }
  });

  const commit = (s: number) => {
    target.set(clamp(s, 0, 1));
  };

  // -- card sweep (fine pointers, motion-safe only) --------------------------

  const handleStageEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tracking) return;
    stageRectRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handleStageMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tracking) return;
    const rect =
      stageRectRef.current ?? event.currentTarget.getBoundingClientRect();
    stageRectRef.current = rect;
    if (rect.width === 0) return;
    commit((event.clientX - rect.left) / rect.width);
  };

  const handleStageLeave = () => {
    stageRectRef.current = null;
  };

  // -- slider (always rendered; the accessible control) ----------------------

  const sweepFromTrack = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    commit((event.clientX - rect.left) / rect.width);
  };

  const handleTrackDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    sweepFromTrack(event);
    thumbRef.current?.focus();
  };

  const handleTrackMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    sweepFromTrack(event);
  };

  const handleTrackUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleThumbKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const current = target.get();
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + 0.05;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - 0.05;
        break;
      case "PageUp":
        next = current + 0.2;
        break;
      case "PageDown":
        next = current - 0.2;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  // Shared "S as %" — the slider fill's width and the thumb's left.
  const sweepPct = useTransform(live, (s) => `${clamp(s, 0, 1) * 100}%`);
  // The active ridge — the one holding the flip boundary right now.
  const sheenLeft = useTransform(live, (s) => {
    const i = clamp(Math.floor(clamp(s, 0, 1) * count), 0, count - 1);
    return `${(i * 100) / count}%`;
  });

  return (
    <div role="group" aria-label={ariaLabel} className={cn("w-full", className)}>
      {/* the ridged lens */}
      <div
        onPointerEnter={handleStageEnter}
        onPointerMove={handleStageMove}
        onPointerLeave={handleStageLeave}
        onPointerCancel={handleStageLeave}
        style={{ height }}
        className={cn(
          "border-hairline bg-surface-2 relative w-full overflow-hidden rounded-3 border select-none",
          tracking && "cursor-ew-resize",
        )}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: count }, (_, i) => (
            // Ridge order is fixed; index keys are stable here.
            <Ridge
              key={i}
              index={i}
              count={count}
              live={live}
              motionSafe={motionSafe}
              a={a}
              b={b}
            />
          ))}
        </div>

        {/* sheen — brightness up on the active ridge, plus a 1px accent edge */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: sheenLeft,
            width: `${100 / count}%`,
            transition: motionSafe ? SHEEN_TRANSITION : undefined,
            background:
              "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.1) 50%, transparent), linear-gradient(90deg, transparent, var(--accent-wash) 50%, transparent)",
          }}
        >
          <span className="bg-cobalt-bright/70 absolute inset-y-0 left-0 w-px" />
        </motion.div>

        {/* ridge texture — 1px light / 3px transparent, selling the lens at rest */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--hairline) 0px, var(--hairline) 1px, transparent 1px, transparent 4px)",
          }}
        />
      </div>

      {/* the sweep slider — always rendered; keyboard and coarse pointers */}
      <div className="mt-3 flex items-center gap-2 select-none">
        <span aria-hidden className="text-ink-3 font-mono text-[10px]">
          A
        </span>
        <div
          className="relative flex h-5 min-w-0 grow cursor-pointer touch-none items-center"
          onPointerDown={handleTrackDown}
          onPointerMove={handleTrackMove}
          onPointerUp={handleTrackUp}
          onPointerCancel={handleTrackUp}
        >
          <div className="bg-hairline-strong relative h-1 w-full rounded-full">
            <motion.span
              className="bg-cobalt absolute inset-y-0 left-0 rounded-full"
              style={{ width: sweepPct }}
            />
          </div>
          <motion.span
            className="absolute top-1/2"
            style={{ left: sweepPct }}
          >
            <span
              ref={thumbRef}
              role="slider"
              tabIndex={0}
              aria-label={`${ariaLabel} sweep`}
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${percent}%`}
              onKeyDown={handleThumbKeyDown}
              className="focus-visible:ring-cobalt-bright/50 flex h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-1 outline-none focus-visible:ring-2"
            >
              {/* the thumb — a machined bar, not a puck */}
              <span aria-hidden className="bg-cobalt-bright h-4 w-1.5 rounded-1" />
            </span>
          </motion.span>
        </div>
        <span aria-hidden className="text-ink-3 font-mono text-[10px]">
          B
        </span>
      </div>

      <span className="sr-only" aria-live="polite">
        {dominant === "b" ? "Face B dominant" : "Face A dominant"}
      </span>
    </div>
  );
}

type RidgeProps = {
  index: number;
  count: number;
  live: MotionValue<number>;
  motionSafe: boolean;
  a: React.ReactNode;
  b: React.ReactNode;
};

/**
 * One vertical strip of the lens: an overflow-hidden window onto each full
 * face, the face translated back by the ridge's offset so the slices line up.
 * The face choice is discrete — B once the sweep passes (i + 0.5) / count —
 * derived straight from the sprung S, snapped by a blink-fast CSS tween.
 */
function Ridge({ index, count, live, motionSafe, a, b }: RidgeProps) {
  const threshold = (index + 0.5) / count;
  const opacityB = useTransform(live, (s) => (s > threshold ? 1 : 0));
  const opacityA = useTransform(opacityB, (v) => 1 - v);
  const flip = motionSafe ? FLIP_TRANSITION : undefined;

  // The window is 1/count of the card; inside it each face spans the full
  // card width (count × the window) pulled left to this ridge's slice.
  const faceStyle: React.CSSProperties = {
    width: `${count * 100}%`,
    transform: `translateX(-${(index * 100) / count}%)`,
  };

  return (
    <div
      className="absolute inset-y-0 overflow-hidden"
      style={{ left: `${(index * 100) / count}%`, width: `${100 / count}%` }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ opacity: opacityA, transition: flip }}
      >
        <div className="absolute inset-y-0 left-0" style={faceStyle}>
          {a}
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-0"
        style={{ opacity: opacityB, transition: flip }}
      >
        <div className="absolute inset-y-0 left-0" style={faceStyle}>
          {b}
        </div>
      </motion.div>
    </div>
  );
}
