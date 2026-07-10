"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { durations, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Rest drop per step, as a fraction of `stepPx` — the light hangs overhead. */
const BASE_DROP = 0.9;
/** Counter-rotation gain: how hard the extrusion swings against the tilt. */
const TILT_GAIN = 1.8;
/** Press squash on the whole block — the flatten does the real talking. */
const PRESS_SCALE = 0.985;
/** Peak block rotation toward the pointer, in degrees. */
const MAX_TILT = 7;

export type ExtrudeTitleProps = {
  /** The headline. A string — the extrusion is layered from it. */
  children: string;
  /** Extrusion steps in the shadow stack. @default 8 */
  depth?: number;
  /** Offset per extrusion step, in px. @default 1.1 */
  stepPx?: number;
  /** Fires on activation — click, Enter, or Space. */
  onPress?: () => void;
  /** Size and voice live with the consumer (the demo uses text-4xl). */
  className?: string;
  /** Accessible name. @default the title text itself */
  "aria-label"?: string;
};

/**
 * A faux-extruded headline set in a real button. The block tilts toward the
 * pointer (perspective 700) while its text-shadow extrusion counter-rotates,
 * so the light reads as fixed while the mass turns. Pressing flattens the
 * extrusion to zero on `flick` with a slight squash; release pops the depth
 * back on `recoil`. Reduced motion (or a coarse pointer): no tilt — the
 * extrusion holds its base vector, and the press still flattens and restores
 * on fast tweens.
 */
export function ExtrudeTitle({
  children,
  depth = 8,
  stepPx = 1.1,
  onPress,
  className,
  "aria-label": ariaLabel = children,
}: ExtrudeTitleProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const tilt = usePointerTilt({ maxTilt: MAX_TILT, disabled: !live });

  /** 1 at rest, 0 pressed flat — every shadow offset multiplies by it. */
  const depthScale = useMotionValue(1);
  const pressScale = useMotionValue(1);
  const pressedRef = React.useRef(false);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  // The tilt hook self-cleans; the press controls are ours to stop.
  React.useEffect(
    () => () => {
      for (const controls of controlsRef.current) controls.stop();
    },
    [],
  );

  // Ink ramp: near steps read as the block's machined side, the tail
  // dissolves. --ink-3 keeps the extrusion handsome in both themes.
  const steps = Math.max(0, Math.round(depth));
  const inks = Array.from({ length: steps }, (_, i) => {
    const hold = Math.round(85 * (1 - (i + 1) / (steps + 1)));
    return `color-mix(in oklab, var(--ink-3) ${hold}%, transparent)`;
  });

  // One shadow string from the sprung tilt: the extrusion vector
  // counter-rotates (dx opposes tiltX) so the light source stays put.
  const extrusion = useTransform(
    [tilt.tiltX, tilt.tiltY, depthScale],
    ([tx = 0, ty = 0, flat = 1]: number[]) => {
      if (inks.length === 0) return "none";
      const dx = -tx * TILT_GAIN * stepPx;
      const dy = (BASE_DROP + ty * TILT_GAIN) * stepPx;
      return inks
        .map((ink, i) => {
          const reach = (i + 1) * flat;
          return `${(dx * reach).toFixed(2)}px ${(dy * reach).toFixed(2)}px 0 ${ink}`;
        })
        .join(", ");
    },
  );

  const stopPressControls = () => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  };

  const flatten = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    stopPressControls();
    const press = motionSafe ? springs.flick : { duration: durations.fast };
    controlsRef.current = [
      animate(depthScale, 0, press),
      animate(pressScale, PRESS_SCALE, press),
    ];
  };

  const restore = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    stopPressControls();
    // Two keyframes only: from wherever the press left it, back to 1.
    const release = motionSafe ? springs.recoil : { duration: durations.fast };
    controlsRef.current = [
      animate(depthScale, 1, release),
      animate(pressScale, 1, release),
    ];
  };

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onPress?.()}
      onPointerEnter={live ? tilt.handlers.onPointerEnter : undefined}
      onPointerMove={live ? tilt.handlers.onPointerMove : undefined}
      onPointerDown={(event) => {
        if (event.button === 0) flatten();
      }}
      onPointerUp={restore}
      onPointerLeave={() => {
        if (live) tilt.handlers.onPointerLeave();
        restore();
      }}
      onPointerCancel={() => {
        if (live) tilt.handlers.onPointerCancel();
        restore();
      }}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          flatten();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") restore();
      }}
      onBlur={restore}
      style={{
        rotateX: tilt.rotateX,
        rotateY: tilt.rotateY,
        scale: pressScale,
        transformPerspective: perspectives.near,
      }}
      className={cn(
        "text-ink relative inline-block rounded-2 px-2 py-1 font-sans font-semibold tracking-tight select-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/50",
        className,
      )}
    >
      <motion.span className="block" style={{ textShadow: extrusion }}>
        {children}
      </motion.span>
    </motion.button>
  );
}
