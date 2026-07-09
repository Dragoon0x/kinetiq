"use client";

import * as React from "react";

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

/** Pointer travel (px) before a press becomes a drag — below this, it's a click that selects. */
const DRAG_THRESHOLD = 3;
/** Release angular velocity is clamped to a believable throw, in deg/s. */
const MAX_SPIN = 1400;
/** Projection horizon: where the throw would coast before snapping, in seconds. */
const PROJECTION = 0.2;
/** Fraction of the ring radius each item occupies — sets item size and inset. */
const ITEM_FRACTION = 0.19;

/** Folds an angle into (−180, 180] — the short way round a circle. */
const wrapSigned = (deg: number): number => {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

export type OrbitItem = {
  /** Stable identity — also the value reported by `onValueChange`. */
  id: string;
  /** Short label shown at the item and echoed in the hub when active. */
  label: string;
  /** Optional glyph rendered above the label. */
  icon?: React.ReactNode;
};

export type OrbitMenuProps = {
  /** Items placed evenly around the hub; the first is the default active detent. */
  items: OrbitItem[];
  /** Controlled active id — changing it rotates that item to the top detent. */
  value?: string;
  /** Uncontrolled initial active id (defaults to `items[0]`). */
  defaultValue?: string;
  /** Fires whenever the ring settles a new item into the active detent. */
  onValueChange?: (id: string) => void;
  /** Ring diameter in px. */
  size?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A weighted radial dial. Items sit evenly around a central hub; the slot at
 * 12 o'clock is the active detent. One `rotation` motion value (degrees) turns
 * the whole ring and every item counter-rotates to stay upright, so all visuals
 * derive from a single source. Grab the ring and it tracks the finger 1:1 by the
 * angle swept around the hub; release projects the angular momentum ~200ms ahead
 * and settles the nearest item into the detent on `snap`, carrying the release
 * velocity — a hard flick spins and overshoots, a nudge eases over. Clicking any
 * item (or arrow keys / Home / End) rotates it up the short way. `onValueChange`
 * fires on every settled detent.
 *
 * Reduced motion: no fling. Direct drag still tracks the finger but drops
 * inertia — release snaps to the nearest detent with a short tween — and
 * selecting tweens straight to the target. First paint is safe either way.
 */
export function OrbitMenu({
  items,
  value,
  defaultValue,
  onValueChange,
  size = 260,
  className,
  "aria-label": ariaLabel = "Orbit menu",
}: OrbitMenuProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const count = items.length;
  const step = count > 0 ? 360 / count : 360;

  /** Index of an id, or −1. Recomputed only when the item list changes. */
  const indexOfId = React.useCallback(
    (id: string | undefined): number =>
      id === undefined ? -1 : items.findIndex((item) => item.id === id),
    [items],
  );

  // Resolve the starting detent once. Controlled value wins, then defaultValue,
  // then the first item; anything unrecognized falls back to index 0.
  const [initialIndex] = React.useState(() => {
    const seed = value ?? defaultValue;
    const found = seed === undefined ? -1 : items.findIndex((i) => i.id === seed);
    return found >= 0 ? found : 0;
  });

  /** The one source of truth: ring rotation in degrees. Landing item i at the
   *  top needs rotation ≡ −i·step, so we seed the negative. */
  const rotation = useMotionValue(-initialIndex * step);

  /** React state carries only the announced (active) index. */
  const [activeIndex, setActiveIndex] = React.useState(initialIndex);

  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The detent the ring last settled on or is heading to, in degrees. */
  const targetRef = React.useRef(-initialIndex * step);
  const activeIndexRef = React.useRef(initialIndex);
  /** Id of the last emitted detent — dedupes onValueChange. */
  const emittedRef = React.useRef(items[initialIndex]?.id);
  const onValueChangeRef = React.useRef(onValueChange);
  const motionSafeRef = React.useRef(motionSafe);
  const dragRef = React.useRef<{
    pointerId: number;
    /** Pointer angle (deg) around the hub at press — measures gesture start. */
    startAngle: number;
    /** Pointer angle at the previous move, for per-move deltas. */
    lastAngle: number;
    /** Last move timestamp (ms), for angular velocity. */
    lastT: number;
    /** Smoothed angular velocity in deg/s; positive turns the ring clockwise. */
    velocity: number;
    engaged: boolean;
  } | null>(null);

  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  });

  /** Nearest detent index of a rotation, normalized into [0, count). */
  const indexForRotation = React.useCallback(
    (deg: number): number => {
      if (count === 0) return 0;
      return ((Math.round(-deg / step) % count) + count) % count;
    },
    [count, step],
  );

  // Announced index tracks the live rotation's nearest detent, deduped. This is
  // the only place ring motion turns into React state.
  useMotionValueEvent(rotation, "change", (deg) => {
    const next = indexForRotation(deg);
    if (next === activeIndexRef.current) return;
    activeIndexRef.current = next;
    setActiveIndex(next);
  });

  /** Fire onValueChange for a settled id, deduped against the last emission. */
  const emitSettled = React.useCallback((id: string | undefined) => {
    if (id === undefined || id === emittedRef.current) return;
    emittedRef.current = id;
    onValueChangeRef.current?.(id);
  }, []);

  const stopAnimation = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  /** Settle the ring to a detent (degrees), optionally carrying a release
   *  velocity. Motion-safe springs on `snap`; reduced motion tweens briefly. */
  const settleTo = React.useCallback(
    (detent: number, velocity = 0) => {
      targetRef.current = detent;
      stopAnimation();
      const settledId = items[indexForRotation(detent)]?.id;
      const transition: Transition = motionSafeRef.current
        ? { ...springs.snap, velocity }
        : { duration: 0.18 };
      controlsRef.current = animate(rotation, detent, {
        ...transition,
        onComplete: () => emitSettled(settledId),
      });
    },
    [items, rotation, stopAnimation, indexForRotation, emitSettled],
  );

  /** Rotate a target index into the top detent, taking the short way around. */
  const goToIndex = React.useCallback(
    (idx: number, velocity = 0) => {
      if (count === 0) return;
      const clamped = Math.min(Math.max(idx, 0), count - 1);
      const base = -clamped * step;
      // Nearest coterminal detent to where we are — never the long way round.
      const turns = Math.round((targetRef.current - base) / 360);
      settleTo(base + turns * 360, velocity);
    },
    [count, step, settleTo],
  );

  // Controlled value drives the ring imperatively (motion ops, not setState).
  React.useEffect(() => {
    if (value === undefined || count === 0) return;
    const target = indexOfId(value);
    if (target < 0) return;
    if (indexForRotation(targetRef.current) === target) return;
    goToIndex(target);
  }, [value, count, indexOfId, indexForRotation, goToIndex]);

  // A gesture or animation in flight must never outlive the component.
  React.useEffect(() => stopAnimation, [stopAnimation]);

  // Pause any settle while the tab is hidden — rAF is throttled there anyway.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopAnimation();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopAnimation]);

  /** Pointer angle around the hub center, in degrees, 0 at 12 o'clock. */
  const pointerAngle = (clientX: number, clientY: number): number => {
    const ring = ringRef.current;
    if (!ring) return 0;
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // atan2(dx, −dy): 0° points up, growing clockwise — matches item placement.
    return (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (count === 0) return;
    stopAnimation();
    const angle = pointerAngle(event.clientX, event.clientY);
    dragRef.current = {
      pointerId: event.pointerId,
      startAngle: angle,
      lastAngle: angle,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const angle = pointerAngle(event.clientX, event.clientY);
    if (!drag.engaged) {
      // Approximate travel from swept angle over the ring radius; below the
      // threshold this stays a click so the item underneath can select.
      const sweptPx = (Math.abs(wrapSigned(angle - drag.startAngle)) / 180) *
        Math.PI * (size / 2);
      if (sweptPx < DRAG_THRESHOLD) return;
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const delta = wrapSigned(angle - drag.lastAngle);
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = delta / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastAngle = angle;
    drag.lastT = event.timeStamp;
    rotation.set(rotation.get() + delta);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A click — leave selection to the item's button.

    if (!motionSafeRef.current) {
      // Reduced motion: no fling — snap to whatever detent is nearest now.
      settleTo(Math.round(rotation.get() / step) * step);
      return;
    }
    const spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, drag.velocity));
    const projected = rotation.get() + spin * PROJECTION;
    const detent = Math.round(projected / step) * step;
    settleTo(detent, spin);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const current = activeIndexRef.current;
    let target: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = (current + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = (current - 1 + count) % count;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    // Arrow steps take the short way; wrap-around uses the nearest coterminal.
    goToIndex(target);
  };

  const itemRadius = size * ITEM_FRACTION;
  const orbitRadius = size / 2 - itemRadius - 2;
  const activeItem = count > 0 ? items[activeIndex] : undefined;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
    >
      <div
        ref={ringRef}
        tabIndex={count > 0 ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute inset-0 rounded-full outline-none",
          "border border-hairline bg-surface-1",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          motionSafe && "cursor-grab active:cursor-grabbing",
        )}
        style={{ touchAction: "none" }}
      >
        {/* Detent marker at 12 o'clock — the slot an item settles into. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="block size-2 rounded-full bg-[var(--accent-bright)] shadow-[0_0_10px_var(--accent-wash)]" />
        </span>

        {/* The ring: one rotation motion value spins every item together. */}
        <motion.div
          className="absolute inset-0"
          style={{ rotate: rotation }}
        >
          {items.map((item, i) => (
            <OrbitNode
              key={item.id}
              item={item}
              rotation={rotation}
              baseAngle={i * step}
              orbitRadius={orbitRadius}
              itemRadius={itemRadius}
              active={i === activeIndex}
              motionSafe={motionSafe}
              onSelect={() => goToIndex(i)}
            />
          ))}
        </motion.div>

        {/* Hub: shows the active item's label, echoing the detent. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-hairline-strong bg-surface-2 text-center"
          style={{ width: size * 0.34, height: size * 0.34 }}
        >
          <span className="text-label text-ink-3">Active</span>
          <span className="max-w-[calc(100%-8px)] truncate px-1 text-sm font-medium text-ink">
            {activeItem?.label ?? "—"}
          </span>
        </div>
      </div>

      {/* Polite announcer for the settled selection. */}
      <span role="status" aria-live="polite" className="sr-only">
        {activeItem?.label ?? ""}
      </span>
    </div>
  );
}

