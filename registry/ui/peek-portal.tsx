"use client";

import * as React from "react";

import { AnimatePresence, motion, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { durations, exitFor, safe, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Resting overscan of the framed scene, so counter-shifts never expose edges. */
const SCENE_SCALE = 1.12;
/** Where the scene zooms to as you step through the portal. */
const SCENE_ZOOM = 1.22;
/** The mat expands outward as it fades — the frame gives way, not shrinks. */
const MAT_EXPAND = 1.05;
/** The beyond view arrives from just inside its final size. */
const BEYOND_FROM = 0.96;
/** Frame rotation stays subtle — the window matters more than the plate. */
const FRAME_TILT = 3;

export type PeekPortalProps = {
  /** What shows through the aperture — a landscape/diorama layer you style. */
  scene: React.ReactNode;
  /** The full view you step into; fills the component. */
  beyond: React.ReactNode;
  /** Accessible name for the frame button. @default "Through the aperture" */
  sceneLabel?: string;
  /** Label on the floating return chip. @default "Step back" */
  backLabel?: string;
  /** Max counter-shift of the scene against the frame, in px. @default 14 */
  depth?: number;
  /** Component height, in px. @default 260 */
  height?: number;
  /** Fires with `true` on stepping through, `false` on stepping back. */
  onStep?: (through: boolean) => void;
  className?: string;
};

/**
 * A framed aperture whose inner scene counter-shifts against the frame. The
 * pointer leans around the opening on `usePointerTilt`'s sprung tilt: the
 * scene translates opposite the pointer by up to `depth` px while an inner
 * vignette drifts with it at a third of that — two layers moving oppositely
 * sell the window illusion — and the whole plate tilts up to 3°. Click (or
 * Enter/Space) steps through: the scene zooms 1.12 → 1.22 and fades on
 * `exitFor`, the mat expands away, and `beyond` glides in 0.96 → 1; a mono
 * back chip returns. Focus follows each step and a polite region announces
 * it. Reduced motion or coarse pointers: no parallax or tilt, and both steps
 * become instant crossfades at `durations.fast`.
 */
export function PeekPortal({
  scene,
  beyond,
  sceneLabel = "Through the aperture",
  backLabel = "Step back",
  depth = 14,
  height = 260,
  onStep,
  className,
}: PeekPortalProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const fine = usePointerFine();
  const active = motionSafe && fine;

  const [through, setThrough] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const frameRef = React.useRef<HTMLButtonElement | null>(null);
  const backRef = React.useRef<HTMLButtonElement | null>(null);
  const focusRafRef = React.useRef(0);

  // The house pointer idiom: sprung tilt drives both rotation and parallax.
  const tilt = usePointerTilt({ maxTilt: FRAME_TILT, disabled: !active });
  // Scene counter-shifts against the pointer — lean right, see more of the left.
  const counterX = useTransform(tilt.tiltX, (v) => v * -depth);
  const counterY = useTransform(tilt.tiltY, (v) => v * -depth);
  // The vignette rides with the pointer at a third depth, opposing the scene.
  const vignetteX = useTransform(tilt.tiltX, (v) => v * (depth / 3));
  const vignetteY = useTransform(tilt.tiltY, (v) => v * (depth / 3));

  // Never leave a queued focus hop behind on unmount.
  React.useEffect(() => {
    return () => cancelAnimationFrame(focusRafRef.current);
  }, []);

  const queueFocus = (target: React.RefObject<HTMLButtonElement | null>) => {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      target.current?.focus();
    });
  };

  const stepThrough = () => {
    tilt.reset();
    setThrough(true);
    setAnnouncement("Stepped through");
    onStep?.(true);
    queueFocus(backRef);
  };

  const stepBack = () => {
    setThrough(false);
    setAnnouncement("Stepped back");
    onStep?.(false);
    queueFocus(frameRef);
  };

  // Enters glide; exits accelerate away. Reduced motion: fast crossfade both ways.
  const enterTransition = safe(springs.glide)(motionSafe);
  const exitTransition = motionSafe
    ? exitFor(durations.base)
    : { duration: durations.fast };

  return (
    <div
      data-state={through ? "through" : "framed"}
      className={cn("relative w-full", className)}
      style={{ height }}
    >
      <AnimatePresence initial={false}>
        {!through ? (
          <motion.button
            key="framed"
            ref={frameRef}
            type="button"
            aria-label={sceneLabel}
            aria-expanded={through}
            onClick={stepThrough}
            {...tilt.handlers}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? MAT_EXPAND : 1,
              transition: exitTransition,
            }}
            transition={enterTransition}
            style={
              active
                ? {
                    rotateX: tilt.rotateX,
                    rotateY: tilt.rotateY,
                    transformPerspective: perspectives.base,
                  }
                : undefined
            }
            className={cn(
              "absolute inset-0 block cursor-pointer rounded-4 border border-hairline bg-surface-1 p-5 shadow-[var(--shadow-raised)]",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {/* Registration ticks in the mat — the instrument plate detail. */}
            {(
              [
                "left-2 top-2 border-l border-t",
                "right-2 top-2 border-r border-t",
                "bottom-2 left-2 border-b border-l",
                "bottom-2 right-2 border-b border-r",
              ] as const
            ).map((corner) => (
              <span
                key={corner}
                aria-hidden
                className={cn(
                  "absolute block size-2 border-hairline-strong",
                  corner,
                )}
              />
            ))}

            {/* The aperture: a clipped window, never a 3D context. */}
            <span className="relative block h-full w-full overflow-hidden rounded-3 border border-hairline bg-surface-0">
              <motion.span
                className="absolute inset-0 block"
                initial={{ opacity: 0, scale: SCENE_SCALE }}
                animate={{ opacity: 1, scale: SCENE_SCALE }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? SCENE_ZOOM : SCENE_SCALE,
                  transition: exitTransition,
                }}
                transition={enterTransition}
                style={active ? { x: counterX, y: counterY } : undefined}
              >
                {scene}
              </motion.span>
              {/* Vignette rides WITH the pointer — the opposing layer that sells depth. */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-3 block"
                style={{
                  background:
                    "radial-gradient(115% 115% at 50% 50%, transparent 58%, oklch(0.05 0.02 258 / 0.55) 98%)",
                  ...(active ? { x: vignetteX, y: vignetteY } : undefined),
                }}
              />
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="through"
            initial={{ opacity: 0, scale: motionSafe ? BEYOND_FROM : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={enterTransition}
            className="absolute inset-0"
          >
            {beyond}
            <button
              ref={backRef}
              type="button"
              onClick={stepBack}
              className={cn(
                "absolute left-3 top-3 z-10 cursor-pointer rounded-2 border border-hairline-strong bg-surface-1/90 px-2.5 py-1.5 backdrop-blur-sm",
                "font-mono text-[10px] tracking-[0.15em] uppercase text-ink-2 hover:text-ink",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {backLabel}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
