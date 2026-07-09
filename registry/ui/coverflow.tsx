"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Horizontal step between adjacent covers, in px. */
const SPREAD = 120;
/** How far each rank recedes into the stage per step, in px (integer translateZ). */
const DEPTH = 180;
/** Bank angle of a flanking cover, in degrees — left faces right, right faces left. */
const ANGLE = 48;
/** Covers past this many ranks from center stack tightly instead of fanning further. */
const FAN_LIMIT = 3;
/** Dimming floor: the most-recessed visible cover keeps this much opacity. */
const MIN_OPACITY = 0.28;
/** Scale floor applied at full angular distance. */
const MIN_SCALE = 0.82;
/** Pointer travel (px) that advances the flow by one cover while dragging. */
const DRAG_STEP = 90;
/** Pointer travel (px) before a press becomes a drag — protects cover clicks. */
const DRAG_THRESHOLD = 4;
/** Release velocity (index/s) is clamped to a believable throw. */
const MAX_FLING = 6;
/** Projection horizon: where the throw would coast, before snapping. */
const PROJECTION = 0.14;
/** Wheel input is rate-limited to one step per this many ms. */
const WHEEL_LOCK_MS = 140;

type DragState = {
  pointerId: number;
  /** Pointer x where the press began — measures the tap threshold. */
  startX: number;
  /** activeIndex value when the press began. */
  startIndex: number;
  /** Last pointer x, for per-move deltas. */
  lastX: number;
  /** Last move timestamp (ms), for pointer velocity. */
  lastT: number;
  /** Smoothed velocity in index/s; positive drags flow toward earlier covers. */
  velocity: number;
  engaged: boolean;
};

export type CoverflowProps = {
  /** Covers — each direct child is one card in the flow. */
  children: React.ReactNode;
  /** Controlled active index; changing it flows to that cover. */
  index?: number;
  /** Initial active index when uncontrolled. */
  defaultIndex?: number;
  /** Fires whenever the flow settles on a different cover. */
  onIndexChange?: (index: number) => void;
  className?: string;
  /** Accessible name for the flow region. */
  "aria-label"?: string;
};

/**
 * A 3D cover-flow gallery. The active cover faces you dead-center; flanking
 * covers bank away in perspective (rotateY), recede in Z, and dim with angular
 * distance. One `activeIndex` motion value is the single source of truth —
 * every cover derives its transform from it via `useTransform`, so the whole
 * flow moves on one animated value (buttery, one promoted layer). Drag scrubs
 * the index (~90px per cover, projected to the nearest on release); wheel and
 * arrow keys step; Home/End jump to the ends; clicking a flanking cover brings
 * it forward. Transitions ride `snap` for a single step, `glide` for a fling.
 *
 * Browser-variance mitigations mirror the drum idioms: `preserve-3d` on the
 * stage, `backface-visibility: hidden` per cover, integer `translateZ` so
 * depth never lands on a subpixel seam, and a single `will-change: transform`
 * layer (the stage) while covers stay cheap.
 *
 * Reduced motion: no perspective at all — a flat scroll-snap row with the
 * active cover centered, the same arrows, keyboard, announcements, and index
 * API.
 */