type OrbitNodeProps = {
  item: OrbitItem;
  rotation: MotionValue<number>;
  /** This node's fixed angle on the ring, in degrees from 12 o'clock. */
  baseAngle: number;
  orbitRadius: number;
  itemRadius: number;
  active: boolean;
  motionSafe: boolean;
  onSelect: () => void;
};

/**
 * One item on the ring. Placement is static (polar → cartesian, 0° at top);
 * the button counter-rotates by the live rotation so its label stays upright
 * no matter how the ring is turned.
 */
function OrbitNode({
  item,
  rotation,
  baseAngle,
  orbitRadius,
  itemRadius,
  active,
  motionSafe,
  onSelect,
}: OrbitNodeProps) {
  const rad = (baseAngle * Math.PI) / 180;
  const x = orbitRadius * Math.sin(rad);
  const y = -orbitRadius * Math.cos(rad);

  // The ring wrapper rotates every item by `rotation`; cancel exactly that so
  // the translated glyph + label always read screen-upright, at any spin.
  const counter = useTransform(rotation, (deg) => -deg);

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={item.label}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        "absolute left-1/2 top-1/2 flex flex-col items-center justify-center gap-0.5 rounded-full outline-none",
        "border text-center transition-colors",
        motionSafe ? "duration-200" : "duration-0",
        active
          ? "border-[var(--accent-bright)] bg-[var(--accent-wash)] text-cobalt-bright"
          : "border-hairline bg-surface-2 text-ink-2 hover:text-ink hover:border-hairline-strong",
      )}
      style={{
        width: itemRadius * 2,
        height: itemRadius * 2,
        x: x - itemRadius,
        y: y - itemRadius,
        rotate: counter,
      }}
    >
      {item.icon ? (
        <span aria-hidden className="[&_svg]:size-4">
          {item.icon}
        </span>
      ) : null}
      <span className="max-w-full truncate px-1 text-[11px] font-medium leading-none">
        {item.label}
      </span>
    </motion.button>
  );
}
