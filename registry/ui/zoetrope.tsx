"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Faces beyond this are dropped — a denser ring loses its detents. */
const MAX_PANELS = 12;
/** Half the inter-panel gap folded into the ring radius, in px. */
const PANEL_GAP = 12;
/** Release momentum is projected this many seconds ahead of the finger. */
const MOMENTUM_WINDOW = 0.25;
/** Angular velocity clamp at release, in deg/s. */
const MAX_SPIN = 1800;
/** Wheel input is rate-limited to one detent per this many ms. */
const WHEEL_LOCK_MS = 150;

/** Flanking step buttons: invisible until keyboard focus reveals them. */
const ARROW_CLASS =
  "border-border bg-background/90 text-muted-foreground absolute top-1/2 z-20 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-2 border backdrop-blur-sm " +
  "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100";

/** Folds an angle to its distance from 0° on the ring, in [0, 180]. */
const angularDistance = (deg: number): number => {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? 360 - wrapped : wrapped;
};

export type ZoetropeProps = {
  /** Panels — each direct child becomes one face of the drum (max 12). */
  children: React.ReactNode;
  /** Controlled front index; changing it animates the drum to that detent. */
  index?: number;
  /** Initial front index when uncontrolled. */
  defaultIndex?: number;
  /** Fires whenever the drum settles on a different detent. */
  onIndexChange?: (index: number) => void;
  /** Panel width in px; also sets the ring radius. */
  itemWidth?: number;
  /** Panel height in px; also sets the stage height. */
  itemHeight?: number;
  /** Perspective depth of the stage, in px. */
  perspective?: number;
  /** Drag ratio in degrees per pixel — 0.35 reads as machined. */
  sensitivity?: number;
  /** Accessible name for the carousel region. */
  label?: string;
  /**
   * Names a panel for the polite announcer. Defaults to the panel's
   * `data-label` prop, then "Item k".
   */
  getLabel?: (index: number) => string;
  className?: string;
};

/**
 * A specimen drum. Children mount on a 3D ring — panels face outward and
 * one motion value (degrees) spins the whole drum, so every visual derives
 * from a single source of rotation. Dragging maps pixels to degrees
 * (`sensitivity`); release projects the angular momentum ~250ms ahead and
 * settles on the nearest detent — `snap` for a single step, `glide` for a
 * multi-panel fling. Wheel and arrow keys step one detent (wheel is
 * rate-limited); Home/End jump to the first/last panel. Panels dim to 0.25
 * opacity and 0.92 scale across 90° of angular distance, and only the
 * front panel stays interactive (the rest are `aria-hidden` + `inert`).
 *
 * Browser-variance mitigations: rear-facing panels are culled with
 * `backface-visibility: hidden` instead of trusting depth sorting; the
 * ring radius is integer-rounded so `translateZ` never sits on a subpixel
 * seam; `will-change: transform` is applied to the drum only (one promoted
 * layer — panels stay cheap); the panel count is capped at 12 to bound
 * composite layers; and dim/scale animate on an inner wrapper so grouping
 * properties (opacity) can never flatten a panel's 3D placement.
 *
 * Reduced motion: no 3D at all — a flat scroll-snap row with the same
 * semantics, arrows, announcements, and index API.
 */
