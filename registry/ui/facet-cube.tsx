"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import {
  clamp,
  perspectives,
  snapAngle,
  wrapAngle,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Drag resistance: degrees of rotation per pixel of pointer travel. */
const RESIST = 0.55;
/** Faces live 90° apart — the cube's detent step. */
const DETENT = 90;
/** Pitch fence: top/bottom stay reachable, the cube never rolls past vertical. */
const PITCH_MIN = -90;
const PITCH_MAX = 90;
/** Release velocity (deg/s) past this carries the snap one extra detent. */
const FLING_MIN = 220;
/** A release this long after the last move (ms) reads as a hold, not a fling. */
const STALE_VELOCITY_MS = 90;
/** Reduced-motion swipe travel (px) that swaps one face. */
const SWIPE_MIN = 24;
/**
 * Clearance around the cube per side, as a fraction of its edge. Mid-turn a
 * cube's projected extent grows to ≈1.76× its edge (√2 diagonal × perspective
 * foreshortening at `perspectives.base`), so the wrapper pads itself instead
 * of clipping — overflow must never touch the 3D chassis.
 */
const CLEARANCE = 0.38;

type FaceDef = {
  /** Geometric name — keys the plate and documents the mapping. */
  name: string;
  /** Parking rotation; `translateZ(half edge)` is appended at render. */
  transform: string;
  /** Static machined-light gradient: lit from above, undersides in shadow. */
  shade: string;
};

/**
 * Plate order is the announcement order. Detents map deterministically:
 * (yaw 0, pitch 0) = 0 front · (90, 0) = 1 left · (180, 0) = 2 back ·
 * (270, 0) = 3 right · (any, −90) = 4 top · (any, +90) = 5 bottom.
 */
const FACES: readonly FaceDef[] = [
  {
    name: "front",
    transform: "rotateY(0deg)",
    shade:
      "linear-gradient(160deg, oklch(1 0 0 / 0.07) 0%, transparent 45%, oklch(0 0 0 / 0.08) 100%)",
  },
  {
    name: "left",
    transform: "rotateY(-90deg)",
    shade:
      "linear-gradient(120deg, oklch(0 0 0 / 0.15) 0%, transparent 55%, oklch(1 0 0 / 0.04) 100%)",
  },
  {
    name: "back",
    transform: "rotateY(180deg)",
    shade:
      "linear-gradient(160deg, oklch(0 0 0 / 0.06) 0%, oklch(0 0 0 / 0.14) 100%)",
  },
  {
    name: "right",
    transform: "rotateY(90deg)",
    shade:
      "linear-gradient(240deg, oklch(0 0 0 / 0.15) 0%, transparent 55%, oklch(1 0 0 / 0.04) 100%)",
  },
  {
    name: "top",
    transform: "rotateX(90deg)",
    shade: "linear-gradient(180deg, oklch(1 0 0 / 0.1) 0%, transparent 60%)",
  },
  {
    name: "bottom",
    transform: "rotateX(-90deg)",
    shade: "linear-gradient(0deg, oklch(0 0 0 / 0.18) 0%, transparent 60%)",
  },
];

const FALLBACK_FACE: FaceDef = {
  name: "front",
  transform: "rotateY(0deg)",
  shade:
    "linear-gradient(160deg, oklch(1 0 0 / 0.07) 0%, transparent 45%, oklch(0 0 0 / 0.08) 100%)",
};

/** The detent orientation that brings `face` around to the viewer. */
const orientationFor = (face: number): { yaw: number; pitch: number } => {
  switch (face) {
    case 1:
      return { yaw: 90, pitch: 0 };
    case 2:
      return { yaw: 180, pitch: 0 };
    case 3:
      return { yaw: -90, pitch: 0 };
    case 4:
      return { yaw: 0, pitch: -90 };
    case 5:
      return { yaw: 0, pitch: 90 };
    default:
      return { yaw: 0, pitch: 0 };
  }
};

/** Which face a settled (detent) orientation presents to the viewer. */
const facingFace = (yawDeg: number, pitchDeg: number): number => {
  if (pitchDeg <= PITCH_MIN) return 4;
  if (pitchDeg >= PITCH_MAX) return 5;
  const y = wrapAngle(yawDeg);
  if (y === 90) return 1;
  if (y === 180) return 2;
  if (y === 270) return 3;
  return 0;
};

const clampFaceIndex = (face: number | undefined): number =>
  Math.min(5, Math.max(0, Math.trunc(face ?? 0)));

type DragState = {
  pointerId: number;
  /** Press origin — the reduced-motion path measures its swipe from here. */
  startX: number;
  startY: number;
  /** Last pointer sample, for per-move deltas and velocity. */
  lastX: number;
  lastY: number;
  lastT: number;
  /** Smoothed release velocities, deg/s. */
  vYaw: number;
  vPitch: number;
};

