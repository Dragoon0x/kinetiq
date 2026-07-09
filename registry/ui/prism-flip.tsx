"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  clamp,
  perspectives,
  snapAngle,
  wrapAngle,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** The prism carries exactly three long faces — one panel each. */
const FACE_COUNT = 3;
/** Detent pitch in degrees: a third of a full roll per panel. */
const STEP = 360 / FACE_COUNT;
/** Drag gearing in degrees per pixel — under 1:1 so the roll has heft. */
const DRAG_RESISTANCE = 0.8;
/** Pointer travel (px) before a press becomes a drag — protects taps. */
const DRAG_THRESHOLD = 4;
/** Release momentum is projected this many seconds ahead of the finger. */
const MOMENTUM_WINDOW = 0.25;
/** Angular velocity clamp at release, in deg/s — a believable throw. */
const MAX_SPIN = 1800;
/**
 * Reduced-motion commitment travel: the pixel drag that would roll half a
 * detent at DRAG_RESISTANCE (60° ÷ 0.8 = 75px) — the same tipping point at
 * which the 3D prism snaps forward instead of settling back.
 */
const FLAT_COMMIT_PX = STEP / 2 / DRAG_RESISTANCE;

/** Clamps an incoming index onto the three faces. */
const clampIndex = (i: number): number => clamp(i, 0, FACE_COUNT - 1);

/** The panel nearest the viewer for a given roll angle. */
const indexForRotation = (deg: number): number =>
  Math.round(wrapAngle(-deg) / STEP) % FACE_COUNT;

/** The detent for `idx` nearest `from`, so rolls take the short way around. */
const detentFor = (idx: number, from: number): number => {
  const base = -idx * STEP;
  return base + Math.round((from - base) / 360) * 360;
};

type DragState = {
  pointerId: number;
  /** Pointer y at press — measures the tap threshold. */
  startY: number;
  /** Last pointer y, for per-move deltas. */
  lastY: number;
  /** Last move timestamp (ms), for angular velocity. */
  lastT: number;
  /** Smoothed angular velocity, deg/s. */
  velocity: number;
  engaged: boolean;
};

export type PrismFlipProps = {
  /** Panel contents — the first three become the prism faces. */
  panels: React.ReactNode[];
  /** Screen-reader names for the panels, appended to the announcements. */
  labels?: string[];
  /** Controlled facing index; changing it rolls the prism to that detent. */
  index?: number;
  /** Initial facing index when uncontrolled. */
  defaultIndex?: number;
  /** Fires whenever the prism settles on a different panel. */
  onIndexChange?: (index: number) => void;
  /** Panel height in px; width fills the container. */
  height?: number;
  className?: string;
  /** Accessible name for the rotator. */
  "aria-label"?: string;
};

/**
 * A three-state switch with true geometry. The panels are the long faces of
 * a horizontal triangular prism (equilateral cross-section) that rolls
 * toward the viewer around its X axis — 120° per step, the next reading
 * arriving over the top like a flap clock. One rotation motion value is the
 * single source of truth: the container rolls to `-index · 120°` and every
 * face hangs off it at the apothem, so the whole instrument moves on one
 * animated value. Tap advances a detent on `snap`; a vertical drag rolls the
 * prism live at 0.8°/px, and release projects the throw ~250ms ahead and
 * settles on the nearest detent — a fling may carry one detent, never more.
 * Arrow keys step, Home returns to the first panel, and a polite announcer
 * names each facing panel.
 *
 * Browser-variance mitigations: `preserve-3d` lives on the prism only (never
 * with overflow or filters — Safari flattens); faces hide their backs with
 * `backface-visibility: hidden`; the apothem is integer-rounded so
 * `translateZ` never sits on a subpixel seam; the prism is the one promoted
 * layer. The wrapper supplies `perspectives.base` and pads itself from the
 * circumradius so mid-roll corners never clip.
 *
 * Reduced motion: a flat single panel with a `durations.fast` crossfade —
 * same taps, drags, keys, announcements, and index API.
 */
