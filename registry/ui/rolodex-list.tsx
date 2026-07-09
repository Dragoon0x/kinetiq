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
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Angular pitch between adjacent records on the wheel, in degrees. */
const STEP = 28;
/** Drag ratio in degrees per pixel — 0.35 reads as machined. */
const SENSITIVITY = 0.35;
/** Pointer travel (px) before a press becomes a drag — protects record taps. */
const DRAG_THRESHOLD = 4;
/** Release momentum is projected this many seconds ahead of the finger. */
const MOMENTUM_WINDOW = 0.25;
/** A fling carries at most this many records past the release point. */
const MAX_CARRY = 3;
/** Springy give past the ends of a non-looping wheel, in degrees. */
const OVERDRAG = 11;
/** Accumulated wheel delta that equals one notch — one record. */
const WHEEL_NOTCH = 50;
/** Wheel input is rate-limited to one record per this many ms. */
const WHEEL_LOCK_MS = 140;
/** Idle gap (ms) after which the wheel accumulator resets. */
const WHEEL_IDLE_MS = 250;
/** Records are fully transparent by this angular distance, in degrees. */
const FADE_END = 84;
/** Angular horizon: records beyond this are not painted at all. */
const CULL = 90;
/** Saturation floor — records grey out as they roll over the crest. */
const MIN_SATURATION = 0.25;
/** Vertical gap folded between adjacent record faces, in px. */
const CARD_GAP = 12;

type DragState = {
  pointerId: number;
  /** Pointer y where the press began — measures the tap threshold. */
  startY: number;
  /** Last pointer y, for per-move deltas. */
  lastY: number;
  /** Last move timestamp (ms), for angular velocity. */
  lastT: number;
  /** Smoothed velocity in deg/s; positive rolls the wheel forward. */
  velocity: number;
  engaged: boolean;
};

export type RolodexItem = {
  /** Stable id — becomes the option's DOM id and the `onSelect` payload. */
  id: string;
  /** Card face content; clipped inside the card, never by the 3D stage. */
  content: React.ReactNode;
  /** Read by the announcer and the option's accessible name. */
  label?: string;
};

export type RolodexListProps = {
  items: RolodexItem[];
  /** Initial front record when uncontrolled. */
  defaultIndex?: number;
  /** Controlled front record; changing it rolls the wheel there. */
  index?: number;
  /** Fires whenever the wheel settles on a different record. */
  onIndexChange?: (index: number) => void;
  /** Explicit activation — Enter/Space or a tap on the front record. */
  onSelect?: (id: string, index: number) => void;
  /** Viewport height of the wheel window, in px. */
  height?: number;
  /** Endless wheel; off, the ends stop with a springy give. */
  loop?: boolean;
  className?: string;
  /** Accessible name for the listbox. Required — this is a selection control. */
  "aria-label": string;
};

/**
 * A rolodex selection list. Records mount on a vertical wheel around the X
 * axis and one rotation motion value (degrees) is the single source of truth:
 * record `i` sits at `a = i * STEP − R`, rendered as
 * `rotateX(−a) translateZ(radius)` inside a preserve-3d stage recessed by
 * `−radius`, so the front record lies flat on the screen plane. Cards fade and
 * desaturate with angular distance and stop painting past 90° — when looping,
 * angles wrap so the wheel is endless. Dragging maps pixels to degrees;
 * release projects the momentum ~250ms ahead (capped at ±3 records) and snaps
 * the nearest record to the front on `snap`, launched with the release
 * velocity. A hand-bound non-passive wheel listener steps one record per
 * notch — it lives on the control only, so the page never loses its scroll.
 *
 * Semantics: the wheel is a listbox (`aria-activedescendant`, options with
 * posinset/setsize). ArrowUp/Down roll one record, Home/End jump,
 * Enter/Space fires `onSelect` for the front record, and a polite announcer
 * reads "Record N of M" on settle. `onIndexChange` fires on settle only.
 *
 * Layer rules: the perspective frame (a flat, non-3D node) does the clipping
 * and hosts the top/bottom gradient fades; the preserve-3d stage never carries
 * overflow or filter — dim/desaturate live on a flat wrapper inside each card.
 *
 * Reduced motion: no wheel at all — a flat three-row ledger (previous, front,
 * next) with duration-fast swaps and the same listbox semantics, wheel
 * stepping, and announcements.
 */