export function Coverflow({
  children,
  index: controlledIndex,
  defaultIndex,
  onIndexChange,
  className,
  "aria-label": ariaLabel = "Coverflow",
}: CoverflowProps) {
  const motionSafe = useMotionSafe();

  const covers = React.Children.toArray(children);
  const count = covers.length;
  const lastIndex = Math.max(0, count - 1);
  const isControlled = controlledIndex !== undefined;

  const clampIndex = React.useCallback(
    (i: number) => Math.min(Math.max(i, 0), lastIndex),
    [lastIndex],
  );

  const [initialIndex] = React.useState(() =>
    Math.min(Math.max(controlledIndex ?? defaultIndex ?? 0, 0), lastIndex),
  );

  /** The one source of truth for the visuals: fractional active index. */
  const activeIndex = useMotionValue(initialIndex);
  /** Local index for the uncontrolled case; ignored when controlled. */
  const [uncontrolledIndex, setUncontrolledIndex] =
    React.useState(initialIndex);
  // Settled index derived in render (never mirrored via setState) — the repo's
  // controlled/uncontrolled convention. Drives arrows, dots, and the announce.
  const settledIndex = isControlled
    ? clampIndex(controlledIndex)
    : uncontrolledIndex;

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const wheelAtRef = React.useRef(0);
  const scrollRafRef = React.useRef(0);
  const [grabbing, setGrabbing] = React.useState(false);

  // Latest settled index for gesture math without re-binding handlers each
  // render — synced in an effect (never read during render) so handlers and
  // commitIndex's dedupe both see the current value.
  const settledRef = React.useRef(initialIndex);
  React.useEffect(() => {
    settledRef.current = settledIndex;
  });

  const onIndexChangeRef = React.useRef(onIndexChange);
  React.useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  const stopAnimation = React.useCallback(() => {
    controls.current?.stop();
    controls.current = null;
  }, []);

  /**
   * Commit a settled index: announce it (deduped) and, when uncontrolled,
   * advance our own state. Controlled callers reflect it back via the prop.
   */
  const commitIndex = React.useCallback(
    (next: number) => {
      const clamped = clampIndex(next);
      if (clamped !== settledRef.current) {
        settledRef.current = clamped;
        onIndexChangeRef.current?.(clamped);
      }
      if (!isControlled) setUncontrolledIndex(clamped);
    },
    [clampIndex, isControlled],
  );

  /** `snap` for a single-cover move, `glide` for anything farther. */
  const settleTo = React.useCallback(
    (target: number, velocity = 0) => {
      const clamped = clampIndex(target);
      stopAnimation();
      const transition =
        Math.abs(clamped - activeIndex.get()) <= 1
          ? springs.snap
          : springs.glide;
      commitIndex(clamped);
      controls.current = animate(activeIndex, clamped, {
        ...transition,
        velocity,
      });
    },
    [activeIndex, clampIndex, commitIndex, stopAnimation],
  );

  const scrollRowTo = React.useCallback(
    (target: number, behavior: ScrollBehavior) => {
      const clamped = clampIndex(target);
      const row = rowRef.current;
      if (!row) return;
      const child = row.children.item(clamped);
      if (!(child instanceof HTMLElement)) return;
      row.scrollTo({
        left: child.offsetLeft - (row.clientWidth - child.offsetWidth) / 2,
        behavior,
      });
    },
    [clampIndex],
  );

  // Position the flat row under the settled index on mount / path switch.
  React.useEffect(() => {
    if (motionSafe) return;
    scrollRowTo(settledRef.current, "auto");
  }, [motionSafe, scrollRowTo]);

  // Re-seat the 3D value when that path (re)mounts — the row may have moved it.
  React.useEffect(() => {
    if (!motionSafe) return;
    stopAnimation();
    activeIndex.jump(settledRef.current);
  }, [motionSafe, activeIndex, stopAnimation]);

  // Controlled index drives the flow directly (motion-value ops, never
  // setState here). The parent already owns this value, so we animate to it
  // without re-announcing through commitIndex — that would echo the prop back.
  React.useEffect(() => {
    if (controlledIndex === undefined || count === 0) return;
    const target = clampIndex(controlledIndex);
    if (motionSafe) {
      if (Math.round(activeIndex.get()) === target) return;
      stopAnimation();
      const transition =
        Math.abs(target - activeIndex.get()) <= 1
          ? springs.snap
          : springs.glide;
      controls.current = animate(activeIndex, target, transition);
    } else {
      scrollRowTo(target, "smooth");
    }
  }, [
    controlledIndex,
    count,
    motionSafe,
    clampIndex,
    activeIndex,
    stopAnimation,
    scrollRowTo,
  ]);

  // Wheel steps one cover; native non-passive listener so the page holds still.
  React.useEffect(() => {
    if (!motionSafe) return;
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (delta === 0 || dragRef.current?.engaged) return;
      event.preventDefault();
      if (event.timeStamp - wheelAtRef.current < WHEEL_LOCK_MS) return;
      wheelAtRef.current = event.timeStamp;
      settleTo(settledRef.current + (delta > 0 ? 1 : -1));
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [motionSafe, settleTo]);

  // A gesture or animation in flight must not outlive the component.
  React.useEffect(
    () => () => {
      controls.current?.stop();
      cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  // Pause any settle while the tab is hidden — rAF is throttled there anyway.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopAnimation();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopAnimation]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startIndex: activeIndex.get(),
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const totalDx = event.clientX - drag.startX;
    if (!drag.engaged) {
      if (Math.abs(totalDx) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // covers/controls still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }

    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous velocity so the fling reads intent.
      const instant = -(event.clientX - drag.lastX) / DRAG_STEP / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;

    // Drag left → flow advances (index grows). Clamp to a soft ±0.5 overscroll.
    const raw = drag.startIndex - totalDx / DRAG_STEP;
    activeIndex.set(Math.min(lastIndex + 0.5, Math.max(-0.5, raw)));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its target.

    setGrabbing(false);
    const release = Math.max(-MAX_FLING, Math.min(MAX_FLING, drag.velocity));
    // Project where the throw would coast, then snap to the nearest cover.
    const projected = activeIndex.get() + release * PROJECTION;
    settleTo(Math.round(projected), release);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowRight":
        settleTo(settledRef.current + 1);
        break;
      case "ArrowLeft":
        settleTo(settledRef.current - 1);
        break;
      case "Home":
        settleTo(0);
        break;
      case "End":
        settleTo(lastIndex);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowRight":
        scrollRowTo(settledRef.current + 1, "smooth");
        break;
      case "ArrowLeft":
        scrollRowTo(settledRef.current - 1, "smooth");
        break;
      case "Home":
        scrollRowTo(0, "smooth");
        break;
      case "End":
        scrollRowTo(lastIndex, "smooth");
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Flat-row index tracking, coalesced to one read per frame; only setState
  // advances index here (never during render).
  const handleRowScroll = () => {
    if (scrollRafRef.current !== 0) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const row = rowRef.current;
      if (!row) return;
      const mid = row.scrollLeft + row.clientWidth / 2;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < row.children.length; i += 1) {
        const child = row.children.item(i);
        if (!(child instanceof HTMLElement)) continue;
        const distance = Math.abs(
          child.offsetLeft + child.offsetWidth / 2 - mid,
        );
        if (distance < best) {
          best = distance;
          nearest = i;
        }
      }
      commitIndex(nearest);
    });
  };

  /** A control (arrow / cover click) selects a cover on either path. */
  const selectIndex = React.useCallback(
    (target: number) => {
      if (count === 0) return;
      if (motionSafe) settleTo(target);
      else scrollRowTo(target, "smooth");
    },
    [count, motionSafe, settleTo, scrollRowTo],
  );

  const status = (
    <span aria-live="polite" className="sr-only">
      {count > 0 ? `Item ${settledIndex + 1} of ${count}` : null}
    </span>
  );

  const arrow = (delta: -1 | 1) => (
    <button
      type="button"
      aria-label={delta === 1 ? "Next item" : "Previous item"}
      disabled={delta === 1 ? settledIndex >= lastIndex : settledIndex <= 0}
      // The stage grabs on pointerdown; keep control presses out of that path.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => selectIndex(settledIndex + delta)}
      className={cn(
        "absolute top-1/2 z-30 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-2 border border-border bg-surface-2 text-ink-2 backdrop-blur-sm transition-colors",
        "outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:pointer-events-none disabled:opacity-40",
        delta === 1 ? "right-2" : "left-2",
      )}
    >
      {delta === 1 ? (
        <ChevronRight className="size-4" aria-hidden />
      ) : (
        <ChevronLeft className="size-4" aria-hidden />
      )}
    </button>
  );

  // Reduced motion: a flat scroll-snap row — same semantics, no 3D.
  if (!motionSafe) {
    return (
      <section
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        className={cn("relative w-full", className)}
      >
        {arrow(-1)}
        <div
          ref={rowRef}
          role="group"
          tabIndex={0}
          aria-label={`${ariaLabel}, use arrow keys`}
          onScroll={handleRowScroll}
          onKeyDown={handleRowKeyDown}
          className="flex w-full snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain rounded-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          style={{ scrollPaddingInline: "50%" }}
        >
          {covers.map((cover, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`Item ${i + 1} of ${count}`}
              className="shrink-0 snap-center px-2 first:pl-[50%] last:pr-[50%]"
            >
              {cover}
            </div>
          ))}
        </div>
        {arrow(1)}
        {status}
      </section>
    );
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      className={cn("relative w-full", className)}
    >
      {arrow(-1)}
      <div
        ref={stageRef}
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel}, use arrow keys`}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative flex h-full w-full touch-pan-y items-center justify-center overflow-hidden rounded-3 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ perspective: 1100 }}
      >
        {/* The flow: one preserve-3d plane, the only promoted layer. */}
        <div
          className="relative h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {covers.map((cover, i) => (
            <Cover
              key={i}
              activeIndex={activeIndex}
              position={i}
              index={i}
              total={count}
              onSelect={selectIndex}
            >
              {cover}
            </Cover>
          ))}
        </div>
      </div>
      {arrow(1)}
      {status}
    </section>
  );
}

type CoverProps = {
  activeIndex: MotionValue<number>;
  /** This cover's fixed slot in the flow. */
  position: number;
  index: number;
  total: number;
  onSelect: (index: number) => void;
  children: React.ReactNode;
};

/**
 * One card in the flow. Every visual derives from the shared `activeIndex`:
 * offset = position − active drives translateX, integer translateZ, a clamped
 * rotateY bank, plus opacity/scale dimming by angular distance. The card is a
 * button so clicking a flanking cover selects it and the a11y tree stays
 * operable; the active card exposes itself as the current slide.
 */
function Cover({
  activeIndex,
  position,
  index,
  total,
  onSelect,
  children,
}: CoverProps) {
  const offset = useTransform(activeIndex, (active) => position - active);

  const x = useTransform(offset, (o) => o * SPREAD);
  // Integer translateZ: depth never lands on a subpixel seam.
  const z = useTransform(offset, (o) => -Math.round(Math.abs(o) * DEPTH));
  const rotateY = useTransform(
    offset,
    (o) => Math.max(-1, Math.min(1, -o)) * ANGLE,
  );
  const opacity = useTransform(offset, (o) => {
    const t = Math.min(Math.abs(o) / FAN_LIMIT, 1);
    return 1 - (1 - MIN_OPACITY) * t;
  });
  const scale = useTransform(offset, (o) => {
    const t = Math.min(Math.abs(o) / FAN_LIMIT, 1);
    return 1 - (1 - MIN_SCALE) * t;
  });
  // Covers past the fan limit stack tightly behind the ranks and drop out of
  // the hit-test so only the near flow is grabbable.
  const zIndex = useTransform(offset, (o) => total - Math.round(Math.abs(o)));
  const pointerEvents = useTransform(offset, (o) =>
    Math.abs(o) > FAN_LIMIT ? "none" : "auto",
  );

  // Two elements keep the transforms from colliding on one CSS `transform`:
  // the outer wrapper holds only the static centering (translate −50%), the
  // inner button holds only the animated transform — so rotateY pivots about
  // the cover's own center for a clean in-place bank.
  return (
    <motion.div
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      // zIndex lives here (a sibling stacking context), so ranks layer
      // correctly across covers; the static centering translate can't collide
      // with the animated transform below.
      style={{ zIndex, transformStyle: "preserve-3d" }}
    >
      <motion.button
        type="button"
        aria-label={`Show item ${index + 1}`}
        onClick={() => onSelect(index)}
        className="block cursor-pointer rounded-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        style={{
          x,
          z,
          rotateY,
          opacity,
          scale,
          pointerEvents,
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {children}
      </motion.button>
    </motion.div>
  );
}
