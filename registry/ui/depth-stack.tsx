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
import { durations, springs } from "@/registry/lib/motion";
import { clamp, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** px a layer rises per step of depth behind — the stepped-skyline pitch. */
const PEEK_Y = 14;
/** Scale shed per step of depth behind the active plane. */
const RECEDE_SCALE = 0.07;
/** Opacity shed per step of depth behind. */
const RECEDE_FADE = 0.28;
/** Opacity floor at the back of the pile. */
const FADE_FLOOR = 0.1;
/** Scale gained per step past the camera. */
const PASS_SCALE = 0.18;
/** Opacity shed per step past the camera — passed layers vanish fast. */
const PASS_FADE = 0.9;
/** Layers farther than this from the lead stop painting (they stay mounted). */
const WINDOW = 3.5;
/** Stage headroom (px) the peek skyline rises into: ceil(WINDOW · PEEK_Y) + margin. */
const HEADROOM = 56;
/** Drag ratio in layers per pixel of vertical travel. */
const DRAG_RATIO = 0.011;
/** Pointer travel (px) before a press becomes a drag — protects tick taps. */
const DRAG_THRESHOLD = 4;
/** Release momentum is projected this many seconds ahead of the finger. */
const MOMENTUM_WINDOW = 0.25;
/** A released drag carries at most this many layers past the release point. */
const MAX_CARRY = 2;
/** Springy give past either end of the pile, in layers. */
const OVERDRAG = 0.35;
/** Fraction of a layer a clamped wheel notch bumps into the end stop. */
const END_BUMP = 0.16;
/** Accumulated wheel delta that equals one notch — one layer. */
const WHEEL_NOTCH = 50;
/** Wheel input is rate-limited to one layer per this many ms. */
const WHEEL_LOCK_MS = 140;
/** Idle gap (ms) after which the wheel accumulator resets. */
const WHEEL_IDLE_MS = 250;

type DragState = {
  pointerId: number;
  /** Pointer y where the press began — measures the tap threshold. */
  startY: number;
  /** Last pointer y, for per-move deltas. */
  lastY: number;
  /** Last move timestamp (ms), for velocity. */
  lastT: number;
  /** Smoothed velocity in layers/s; positive browses deeper into the pile. */
  velocity: number;
  /** Unresisted lead — resistance is applied on top, never compounded. */
  raw: number;
  engaged: boolean;
};

export type StackLayer = {
  /** Stable id — keys the layer across renders. */
  id: string;
  /** Header-strip label; also the tick and announcer string. */
  label: string;
  /** The layer face. Interactive while active, inert while buried. */
  content: React.ReactNode;
};

export type DepthStackProps = {
  /** Layers of the pile, nearest the camera (index 0) to deepest. 3–8. */
  layers: StackLayer[];
  /** Controlled active index; changing it glides the pile there. */
  index?: number;
  /** Initial index when uncontrolled. */
  defaultIndex?: number;
  /** Fires once per settle, when the pile locks onto a new layer. */
  onIndexChange?: (index: number) => void;
  /** Stage height in px. */
  height?: number;
  className?: string;
  /** Accessible name for the stack — required, this is a bare control. */
  "aria-label": string;
};

/**
 * A z-stacked deck browsed face-on — no tilt, no fan, just depth. One float
 * motion value, `lead` (the fractional index the camera holds), is the single
 * source of truth; layer i derives everything live from d = i − lead as
 * independent flat transforms inside a `perspective(perspectives.base)` stage
 * (no preserve-3d). At d = 0 the layer is crisp — scale 1, y 0, opacity 1,
 * accent hairline on bg-surface-2. Behind (d > 0) it recedes: scale
 * 1 − d·0.07, y −d·14, opacity down 0.28 per step to a 0.1 floor, z-index
 * falling with depth (statically count − i). Transform-origin sits on the top
 * edge so the y offsets survive the scale intact and the pile reads as a
 * 14px stepped skyline — every buried layer peeks exactly its header strip
 * above the card in front. Passed (d < 0) it flies at the camera: scale
 * 1 + |d|·0.18, opacity shed 0.9 per step — gone within about one layer of
 * travel. Beyond |d| = 3.5 layers stop painting but stay mounted.
 *
 * Wheel steps one layer per notch (accumulate + lock window; a hand-bound
 * non-passive listener on the stage element only, so it fires only with the
 * pointer over the control and the page keeps its scroll elsewhere); a notch
 * against either end flicks a resisted bump into the stop and snaps home.
 * Vertical dragging feeds `lead` directly (0.011 layers/px) with asymptotic
 * give past the ends; release projects the smoothed velocity 250ms ahead
 * (carry capped ±2) and snaps the nearest integer on `snap`, seeded with the
 * release velocity. The tick rail on the right edge is one real button per
 * layer — mono index, the active tick accented and slightly larger — and a
 * tick click glides `lead` there on `glide`.
 *
 * Semantics: the stage is a focusable `role="group"` with
 * aria-roledescription "layer stack" (aria-label required). ArrowUp/Down and
 * ArrowLeft/Right move one layer on `snap`, Home/End jump on `glide`; ticks
 * sit in the tab order with aria-current. Only the active layer's content is
 * live — the rest are aria-hidden + inert. A polite sr-only region announces
 * each settle ("Layer N of M: label") and `onIndexChange` fires once per
 * settled index, deduped, with prop-driven moves never echoed back.
 *
 * Reduced motion: no pile — the active layer renders alone under a
 * compressed flat list of the other layers' labels, swaps run at
 * duration-fast, and keys, ticks, wheel, and announcements behave
 * identically.
 */
export function DepthStack({
  layers,
  index,
  defaultIndex = 0,
  onIndexChange,
  height = 260,
  className,
  "aria-label": ariaLabel,
}: DepthStackProps) {
  const motionSafe = useMotionSafe();

  const count = layers.length;
  const lastIndex = Math.max(0, count - 1);

  const [initialIndex] = React.useState(() =>
    clamp(index ?? defaultIndex, 0, Math.max(0, layers.length - 1)),
  );

  /** The pile's source of truth: the fractional index the camera sits on. */
  const lead = useMotionValue(initialIndex);

  /** Live nearest layer — drives the crisp card, ticks, and aria wiring. */
  const [active, setActive] = React.useState(initialIndex);
  /** Last settled layer — feeds the polite announcer only. */
  const [settled, setSettled] = React.useState(initialIndex);
  const [grabbing, setGrabbing] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The layer the pile last settled on or is heading to. */
  const targetRef = React.useRef(initialIndex);
  const activeRef = React.useRef(initialIndex);
  /** Last index handed to onIndexChange — the settle dedupe. */
  const emittedRef = React.useRef(initialIndex);
  const displayRef = React.useRef(initialIndex);
  const dragRef = React.useRef<DragState | null>(null);
  const wheelRef = React.useRef({ acc: 0, steppedAt: 0, lastAt: 0 });

  // The owner's callback may change identity every render — read it via ref.
  const onIndexChangeRef = React.useRef(onIndexChange);
  React.useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  /** Adopts the nearest layer as the live active one (card accent, ticks, aria). */
  const applyActive = (next: number) => {
    if (next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
  };

  // Live index: nearest layer of the lead, deduped (event callback, not an
  // effect body — the house pattern for deriving state from a motion value).
  useMotionValueEvent(lead, "change", (value) => {
    if (count === 0) return;
    applyActive(clamp(Math.round(value), 0, lastIndex));
  });

  /** The crisp layer for render: prop-driven on the flat path when controlled. */
  const controlledIndex = index === undefined ? -1 : clamp(index, 0, lastIndex);
  const displayIndex =
    !motionSafe && controlledIndex >= 0
      ? controlledIndex
      : clamp(active, 0, lastIndex);

  React.useEffect(() => {
    displayRef.current = displayIndex;
  });

  /** Records a settle: announcer first, then onIndexChange once per new index. */
  const emitSettle = (idx: number) => {
    const target = clamp(idx, 0, lastIndex);
    setSettled(target);
    if (target === emittedRef.current || !layers[target]) return;
    emittedRef.current = target;
    onIndexChangeRef.current?.(target);
  };

  /** Sends the pile to an integer layer; the settle announces + emits once. */
  const settleTo = (idx: number, transition: Transition, velocity?: number) => {
    const target = clamp(Math.round(idx), 0, lastIndex);
    targetRef.current = target;
    controlsRef.current?.stop();
    controlsRef.current = animate(lead, target, {
      ...transition,
      ...(velocity === undefined ? null : { velocity }),
      onComplete: () => emitSettle(target),
    });
  };

  /** Flat-path move: instant, announced and emitted straight away. */
  const moveInstant = (idx: number) => {
    if (count === 0) return;
    const target = clamp(idx, 0, lastIndex);
    targetRef.current = target;
    applyActive(target);
    emitSettle(target);
  };

  /** One notch or arrow: a snap step, or a resisted bump at the end stops. */
  const stepBy = (delta: number) => {
    if (count === 0) return;
    const from = clamp(Math.round(targetRef.current), 0, lastIndex);
    const target = clamp(from + delta, 0, lastIndex);
    if (target !== from) {
      settleTo(target, springs.snap);
      return;
    }
    if (Math.abs(lead.get() - from) > 0.5) {
      // Mid-flight from far away — just keep heading to the end stop.
      settleTo(from, springs.snap);
      return;
    }
    // Clamped at the end: flick into the overdrag give, then snap back home.
    controlsRef.current?.stop();
    controlsRef.current = animate(lead, from + Math.sign(delta) * END_BUMP, {
      ...springs.flick,
      onComplete: () => {
        controlsRef.current = animate(lead, from, {
          ...springs.snap,
          onComplete: () => emitSettle(from),
        });
      },
    });
  };

  const moveBy = (delta: number) => {
    if (motionSafe) stepBy(delta);
    else moveInstant(displayRef.current + delta);
  };

  /** Tick clicks and Home/End glide; the flat path swaps instantly. */
  const moveTo = (idx: number) => {
    if (motionSafe) settleTo(idx, springs.glide);
    else moveInstant(idx);
  };

  /** Rubber past the ends: excess compresses asymptotically toward the give. */
  const resistPast = (value: number) => {
    if (value < 0) {
      const excess = -value;
      return -OVERDRAG * (excess / (excess + OVERDRAG));
    }
    if (value > lastIndex) {
      const excess = value - lastIndex;
      return lastIndex + OVERDRAG * (excess / (excess + OVERDRAG));
    }
    return value;
  };

  // A controlled index arriving from props pre-arms the settle dedupe, so a
  // prop-driven glide never echoes onIndexChange back at its owner.
  React.useEffect(() => {
    if (index !== undefined) emittedRef.current = clamp(index, 0, lastIndex);
  }, [index, lastIndex]);

  // Controlled index rolls the pile there (motion-value ops only, no setState).
  React.useEffect(() => {
    if (!motionSafe || index === undefined || count === 0) return;
    const idx = clamp(index, 0, lastIndex);
    if (Math.round(targetRef.current) === idx) return;
    settleTo(idx, springs.glide);
  }, [index, motionSafe, count, lastIndex, settleTo]);

  // Re-seat the pile when the spatial path (re)mounts — the flat path may
  // have moved the active layer while the springs were away.
  React.useEffect(() => {
    if (!motionSafe || count === 0) return;
    controlsRef.current?.stop();
    const idx = clamp(displayRef.current, 0, count - 1);
    targetRef.current = idx;
    lead.jump(idx);
  }, [motionSafe, count, lead]);

  // Wheel: one notch = one layer. React's onWheel is passive, so the
  // non-passive listener is bound by hand — to the stage element only, which
  // means it fires only with the pointer over the control and the page keeps
  // its scroll everywhere else.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;
    const handleWheel = (event: WheelEvent) => {
      if (dragRef.current?.engaged) return;
      event.preventDefault();
      const wheel = wheelRef.current;
      if (event.timeStamp - wheel.lastAt > WHEEL_IDLE_MS) wheel.acc = 0;
      wheel.lastAt = event.timeStamp;
      if (event.timeStamp - wheel.steppedAt < WHEEL_LOCK_MS) return;
      // deltaMode 1 is line-based (Firefox) — normalize toward pixels.
      wheel.acc += event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      if (Math.abs(wheel.acc) < WHEEL_NOTCH) return;
      const direction = wheel.acc > 0 ? 1 : -1;
      wheel.acc = 0;
      wheel.steppedAt = event.timeStamp;
      moveBy(direction);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [count, motionSafe, moveBy]);

  // A settle in flight must not outlive the component.
  React.useEffect(() => () => controlsRef.current?.stop(), []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count === 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    controlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      raw: lead.get(),
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // ticks and live layer content still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dy = event.clientY - drag.lastY;
    // Drag up browses deeper into the pile.
    const dLead = -dy * DRAG_RATIO;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous velocity so the fling reads intent.
      drag.velocity = drag.velocity * 0.4 + (dLead / dt) * 0.6;
    }
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    drag.raw += dLead;
    lead.set(resistPast(drag.raw));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) {
      // A tap. If the press interrupted a flight, re-arm the nearest layer —
      // a tick's click may still retarget right after this.
      if (Math.abs(lead.get() - targetRef.current) > 0.001) {
        settleTo(Math.round(lead.get()), springs.snap);
      }
      return;
    }
    setGrabbing(false);
    // Momentum capped at ±2 layers: clamp the release velocity so the
    // projection can never carry farther, then snap seeded with it.
    const maxCarry = MAX_CARRY / MOMENTUM_WINDOW;
    const velocity = clamp(drag.velocity, -maxCarry, maxCarry);
    const projected = lead.get() + velocity * MOMENTUM_WINDOW;
    settleTo(Math.round(projected), springs.snap, velocity);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    // Keys aimed at editable content inside the live layer stay its own.
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        moveBy(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        moveBy(-1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(lastIndex);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const announceIndex = clamp(motionSafe ? settled : displayIndex, 0, lastIndex);
  const announceLayer = layers[announceIndex];
  const announcement = announceLayer
    ? `Layer ${announceIndex + 1} of ${count}: ${announceLayer.label}`
    : "";

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  // The tick rail — one real button per layer, riding the stage's right edge.
  const tickRail = (
    <div className="absolute inset-y-0 right-0 z-30 flex w-11 flex-col items-center justify-center gap-1">
      {layers.map((layer, i) => {
        const isCurrent = i === displayIndex;
        return (
          <button
            key={layer.id}
            type="button"
            aria-label={`Layer ${i + 1}: ${layer.label}`}
            aria-current={isCurrent ? "true" : undefined}
            onClick={() => moveTo(i)}
            className={cn(
              "flex h-5 w-7 cursor-pointer items-center justify-center rounded-2 font-mono text-[9px] tracking-[0.08em] tabular-nums",
              "outline-none transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              isCurrent
                ? "scale-110 bg-cobalt-wash text-cobalt"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {String(i + 1).padStart(2, "0")}
          </button>
        );
      })}
    </div>
  );

  // Reduced motion: no pile — the active layer alone under a compressed flat
  // list of the other layers' labels, with duration-fast swaps.
  if (!motionSafe) {
    const activeLayer = layers[displayIndex];
    return (
      <div className={cn("relative w-full", className)}>
        <div
          ref={stageRef}
          role="group"
          aria-roledescription="layer stack"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-0",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          style={{ height }}
        >
          <div className="absolute inset-y-3 left-3 right-12 flex flex-col gap-1.5">
            {/* The pile, compressed: every buried layer as a labeled shelf. */}
            <ul className="m-0 flex shrink-0 list-none flex-col gap-1 p-0">
              {layers.map((layer, i) =>
                i === displayIndex ? null : (
                  <li
                    key={layer.id}
                    className="flex items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-2.5 py-0.5"
                  >
                    <span className="shrink-0 font-mono text-[9px] leading-none tracking-[0.08em] text-ink-3 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] leading-4 font-medium tracking-[0.08em] text-ink-2 uppercase">
                      {layer.label}
                    </span>
                  </li>
                ),
              )}
            </ul>
            {/* The active layer, alone — keyed so a move swaps on a fast fade. */}
            {activeLayer && (
              <motion.div
                key={activeLayer.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast }}
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3 border border-cobalt/60 bg-surface-2"
              >
                <LayerHeader
                  index={displayIndex}
                  label={activeLayer.label}
                  isActive
                />
                <div className="min-h-0 flex-1 overflow-hidden">
                  {activeLayer.content}
                </div>
              </motion.div>
            )}
          </div>
          {tickRail}
        </div>
        {status}
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="layer stack"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative w-full touch-none overflow-hidden rounded-3 border border-hairline bg-surface-0 select-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ height, perspective: perspectives.base }}
      >
        {layers.map((layer, i) => (
          <StackCard
            key={layer.id}
            layer={layer}
            index={i}
            count={count}
            lead={lead}
            isActive={i === displayIndex}
          />
        ))}
        {tickRail}
      </div>
      {status}
    </div>
  );
}

type LayerHeaderProps = {
  index: number;
  label: string;
  isActive: boolean;
};

/**
 * The header strip every layer wears — mono index + label, glyphs kept inside
 * the top 14px so a buried layer's peek band always reads.
 */
function LayerHeader({ index, label, isActive }: LayerHeaderProps) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-hairline px-3 pt-1 pb-1.5">
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] leading-none tracking-[0.08em] tabular-nums transition-colors",
          isActive ? "text-cobalt" : "text-ink-3",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[10px] leading-none font-medium tracking-[0.08em] uppercase transition-colors",
          isActive ? "text-ink" : "text-ink-2",
        )}
      >
        {label}
      </span>
    </div>
  );
}