export function RolodexList({
  items,
  defaultIndex,
  index: controlledIndex,
  onIndexChange,
  onSelect,
  height = 260,
  loop = true,
  className,
  "aria-label": ariaLabel,
}: RolodexListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const count = items.length;
  const lastIndex = Math.max(0, count - 1);
  const canLoop = loop && count > 1;
  /** One full lap of the record wheel, in degrees. */
  const period = count * STEP;

  const radius = Math.round(height * 0.85);
  /** Face height fills the chord between adjacent spokes, minus a seam. */
  const cardHeight = Math.max(
    56,
    Math.round(2 * radius * Math.tan((STEP * Math.PI) / 360)) - CARD_GAP,
  );

  const clampIndex = React.useCallback(
    (i: number) => clamp(i, 0, lastIndex),
    [lastIndex],
  );
  const wrapIndex = React.useCallback(
    (i: number) => (canLoop ? ((i % count) + count) % count : clamp(i, 0, lastIndex)),
    [canLoop, count, lastIndex],
  );

  const [initialIndex] = React.useState(() =>
    clamp(controlledIndex ?? defaultIndex ?? 0, 0, Math.max(0, items.length - 1)),
  );

  /** The one source of truth: wheel rotation in degrees (record i fronts at i·STEP). */
  const rotation = useMotionValue(initialIndex * STEP);

  /** Live nearest-detent index — drives the accent card and aria wiring. */
  const [active, setActive] = React.useState(initialIndex);
  /** Last settled index — feeds the polite announcer only. */
  const [settled, setSettled] = React.useState(initialIndex);
  const [grabbing, setGrabbing] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The detent the wheel last settled on or is heading to (unwrapped degrees). */
  const targetRef = React.useRef(initialIndex * STEP);
  const activeRef = React.useRef(initialIndex);
  const emittedRef = React.useRef(initialIndex);
  const displayRef = React.useRef(initialIndex);
  const dragRef = React.useRef<DragState | null>(null);
  const wheelRef = React.useRef({ acc: 0, steppedAt: 0, lastAt: 0 });

  const onIndexChangeRef = React.useRef(onIndexChange);
  React.useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  /** Nearest record for a rotation — wrapped when looping, clamped otherwise. */
  const indexFor = React.useCallback(
    (deg: number) => {
      if (count === 0) return 0;
      const idx = Math.round(deg / STEP);
      return canLoop ? ((idx % count) + count) % count : clamp(idx, 0, lastIndex);
    },
    [count, canLoop, lastIndex],
  );

  // Live index: nearest detent of the rotation, deduped (event callback, not
  // an effect body — the house pattern for deriving state from a motion value).
  useMotionValueEvent(rotation, "change", (deg) => {
    const next = indexFor(deg);
    if (next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
  });

  /** The record shown as front: prop-driven in the flat path when controlled. */
  const displayIndex =
    !motionSafe && controlledIndex !== undefined
      ? clampIndex(controlledIndex)
      : clamp(active, 0, lastIndex);

  React.useEffect(() => {
    displayRef.current = displayIndex;
  });

  const emitSettled = React.useCallback((idx: number) => {
    setSettled(idx);
    if (idx === emittedRef.current) return;
    emittedRef.current = idx;
    onIndexChangeRef.current?.(idx);
  }, []);

  const settleTo = React.useCallback(
    (detent: number, transition: Transition, velocity?: number) => {
      targetRef.current = detent;
      controlsRef.current?.stop();
      controlsRef.current = animate(rotation, detent, {
        ...transition,
        ...(velocity === undefined ? null : { velocity }),
        onComplete: () => emitSettled(indexFor(detent)),
      });
    },
    [rotation, emitSettled, indexFor],
  );

  /** `snap` for a single-record roll, `glide` for anything farther. */
  const springFor = React.useCallback(
    (detent: number): Transition =>
      Math.abs(detent - rotation.get()) <= STEP + 1 ? springs.snap : springs.glide,
    [rotation],
  );

  const stepBy = React.useCallback(
    (delta: number) => {
      if (count === 0) return;
      let detent = targetRef.current + delta * STEP;
      if (!canLoop) detent = clamp(detent, 0, lastIndex * STEP);
      settleTo(detent, springs.snap);
    },
    [count, canLoop, lastIndex, settleTo],
  );

  const goToIndex = React.useCallback(
    (idx: number) => {
      if (count === 0) return;
      const base = clampIndex(idx) * STEP;
      // Nearest coterminal detent — the wheel takes the short way around.
      const turns = canLoop ? Math.round((targetRef.current - base) / period) : 0;
      const detent = base + turns * period;
      settleTo(detent, springFor(detent));
    },
    [count, canLoop, period, clampIndex, settleTo, springFor],
  );

  /** Flat-path move: instant, announced, and emitted straight away. */
  const moveInstant = React.useCallback(
    (idx: number) => {
      if (count === 0) return;
      const target = wrapIndex(idx);
      activeRef.current = target;
      setActive(target);
      emitSettled(target);
    },
    [count, wrapIndex, emitSettled],
  );

  const moveBy = React.useCallback(
    (delta: number) => {
      if (motionSafe) stepBy(delta);
      else moveInstant(displayRef.current + delta);
    },
    [motionSafe, stepBy, moveInstant],
  );

  const moveTo = React.useCallback(
    (idx: number) => {
      if (motionSafe) goToIndex(idx);
      else moveInstant(idx);
    },
    [motionSafe, goToIndex, moveInstant],
  );

  // Controlled index rolls the wheel (motion-value ops only, never setState).
  React.useEffect(() => {
    if (!motionSafe || controlledIndex === undefined || count === 0) return;
    const target = clampIndex(controlledIndex);
    if (indexFor(targetRef.current) === target) return;
    goToIndex(target);
  }, [controlledIndex, motionSafe, count, clampIndex, indexFor, goToIndex]);

  // Re-seat the wheel when the 3D path (re)mounts or the detent grid changes —
  // the flat path may have moved the record while this one was away.
  React.useEffect(() => {
    if (!motionSafe || count === 0) return;
    controlsRef.current?.stop();
    const base = clamp(displayRef.current, 0, count - 1) * STEP;
    const lap = count * STEP;
    const turns = loop && count > 1 ? Math.round((targetRef.current - base) / lap) : 0;
    const detent = base + turns * lap;
    targetRef.current = detent;
    rotation.jump(detent);
  }, [motionSafe, count, loop, rotation]);

  // Wheel: one notch = one record. React's onWheel is passive, so the
  // non-passive listener is bound by hand — it exists only on the control,
  // which is the whole hijack boundary; elsewhere the page scrolls untouched.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || count === 0) return;
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
    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [count, moveBy, motionSafe]);

  // A settle in flight must not outlive the component.
  React.useEffect(() => () => controlsRef.current?.stop(), []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    controlsRef.current?.stop();
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
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // records still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dy = event.clientY - drag.lastY;
    // Drag up rolls the next record over the crest.
    const dDeg = -dy * SENSITIVITY;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = dDeg / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    const next = rotation.get() + dDeg;
    rotation.set(
      canLoop ? next : clamp(next, -OVERDRAG, lastIndex * STEP + OVERDRAG),
    );
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its record.
    setGrabbing(false);
    // Momentum capped at ±3 records: clamp the release velocity so the
    // projection can never carry farther, then snap with that velocity.
    const maxSpin = (MAX_CARRY * STEP) / MOMENTUM_WINDOW;
    const velocity = clamp(drag.velocity, -maxSpin, maxSpin);
    const projected = rotation.get() + velocity * MOMENTUM_WINDOW;
    let detent = Math.round(projected / STEP) * STEP;
    if (!canLoop) detent = clamp(detent, 0, lastIndex * STEP);
    settleTo(detent, springs.snap, velocity);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowDown":
        moveBy(1);
        break;
      case "ArrowUp":
        moveBy(-1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(lastIndex);
        break;
      case "Enter":
      case " ": {
        const item = items[displayIndex];
        if (item) onSelect?.(item.id, displayIndex);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  /** Tap on the front record activates it; any other record rolls forward. */
  const handleCardPress = (idx: number) => {
    // Keep focus on the listbox — aria-activedescendant only reads from there.
    listRef.current?.focus({ preventScroll: true });
    if (idx === displayIndex) {
      const item = items[idx];
      if (item) onSelect?.(item.id, idx);
    } else {
      moveTo(idx);
    }
  };

  const optionId = (id: string) => `${uid}option-${id}`;

  const activeItem = items[displayIndex];
  const announceIndex = motionSafe ? clamp(settled, 0, lastIndex) : displayIndex;
  const announceItem = items[announceIndex];
  const announcement =
    count === 0
      ? null
      : `Record ${announceIndex + 1} of ${count}${
          announceItem?.label ? `: ${announceItem.label}` : ""
        }`;

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  // Reduced motion: a flat three-row ledger — previous, front, next — with
  // instant duration-fast swaps and the same listbox semantics.
  if (!motionSafe) {
    const rows: { offset: -1 | 0 | 1; index: number }[] = [];
    if (count > 0) {
      const seen = new Set<number>();
      // Front first so a tiny roster can never drop the active option.
      for (const offset of [0, -1, 1] as const) {
        const raw = displayIndex + offset;
        const idx = canLoop ? ((raw % count) + count) % count : raw;
        if (idx < 0 || idx > lastIndex || seen.has(idx)) continue;
        seen.add(idx);
        rows.push({ offset, index: idx });
      }
      rows.sort((a, b) => a.offset - b.offset);
    }

    return (
      <div className={cn("relative w-full", className)}>
        <div
          ref={frameRef}
          className="relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          style={{ height }}
        >
          <ul
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-orientation="vertical"
            aria-activedescendant={
              activeItem ? optionId(activeItem.id) : undefined
            }
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="m-0 grid h-full list-none grid-rows-3 gap-2 p-3 outline-none"
          >
            {rows.map(({ offset, index: idx }) => {
              const item = items[idx];
              if (!item) return null;
              const front = idx === displayIndex;
              return (
                <li
                  key={`slot${offset}`}
                  id={optionId(item.id)}
                  role="option"
                  aria-selected={front}
                  aria-posinset={idx + 1}
                  aria-setsize={count}
                  aria-label={item.label}
                  tabIndex={-1}
                  onClick={() => handleCardPress(idx)}
                  className="min-h-0 cursor-pointer"
                  style={{ gridRow: offset + 2 }}
                >
                  {/* Keyed by record — a swap remounts and fades, never slides. */}
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: durations.fast }}
                    className="h-full"
                  >
                    <CardShell active={front} dim={!front}>
                      {item.content}
                    </CardShell>
                  </motion.div>
                </li>
              );
            })}
          </ul>
        </div>
        {status}
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      {/* The frame is flat (perspective only, no preserve-3d), so it may clip
          vertical bleed and carry the crest fades; the 3D stage inside never
          clips or filters. */}
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative isolate w-full touch-none overflow-hidden rounded-3 border border-hairline bg-surface-1 select-none",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ height, perspective: perspectives.far }}
      >
        {/* The stage: recessed by −radius so the front record sits on the
            screen plane; the only will-change layer. */}
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          aria-orientation="vertical"
          aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 m-0 list-none p-0 outline-none"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateZ(${-radius}px)`,
            willChange: "transform",
          }}
        >
          {items.map((item, i) => (
            <RolodexCard
              key={item.id}
              rotation={rotation}
              index={i}
              count={count}
              loop={canLoop}
              radius={radius}
              cardHeight={cardHeight}
              active={i === displayIndex}
              grabbing={grabbing}
              id={optionId(item.id)}
              label={item.label}
              onPress={() => handleCardPress(i)}
            >
              {item.content}
            </RolodexCard>
          ))}
        </ul>
        {/* Crest fades — painted masks, never overflow on the 3D stage. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[24%] bg-linear-to-b from-surface-1 to-surface-1/0"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[24%] bg-linear-to-t from-surface-1 to-surface-1/0"
        />
      </div>
      {status}
    </div>
  );
}

type RolodexCardProps = {
  rotation: MotionValue<number>;
  /** This record's fixed spoke on the wheel. */
  index: number;
  count: number;
  loop: boolean;
  radius: number;
  cardHeight: number;
  active: boolean;
  grabbing: boolean;
  id: string;
  label: string | undefined;
  onPress: () => void;
  children: React.ReactNode;
};

/**
 * One record on the wheel. The outer li carries only the 3D placement
 * (rotateX + translateZ derived from the shared rotation — wrapped when
 * looping so the wheel is endless); fade and desaturation live on a flat
 * inner wrapper, so grouping properties never break the 3D placement.
 * Past 90° the record stops painting entirely.
 */
function RolodexCard({
  rotation,
  index,
  count,
  loop,
  radius,
  cardHeight,
  active,
  grabbing,
  id,
  label,
  onPress,
  children,
}: RolodexCardProps) {
  const angle = useTransform(rotation, (deg) => {
    const raw = index * STEP - deg;
    if (!loop) return raw;
    const lap = count * STEP;
    const wrapped = ((raw % lap) + lap) % lap;
    return wrapped > lap / 2 ? wrapped - lap : wrapped;
  });
  const transform = useTransform(
    angle,
    (a) => `rotateX(${-a}deg) translateZ(${radius}px)`,
  );
  const opacity = useTransform(angle, (a) =>
    mapRange(Math.abs(a), 0, FADE_END, 1, 0),
  );
  const filter = useTransform(
    angle,
    (a) =>
      `saturate(${mapRange(Math.abs(a), 0, CULL, 1, MIN_SATURATION).toFixed(3)})`,
  );
  const visibility = useTransform(angle, (a) =>
    Math.abs(a) <= CULL ? "visible" : "hidden",
  );

  return (
    <motion.li
      id={id}
      role="option"
      aria-selected={active}
      aria-posinset={index + 1}
      aria-setsize={count}
      aria-label={label}
      tabIndex={-1}
      onClick={onPress}
      className={cn(
        "absolute inset-x-3 top-1/2 mx-auto max-w-[360px]",
        grabbing ? "cursor-grabbing" : "cursor-pointer",
      )}
      style={{
        height: cardHeight,
        marginTop: -cardHeight / 2,
        transform,
        visibility,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <motion.div className="h-full w-full" style={{ opacity, filter }}>
        <CardShell active={active}>{children}</CardShell>
      </motion.div>
    </motion.li>
  );
}

/**
 * The record chassis: hairline card with a punched hub-hole row up top —
 * the rolodex identity without the kitsch. Content clips in here, inside
 * the card, never on a 3D node. The front record wears an accent hairline.
 */
function CardShell({
  active,
  dim,
  children,
}: {
  active: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-3 border bg-surface-2 transition-colors",
        active ? "border-cobalt/60" : "border-hairline",
        dim && "opacity-65",
      )}
    >
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center gap-10 pt-2"
      >
        <span className="size-1.5 rounded-full bg-surface-0 ring-1 ring-hairline-strong" />
        <span className="size-1.5 rounded-full bg-surface-0 ring-1 ring-hairline-strong" />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