export function PrismFlip({
  panels,
  labels,
  index: controlledIndex,
  defaultIndex,
  onIndexChange,
  height = 128,
  className,
  "aria-label": ariaLabel = "Prism rotator",
}: PrismFlipProps) {
  const motionSafe = useMotionSafe();

  const faces = panels.slice(0, FACE_COUNT);
  const isControlled = controlledIndex !== undefined;

  const perspective = perspectives.base;
  // Equilateral cross-section: apothem = height / (2·tan(π/3)) — how far
  // each face center sits off the roll axis. Rounded to a whole pixel so
  // translateZ never lands on a subpixel seam.
  const apothem = Math.round(height / (2 * Math.tan(Math.PI / 3)));
  // A prism edge swings out to the circumradius (2× the apothem for an
  // equilateral triangle) mid-roll.
  const circumradius = 2 * apothem;
  // Under perspective P, an edge tipped toward the viewer projects to
  // R·P/√(P² − R²) of half-height. Pad the wrapper by the overshoot past
  // the resting face so mid-roll corners never clip (the max() guard keeps
  // the root real for degenerate heights approaching P).
  const reach =
    (circumradius * perspective) /
    Math.sqrt(Math.max(perspective ** 2 - circumradius ** 2, 1));
  const padY = Math.max(0, Math.ceil(reach - height / 2));

  const [initialIndex] = React.useState(() =>
    clampIndex(controlledIndex ?? defaultIndex ?? 0),
  );

  /** The one source of truth for the visuals: roll angle in degrees. */
  const rotation = useMotionValue(-initialIndex * STEP);
  /** Facing panel, live off the rotation — drives aria and the announcer. */
  const [frontIndex, setFrontIndex] = React.useState(initialIndex);
  /** Settled index for the uncontrolled flat path; ignored when controlled. */
  const [uncontrolledIndex, setUncontrolledIndex] =
    React.useState(initialIndex);
  const [grabbing, setGrabbing] = React.useState(false);

  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The detent the prism last settled on or is rolling toward, in degrees. */
  const targetRef = React.useRef(-initialIndex * STEP);
  /** Latest settled panel — gesture math without re-binding handlers. */
  const indexRef = React.useRef(initialIndex);
  const frontIndexRef = React.useRef(initialIndex);
  const dragRef = React.useRef<DragState | null>(null);
  const onIndexChangeRef = React.useRef(onIndexChange);
  React.useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  // Facing panel tracks the nearest detent of the live roll, deduped.
  useMotionValueEvent(rotation, "change", (deg) => {
    const next = indexForRotation(deg);
    if (next === frontIndexRef.current) return;
    frontIndexRef.current = next;
    setFrontIndex(next);
  });

  /**
   * Commit a settled panel: emit it (deduped) and, when uncontrolled, keep
   * our own state current. Controlled callers reflect it back via the prop.
   */
  const commitIndex = React.useCallback(
    (next: number) => {
      if (next !== indexRef.current) {
        indexRef.current = next;
        onIndexChangeRef.current?.(next);
      }
      if (!isControlled) setUncontrolledIndex(next);
    },
    [isControlled],
  );

  /** Roll to a detent on `snap`, carrying any release velocity into it. */
  const settleTo = React.useCallback(
    (detent: number, velocity = 0) => {
      targetRef.current = detent;
      commitIndex(indexForRotation(detent));
      controlsRef.current?.stop();
      controlsRef.current = animate(rotation, detent, {
        ...springs.snap,
        velocity,
      });
    },
    [commitIndex, rotation],
  );

  /** Advance (+1) or retreat (−1) one detent from the pending target. */
  const stepBy = React.useCallback(
    (delta: number) => {
      settleTo(targetRef.current - delta * STEP);
    },
    [settleTo],
  );

  const goToIndex = React.useCallback(
    (idx: number) => {
      settleTo(detentFor(clampIndex(idx), targetRef.current));
    },
    [settleTo],
  );

  /** Flat-path step with wraparound — the prism has no ends. */
  const flatStep = React.useCallback(
    (delta: number) => {
      commitIndex(
        (((indexRef.current + delta) % FACE_COUNT) + FACE_COUNT) % FACE_COUNT,
      );
    },
    [commitIndex],
  );

  // Re-seat the roll when the 3D path (re)mounts — the flat path may have
  // moved the index while this pathway was unmounted.
  React.useEffect(() => {
    if (!motionSafe) return;
    controlsRef.current?.stop();
    const detent = detentFor(indexRef.current, targetRef.current);
    targetRef.current = detent;
    rotation.jump(detent);
  }, [motionSafe, rotation]);

  // Controlled index rolls the prism directly (motion-value ops, never
  // setState here). The parent owns the value, so sync bookkeeping without
  // echoing it back through onIndexChange.
  React.useEffect(() => {
    if (controlledIndex === undefined) return;
    const target = clampIndex(controlledIndex);
    indexRef.current = target;
    if (!motionSafe) return;
    if (indexForRotation(targetRef.current) === target) return;
    const detent = detentFor(target, targetRef.current);
    targetRef.current = detent;
    controlsRef.current?.stop();
    controlsRef.current = animate(rotation, detent, springs.snap);
  }, [controlledIndex, motionSafe, rotation]);

  // A roll in flight must not outlive the component.
  React.useEffect(
    () => () => {
      controlsRef.current?.stop();
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    controlsRef.current?.stop();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.engaged = true;
      setGrabbing(true);
    }
    // Dragging down rolls the front face down (negative rotateX) — direct
    // manipulation: the surface under the finger follows it.
    const dDeg = -(event.clientY - drag.lastY) * DRAG_RESISTANCE;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = dDeg / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    rotation.set(rotation.get() + dDeg);
  };

  const finishRoll = (
    event: React.PointerEvent<HTMLDivElement>,
    allowTap: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) {
      // A tap anywhere advances the roll; cancelled presses do nothing.
      if (allowTap) stepBy(1);
      return;
    }
    setGrabbing(false);
    const nearest = snapAngle(rotation.get(), STEP);
    if (!allowTap) {
      // Cancelled mid-drag: settle to the nearest detent, no throw.
      settleTo(nearest);
      return;
    }
    const spin = clamp(drag.velocity, -MAX_SPIN, MAX_SPIN);
    const thrown = snapAngle(rotation.get() + spin * MOMENTUM_WINDOW, STEP);
    // The throw may carry the roll one detent past the nearest, never more.
    settleTo(clamp(thrown, nearest - STEP, nearest + STEP), spin);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        stepBy(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        stepBy(-1);
        break;
      case "Home":
        goToIndex(0);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleFlatKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        flatStep(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        flatStep(-1);
        break;
      case "Home":
        commitIndex(0);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleFlatPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const finishFlat = (
    event: React.PointerEvent<HTMLDivElement>,
    allowStep: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!allowStep) return;
    const travel = event.clientY - drag.startY;
    if (Math.abs(travel) < DRAG_THRESHOLD) {
      flatStep(1); // a tap
      return;
    }
    // Same commitment point as the 3D snap: half a detent of travel.
    if (Math.abs(travel) >= FLAT_COMMIT_PX) flatStep(travel > 0 ? 1 : -1);
  };

  const settledIndex =
    controlledIndex !== undefined
      ? clampIndex(controlledIndex)
      : uncontrolledIndex;
  const facingIndex = motionSafe ? frontIndex : settledIndex;
  const facingLabel = labels?.[facingIndex];
  const announcement = `Panel ${facingIndex + 1} of ${FACE_COUNT}${
    facingLabel ? `: ${facingLabel}` : ""
  }`;

  const status = (
    <span aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  // Reduced motion: a flat single panel, instant swap with a fast crossfade —
  // same interactions and announcements, no geometry. The wrapper keeps the
  // same circumradius padding so switching pathways never shifts layout.
  if (!motionSafe) {
    return (
      <div
        role="group"
        tabIndex={0}
        aria-roledescription="prism rotator"
        aria-label={ariaLabel}
        onKeyDown={handleFlatKeyDown}
        onPointerDown={handleFlatPointerDown}
        onPointerUp={(event) => finishFlat(event, true)}
        onPointerCancel={(event) => finishFlat(event, false)}
        className={cn(
          "relative w-full cursor-pointer touch-pan-x rounded-3 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
          className,
        )}
        style={{ paddingBlock: padY }}
      >
        <div className="relative w-full" style={{ height }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={settledIndex}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: durations.fast, ease: easings.enter },
              }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
            >
              <FaceChrome>{faces[settledIndex]}</FaceChrome>
            </motion.div>
          </AnimatePresence>
        </div>
        {status}
      </div>
    );
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-roledescription="prism rotator"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishRoll(event, true)}
      onPointerCancel={(event) => finishRoll(event, false)}
      className={cn(
        "relative w-full touch-pan-x rounded-3 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60",
        grabbing ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{ perspective, paddingBlock: padY }}
    >
      {/* The prism: one roll motion value, the only promoted layer. Panels
          carry no interactive content, so the wrapper keeps every pointer. */}
      <motion.div
        className="pointer-events-none relative w-full"
        style={{
          height,
          rotateX: rotation,
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {faces.map((panel, i) => (
          // Face i hangs +120° up the roll at the apothem. The container
          // rolls to -index·120°, so the composed angle cancels and
          // panels[index] faces the viewer — the same three orientations as
          // rotateX(i · -120°) mod 360, assigned so index and panel agree.
          <div
            key={i}
            aria-hidden={i === frontIndex ? undefined : true}
            inert={i === frontIndex ? undefined : true}
            className="absolute inset-0"
            style={{
              transform: `rotateX(${i * STEP}deg) translateZ(${apothem}px)`,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            <FaceChrome>{panel}</FaceChrome>
          </div>
        ))}
      </motion.div>
      {status}
    </div>
  );
}

/**
 * The face plate. Clipping and rounding live here — one level below the 3D
 * transform — so no preserve-3d ancestor ever carries overflow, and a static
 * edge shade darkens the long edges so the roll reads as a solid wedge.
 */
function FaceChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3 border border-hairline bg-surface-2">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.1 0.02 258 / 0.25) 0%, transparent 24%, transparent 76%, oklch(0.1 0.02 258 / 0.32) 100%)",
        }}
      />
    </div>
  );
}