export type FacetCubeProps = {
  /**
   * Face content in plate order front/left/back/right/top/bottom. Up to six
   * are used; missing entries render as empty machined plates.
   */
  faces: React.ReactNode[];
  /** Screen-reader names per face, same order as `faces`. */
  labels?: string[];
  /**
   * Cube edge, px. The wrapper adds ~38% clearance per side so mid-turn
   * corners never need clipping.
   */
  size?: number;
  /** Face presented first (0–5). */
  defaultFace?: number;
  /** Fires only when the settled facing face actually changes. */
  onFaceChange?: (index: number) => void;
  className?: string;
  /** Accessible name for the cube group. */
  "aria-label"?: string;
};

/**
 * A six-face content cube on a real CSS 3D chassis. Each face is a machined
 * plate parked ±90/180° around the center and pushed out by half an edge
 * (`backface-visibility: hidden`); the cube is one `preserve-3d` element
 * driven by two motion values (yaw/pitch), and the padded wrapper supplies
 * the house perspective — no overflow or filter ever touches the 3D element
 * (Safari flattens).
 *
 * Drag (pointer-captured) rotates 1:1 with light resistance (0.55°/px,
 * pitch fenced to ±90°); release snaps both axes to the nearest 90° detent
 * on `snap`, and a fast fling carries one extra detent. Arrow keys step the
 * detents — Left/Right yaw ±90°, Up/Down pitch ∓90° — and Home returns to
 * face 0. A polite live region announces "Face N of 6" (plus its label) as
 * the cube settles somewhere new; only the facing face stays in the a11y
 * tree, the rest are aria-hidden and inert to the pointer.
 *
 * Reduced motion: no 3D at all — the active face renders flat, and every
 * gesture or key swaps it instantly under a fast opacity fade with the same
 * announcements and callback.
 */