type StackCardProps = {
  layer: StackLayer;
  /** This layer's fixed depth slot in the pile. */
  index: number;
  count: number;
  lead: MotionValue<number>;
  isActive: boolean;
};

/**
 * One layer of the pile. Everything derives live from the shared `lead`:
 * d = index − lead places the card with independent flat transforms — origin
 * on the top edge so the −14px-per-step y offsets survive the scale and
 * stack into a clean stepped skyline. z-index is static (count − index):
 * smaller indices sit nearer the camera, so a passed layer flies out over
 * the pile before it vanishes and stops painting.
 */
function StackCard({ layer, index, count, lead, isActive }: StackCardProps) {
  const transform = useTransform(lead, (value) => {
    const d = index - value;
    // Behind recedes 0.07/step; passed swells 0.18/step toward the camera.
    const scale = d >= 0 ? 1 - d * RECEDE_SCALE : 1 - d * PASS_SCALE;
    const y = -d * PEEK_Y;
    return `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  });

  const opacity = useTransform(lead, (value) => {
    const d = index - value;
    return d >= 0
      ? clamp(1 - d * RECEDE_FADE, FADE_FLOOR, 1)
      : clamp(1 + d * PASS_FADE, 0, 1);
  });

  // Outside the render window — or fully faded past the camera — the card
  // stops painting (and taking pointer events) but stays mounted.
  const visibility = useTransform(lead, (value) => {
    const d = index - value;
    return Math.abs(d) > WINDOW || d * PASS_FADE < -0.98 ? "hidden" : "visible";
  });

  return (
    <motion.div
      aria-hidden={!isActive || undefined}
      inert={!isActive ? true : undefined}
      className={cn(
        "absolute right-12 bottom-3 left-3 flex flex-col overflow-hidden rounded-3 border transition-colors",
        isActive ? "border-cobalt/60 bg-surface-2" : "border-hairline bg-surface-1",
      )}
      style={{
        top: HEADROOM,
        zIndex: count - index,
        transform,
        opacity,
        visibility,
        transformOrigin: "50% 0%",
        willChange: "transform",
      }}
    >
      <LayerHeader index={index} label={layer.label} isActive={isActive} />
      <div className="min-h-0 flex-1 overflow-hidden">{layer.content}</div>
    </motion.div>
  );
}