export function Zoetrope({
  children,
  index: controlledIndex,
  defaultIndex,
  onIndexChange,
  itemWidth = 160,
  itemHeight = 200,
  perspective = 1000,
  sensitivity = 0.35,
  label = "Carousel",
  getLabel,
  className,
}: ZoetropeProps) {
  const motionSafe = useMotionSafe();

  const allPanels = React.Children.toArray(children);
  const panels =
    allPanels.length > MAX_PANELS ? allPanels.slice(0, MAX_PANELS) : allPanels;
  const count = panels.length;
  const suppliedCount = allPanels.length;

  React.useEffect(() => {
    if (suppliedCount > MAX_PANELS) {
      console.warn(
        `Zoetrope: ${suppliedCount} panels supplied; rendering the first ${MAX_PANELS}. A drum denser than ${MAX_PANELS} faces loses its detents.`,
      );
    }
  }, [suppliedCount]);

  const step = count > 0 ? 360 / count : 360;
  // Integer radius: translateZ on a whole pixel avoids seam shimmer.
  const radius =
    count > 1
      ? Math.round((itemWidth / 2 + PANEL_GAP) / Math.tan(Math.PI / count))
      : 0;

  const clampIndex = React.useCallback(
    (i: number) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)),
    [count],
  );

  const [initialIndex] = React.useState(() => {
    const start = controlledIndex ?? defaultIndex ?? 0;
    return Math.min(Math.max(start, 0), Math.max(count - 1, 0));
  });

  /** The one source of truth: drum rotation in degrees. */
  const rotation = useMotionValue(-initialIndex * step);

  /** React state exists only for the announced (front) index. */
  const [frontIndex, setFrontIndex] = React.useState(initialIndex);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The detent the drum last settled on or is heading to, in degrees. */
  const targetRef = React.useRef(-initialIndex * step);
  const frontIndexRef = React.useRef(initialIndex);
  const emittedRef = React.useRef(initialIndex);
  const draggingRef = React.useRef(false);
  const pointerRef = React.useRef({ id: -1, x: 0, t: 0, v: 0 });
  const wheelAtRef = React.useRef(0);
  const scrollRafRef = React.useRef(0);
  const onIndexChangeRef = React.useRef(onIndexChange);

  React.useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  const indexForRotation = React.useCallback(
    (deg: number): number => {
      if (count === 0) return 0;
      return ((Math.round(-deg / step) % count) + count) % count;
    },
    [count, step],
  );

  // Announced index: nearest detent of the live rotation, deduped.
  useMotionValueEvent(rotation, "change", (deg) => {
    const next = indexForRotation(deg);
    if (next === frontIndexRef.current) return;
    frontIndexRef.current = next;
    setFrontIndex(next);
  });

  const emitSettled = React.useCallback((idx: number) => {
    if (idx === emittedRef.current) return;
    emittedRef.current = idx;
    onIndexChangeRef.current?.(idx);
  }, []);

  const settleTo = React.useCallback(
    (detent: number, transition: Transition) => {
      targetRef.current = detent;
      controlsRef.current?.stop();
      controlsRef.current = animate(rotation, detent, {
        ...transition,
        onComplete: () => emitSettled(indexForRotation(detent)),
      });
    },
    [rotation, emitSettled, indexForRotation],
  );

  /** `snap` for a single-step move, `glide` for anything farther. */
  const springFor = React.useCallback(
    (detent: number): Transition =>
      Math.abs(detent - rotation.get()) <= step ? springs.snap : springs.glide,
    [rotation, step],
  );

  const stepBy = React.useCallback(
    (delta: number) => {
      if (count === 0) return;
      settleTo(targetRef.current - delta * step, springs.snap);
    },
    [count, step, settleTo],
  );

  const goToIndex = React.useCallback(
    (idx: number) => {
      if (count === 0) return;
      const base = -clampIndex(idx) * step;
      // Nearest coterminal detent — the drum takes the short way around.
      const turns = Math.round((targetRef.current - base) / 360);
      const detent = base + turns * 360;
      settleTo(detent, springFor(detent));
    },
    [count, step, clampIndex, settleTo, springFor],
  );

  const scrollRowTo = React.useCallback((idx: number) => {
    const row = rowRef.current;
    if (!row) return;
    const child = row.children.item(idx);
    if (!(child instanceof HTMLElement)) return;
    row.scrollTo({
      left: child.offsetLeft - (row.clientWidth - child.offsetWidth) / 2,
      behavior: "auto",
    });
  }, []);

  // Re-align the drum whenever the detent grid changes (panel count) or the
  // 3D pathway (re)mounts — the reduced-motion row may have moved the index.
  React.useEffect(() => {
    if (!motionSafe) return;
    controlsRef.current?.stop();
    const base = -frontIndexRef.current * step;
    const turns = Math.round((targetRef.current - base) / 360);
    const detent = base + turns * 360;
    targetRef.current = detent;
    rotation.jump(detent);
  }, [motionSafe, step, rotation]);

  // Reduced-motion row: position under the front index on mount or switch.
  React.useEffect(() => {
    if (motionSafe) return;
    scrollRowTo(frontIndexRef.current);
  }, [motionSafe, scrollRowTo]);

  // Controlled index animates the drum (motion value ops, not setState).
  React.useEffect(() => {
    if (controlledIndex === undefined || count === 0) return;
    const target = clampIndex(controlledIndex);
    if (motionSafe) {
      if (indexForRotation(targetRef.current) === target) return;
      goToIndex(target);
    } else {
      scrollRowTo(target);
    }
  }, [
    controlledIndex,
    count,
    motionSafe,
    clampIndex,
    indexForRotation,
    goToIndex,
    scrollRowTo,
  ]);

  // Wheel steps a detent; native non-passive listener so the page holds still.
  React.useEffect(() => {
    if (!motionSafe) return;
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || draggingRef.current) return;
      event.preventDefault();
      if (event.timeStamp - wheelAtRef.current < WHEEL_LOCK_MS) return;
      wheelAtRef.current = event.timeStamp;
      stepBy(event.deltaY > 0 ? 1 : -1);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [motionSafe, stepBy]);

  React.useEffect(
    () => () => {
      controlsRef.current?.stop();
      cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (draggingRef.current) return;
    controlsRef.current?.stop();
    draggingRef.current = true;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      t: event.timeStamp,
      v: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || event.pointerId !== pointerRef.current.id)
      return;
    const dx = event.clientX - pointerRef.current.x;
    const dt = (event.timeStamp - pointerRef.current.t) / 1000;
    const dDeg = dx * sensitivity;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = dDeg / dt;
      pointerRef.current.v = pointerRef.current.v * 0.4 + instant * 0.6;
    }
    pointerRef.current.x = event.clientX;
    pointerRef.current.t = event.timeStamp;
    rotation.set(rotation.get() + dDeg);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || event.pointerId !== pointerRef.current.id)
      return;
    draggingRef.current = false;
    const spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, pointerRef.current.v));
    const projected = rotation.get() + spin * MOMENTUM_WINDOW;
    const detent = Math.round(projected / step) * step;
    settleTo(detent, springFor(detent));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowRight":
        stepBy(1);
        break;
      case "ArrowLeft":
        stepBy(-1);
        break;
      case "Home":
        goToIndex(0);
        break;
      case "End":
        goToIndex(count - 1);
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
        scrollRowTo(clampIndex(frontIndex + 1));
        break;
      case "ArrowLeft":
        scrollRowTo(clampIndex(frontIndex - 1));
        break;
      case "Home":
        scrollRowTo(0);
        break;
      case "End":
        scrollRowTo(count - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Index tracking for the flat row, coalesced to one read per frame.
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
      if (nearest === frontIndexRef.current) return;
      frontIndexRef.current = nearest;
      setFrontIndex(nearest);
      emitSettled(nearest);
    });
  };

  const handleStep = (delta: -1 | 1) => {
    if (count === 0) return;
    if (motionSafe) stepBy(delta);
    else scrollRowTo(clampIndex(frontIndex + delta));
  };

  const labelFor = (i: number): string => {
    if (getLabel) return getLabel(i);
    const child = panels[i];
    if (React.isValidElement(child)) {
      const raw = (child.props as Record<string, unknown>)["data-label"];
      if (typeof raw === "string") return raw;
    }
    return `Item ${i + 1}`;
  };

  const arrow = (delta: -1 | 1) => (
    <button
      type="button"
      aria-label={delta === 1 ? "Next item" : "Previous item"}
      onClick={() => handleStep(delta)}
      className={cn(ARROW_CLASS, delta === 1 ? "right-1" : "left-1")}
    >
      {delta === 1 ? (
        <ChevronRight className="size-4" aria-hidden />
      ) : (
        <ChevronLeft className="size-4" aria-hidden />
      )}
    </button>
  );

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {count > 0 ? labelFor(frontIndex) : null}
    </span>
  );

  // Reduced motion: a flat scroll-snap row — same semantics, no 3D.
  if (!motionSafe) {
    return (
      <section
        aria-roledescription="carousel"
        aria-label={label}
        className={cn("relative w-full", className)}
      >
        {arrow(-1)}
        <div
          ref={rowRef}
          role="group"
          tabIndex={0}
          aria-label="Specimen drum, use arrow keys"
          onScroll={handleRowScroll}
          onKeyDown={handleRowKeyDown}
          className="relative flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          style={{
            gap: PANEL_GAP,
            paddingInline: `calc(50% - ${itemWidth / 2}px)`,
          }}
        >
          {panels.map((child, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              className="shrink-0 snap-center"
              style={{ width: itemWidth, height: itemHeight }}
            >
              {child}
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
      aria-label={label}
      className={cn("relative w-full", className)}
    >
      {arrow(-1)}
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative w-full cursor-grab touch-pan-y rounded-3 select-none active:cursor-grabbing has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        style={{ perspective, height: itemHeight }}
      >
        {/* The drum: one rotation motion value, recessed so the front
            panel sits at z≈0; the only element with will-change. */}
        <motion.div
          role="group"
          tabIndex={0}
          aria-label="Specimen drum, use arrow keys"
          onKeyDown={handleKeyDown}
          className="absolute inset-0 outline-none"
          style={{
            rotateY: rotation,
            z: -radius,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {panels.map((child, i) => (
            <DrumPanel
              key={i}
              rotation={rotation}
              angle={i * step}
              index={i}
              total={count}
              width={itemWidth}
              height={itemHeight}
              radius={radius}
              front={i === frontIndex}
            >
              {child}
            </DrumPanel>
          ))}
        </motion.div>
      </div>
      {arrow(1)}
      {status}
    </section>
  );
}

type DrumPanelProps = {
  rotation: MotionValue<number>;
  /** This panel's fixed angle on the ring, in degrees. */
  angle: number;
  index: number;
  total: number;
  width: number;
  height: number;
  radius: number;
  front: boolean;
  children: React.ReactNode;
};

/**
 * One face of the drum. Ring placement is a static transform on the outer
 * element (with its backface hidden); opacity and scale react to the shared
 * rotation on an inner wrapper, so dimming never disturbs 3D placement.
 */
function DrumPanel({
  rotation,
  angle,
  index,
  total,
  width,
  height,
  radius,
  front,
  children,
}: DrumPanelProps) {
  // Angular distance to the front, normalized over a quarter turn.
  const opacity = useTransform(rotation, (deg) => {
    const t = Math.min(angularDistance(angle + deg) / 90, 1);
    return 1 - 0.75 * t;
  });
  const scale = useTransform(rotation, (deg) => {
    const t = Math.min(angularDistance(angle + deg) / 90, 1);
    return 1 - 0.08 * t;
  });

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}`}
      aria-hidden={front ? undefined : true}
      inert={front ? undefined : true}
      className={cn(
        "absolute top-1/2 left-1/2",
        !front && "pointer-events-none",
      )}
      style={{
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <motion.div className="h-full w-full" style={{ opacity, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