export function FacetCube({
  faces,
  labels,
  size = 220,
  defaultFace,
  onFaceChange,
  className,
  "aria-label": ariaLabel = "Content cube",
}: FacetCubeProps) {
  const motionSafe = useMotionSafe();

  const [initialFace] = React.useState(() => clampFaceIndex(defaultFace));
  const initialOrient = orientationFor(initialFace);

  /** The two sources of truth for the chassis, in degrees. */
  const yaw = useMotionValue(initialOrient.yaw);
  const pitch = useMotionValue(initialOrient.pitch);

  const [settledFace, setSettledFace] = React.useState(initialFace);
  const [grabbing, setGrabbing] = React.useState(false);

  /** Last settled detent orientation — keyboard steps accumulate from here. */
  const orientRef = React.useRef({ ...initialOrient });
  /** Last announced face, deduping onFaceChange + the live region. */
  const faceRef = React.useRef(initialFace);
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const onFaceChangeRef = React.useRef(onFaceChange);
  React.useEffect(() => {
    onFaceChangeRef.current = onFaceChange;
  });

  const stopAnimations = React.useCallback(() => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  }, []);

  // A settle in flight must not outlive the component.
  React.useEffect(() => stopAnimations, [stopAnimations]);

  // Re-seat the chassis when the motion pathway switches — the other path
  // may have moved the settled orientation while this one was unmounted.
  React.useEffect(() => {
    stopAnimations();
    yaw.jump(orientRef.current.yaw);
    pitch.jump(orientRef.current.pitch);
  }, [motionSafe, yaw, pitch, stopAnimations]);

  const commitFace = React.useCallback((next: number) => {
    if (next === faceRef.current) return;
    faceRef.current = next;
    setSettledFace(next);
    onFaceChangeRef.current?.(next);
  }, []);

  /** Snap both axes to detents (springs on the rich path, jumps under RM). */
  const settleTo = React.useCallback(
    (targetYaw: number, targetPitch: number, vYaw = 0, vPitch = 0) => {
      const snappedYaw = snapAngle(targetYaw, DETENT);
      const snappedPitch = clamp(
        snapAngle(targetPitch, DETENT),
        PITCH_MIN,
        PITCH_MAX,
      );
      orientRef.current = { yaw: snappedYaw, pitch: snappedPitch };
      commitFace(facingFace(snappedYaw, snappedPitch));
      stopAnimations();
      if (motionSafe) {
        controlsRef.current = [
          animate(yaw, snappedYaw, { ...springs.snap, velocity: vYaw }),
          animate(pitch, snappedPitch, { ...springs.snap, velocity: vPitch }),
        ];
      } else {
        yaw.jump(snappedYaw);
        pitch.jump(snappedPitch);
      }
    },
    [commitFace, motionSafe, pitch, stopAnimations, yaw],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimations();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastT: event.timeStamp,
      vYaw: 0,
      vPitch: 0,
    };
    setGrabbing(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId || !motionSafe) return;

    // Trackball feel: drag right brings the left face around (yaw grows),
    // drag down rolls the top face into view (pitch shrinks).
    const dYaw = (event.clientX - drag.lastX) * RESIST;
    const dPitch = -(event.clientY - drag.lastY) * RESIST;
    yaw.set(yaw.get() + dYaw);
    pitch.set(clamp(pitch.get() + dPitch, PITCH_MIN, PITCH_MAX));

    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous velocity so the fling reads intent.
      drag.vYaw = drag.vYaw * 0.4 + (dYaw / dt) * 0.6;
      drag.vPitch = drag.vPitch * 0.4 + (dPitch / dt) * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setGrabbing(false);

    if (!motionSafe) {
      // Reduced motion: a decisive swipe swaps one face along its axis.
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      const { yaw: y0, pitch: p0 } = orientRef.current;
      if (Math.abs(dx) >= Math.abs(dy)) {
        settleTo(y0 + Math.sign(dx) * DETENT, p0);
      } else {
        settleTo(y0, p0 - Math.sign(dy) * DETENT);
      }
      return;
    }

    // A pause before release spends the fling; the cube just settles nearest.
    const stale = event.timeStamp - drag.lastT > STALE_VELOCITY_MS;
    const vYaw = stale ? 0 : drag.vYaw;
    const vPitch = stale ? 0 : drag.vPitch;
    const carryYaw = Math.abs(vYaw) >= FLING_MIN ? Math.sign(vYaw) * DETENT : 0;
    const carryPitch =
      Math.abs(vPitch) >= FLING_MIN ? Math.sign(vPitch) * DETENT : 0;
    settleTo(yaw.get() + carryYaw, pitch.get() + carryPitch, vYaw, vPitch);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setGrabbing(false);
    if (!motionSafe) return; // A cancelled press never swaps a face.
    settleTo(yaw.get(), pitch.get());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const { yaw: y0, pitch: p0 } = orientRef.current;
    switch (event.key) {
      case "ArrowLeft":
        settleTo(y0 + DETENT, p0);
        break;
      case "ArrowRight":
        settleTo(y0 - DETENT, p0);
        break;
      case "ArrowUp":
        settleTo(y0, p0 - DETENT);
        break;
      case "ArrowDown":
        settleTo(y0, p0 + DETENT);
        break;
      case "Home":
        // Face 0 by the shortest route: the nearest full turn, level pitch.
        settleTo(snapAngle(y0, 360), 0);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const half = Math.round(size / 2);
  const box = size + Math.round(size * CLEARANCE) * 2;
  const activeDef = FACES[settledFace] ?? FALLBACK_FACE;
  const activeLabel = labels?.[settledFace];

  return (
    <div
      role="group"
      tabIndex={0}
      aria-roledescription="rotatable cube"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={cn(
        "relative flex touch-none items-center justify-center rounded-3 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60",
        grabbing ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{
        width: box,
        height: box,
        perspective: motionSafe ? perspectives.base : undefined,
      }}
    >
      {motionSafe ? (
        // The chassis: one preserve-3d element, the only promoted layer.
        // No overflow or filter here — Safari would flatten the cube.
        <motion.div
          className="relative"
          style={{
            width: size,
            height: size,
            rotateX: pitch,
            rotateY: yaw,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {FACES.map((face, i) => {
            const facing = settledFace === i;
            return (
              <div
                key={face.name}
                aria-hidden={facing ? undefined : true}
                className={cn(
                  "absolute inset-0 overflow-hidden rounded-3 border border-hairline bg-surface-2",
                  !facing && "pointer-events-none",
                )}
                style={{
                  transform: `${face.transform} translateZ(${half}px)`,
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: face.shade }}
                />
                <div className="relative h-full w-full">
                  {faces[i] ?? null}
                </div>
              </div>
            );
          })}
        </motion.div>
      ) : (
        // Reduced motion: the active face as a flat plate; a remount fades
        // the incoming plate in over durations.fast — no 3D anywhere.
        <motion.div
          key={settledFace}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.fast }}
          className="relative overflow-hidden rounded-3 border border-hairline bg-surface-2"
          style={{ width: size, height: size }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: activeDef.shade }}
          />
          <div className="relative h-full w-full">
            {faces[settledFace] ?? null}
          </div>
        </motion.div>
      )}

      <span aria-live="polite" className="sr-only">
        {`Face ${settledFace + 1} of 6${activeLabel ? `: ${activeLabel}` : ""}`}
      </span>
    </div>
  );
}
