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
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Drag ratio in degrees per pixel — 0.5 keeps the drum under the finger. */
const SENSITIVITY = 0.5;
/** Pointer travel (px) before a press becomes a drag — protects row taps. */
const DRAG_THRESHOLD = 4;
/** Release momentum is projected this many seconds ahead of the finger. */
const MOMENTUM_WINDOW = 0.25;
/** A fling carries at most this many rows past the release point. */
const MAX_CARRY = 4;
/** Accumulated wheel delta that equals one notch — one row. */
const WHEEL_NOTCH = 50;
/** Wheel input is rate-limited to one row per this many ms. */
const WHEEL_LOCK_MS = 140;
/** Idle gap (ms) after which the wheel accumulator resets. */
const WHEEL_IDLE_MS = 250;
/** Typeahead prefix buffer lifetime, in ms. */
const TYPEAHEAD_MS = 250;
/** Rows are fully transparent by this angular distance, in degrees. */
const FADE_END = 76;
/** Angular horizon: rows beyond this are not painted at all. */
const CULL = 88;
/** Rows compress to this scale as they curve toward the horizon. */
const MIN_ROW_SCALE = 0.82;
/** Resting opacity of the selection window's side caps between ticks. */
const CAP_REST = 0.35;
/** The recessed well — the column reads sunk into the panel, not raised. */
const RECESS_SHADOW =
  "shadow-[inset_0_1px_3px_oklch(0.05_0.02_258_/_0.3),inset_0_-1px_2px_oklch(0.05_0.02_258_/_0.18)]";

type DragState = {
  pointerId: number;
  /** Pointer y where the press began — measures the tap threshold. */
  startY: number;
  /** Last pointer y, for per-move deltas. */
  lastY: number;
  /** Last move timestamp (ms), for angular velocity. */
  lastT: number;
  /** Smoothed velocity in deg/s; positive rolls the next row into the window. */
  velocity: number;
  /** Unresisted drum angle — resistance is applied on top, never compounded. */
  raw: number;
  engaged: boolean;
};

export type WheelPickerOption = {
  /** Committed payload and identity — must be unique within the picker. */
  value: string;
  /** Row text; also the typeahead and announcer string. */
  label: string;
};

type WheelPickerBaseProps = {
  options: WheelPickerOption[];
  /** Controlled value; changing it rolls the drum there. */
  value?: string;
  defaultValue?: string;
  /** Fires once per settle, when a new row locks into the window. */
  onValueChange?: (value: string) => void;
  /** Rows readable in the window — sets the drum's angular pitch. */
  visibleRows?: 3 | 5 | 7;
  /** Control height in px; one row is `height / visibleRows` tall. */
  height?: number;
  /** Fixed width in px, or "auto" to fill the container. */
  width?: number | "auto";
  disabled?: boolean;
  className?: string;
};

export type WheelPickerProps = WheelPickerBaseProps &
  (
    | {
        /** Accessible name — required, this is a bare form control. */
        "aria-label": string;
        "aria-labelledby"?: string;
      }
    | {
        "aria-label"?: string;
        /** Id of the visible label element naming this control. */
        "aria-labelledby": string;
      }
  );

/**
 * A drum value picker — the form-control cousin of the card wheel. Options
 * mount as flat text rows curving over a vertical drum: row `i` sits at
 * `a = i · pitch − R`, rendered `rotateX(−a) translateZ(radius)` inside a
 * preserve-3d stage recessed by `−radius`, so the row in the selection window
 * lies flat on the screen plane. One rotation motion value (degrees) is the
 * single source of truth; rows fade and compress with angular distance and
 * stop painting past the horizon. No card chrome — a recessed instrument
 * column on `bg-surface-1`.
 *
 * The fixed selection window (hairline rules over a faint accent wash) holds
 * the vertical center while the drum turns beneath it; every row that lands
 * in the window blinks the window's side caps once at `durations.blink` — a
 * visual tick, no audio. Dragging maps pixels to degrees (0.5°/px) with a
 * resisted give past either end; release projects momentum ~250ms ahead
 * (capped at ±4 rows) and snaps the nearest detent on `snap`, seeded with the
 * release velocity. A hand-bound non-passive wheel listener steps one row per
 * notch — it lives on the control only, so the page never loses its scroll.
 * `onValueChange` fires once per settle.
 *
 * Semantics: the control is a listbox (`aria-activedescendant`, options with
 * ids and `aria-selected`). ArrowUp/Down step one row, PageUp/Down a full
 * window, Home/End jump to the ends, and printable keys run a 250ms typeahead
 * against option labels. A polite region announces each settled label.
 *
 * Layer rules: the perspective frame (flat, non-3D) does the clipping and
 * carries the recess shadow and edge fades; the preserve-3d stage never clips
 * or filters — fade and compression live on a flat wrapper inside each row.
 *
 * Reduced motion: no drum — a flat column of the window's rows with
 * duration-fast swaps and identical listbox semantics, wheel stepping,
 * typeahead, and window styling.
 */
export function WheelPicker(props: WheelPickerProps) {
  const {
    options,
    value: controlledValue,
    defaultValue,
    onValueChange,
    visibleRows = 5,
    height = 200,
    width = "auto",
    disabled = false,
    className,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
  } = props;

  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const count = options.length;
  const lastIndex = Math.max(0, count - 1);
  const isControlled = controlledValue !== undefined;

  /** Row pitch on the drum, in degrees — the window plus curved shoulders. */
  const pitch = 180 / (visibleRows + 4);
  const rowHeight = height / visibleRows;
  /** Faces tile the drum edge to edge: rowHeight = 2·radius·tan(pitch/2). */
  const radius = rowHeight / (2 * Math.tan((pitch * Math.PI) / 360));
  const lastDetent = lastIndex * pitch;

  const indexOfValue = React.useCallback(
    (candidate: string | undefined) =>
      candidate === undefined
        ? -1
        : options.findIndex((option) => option.value === candidate),
    [options],
  );

  const [initialIndex] = React.useState(() => {
    const seed = controlledValue ?? defaultValue;
    const idx =
      seed === undefined
        ? -1
        : options.findIndex((option) => option.value === seed);
    return clamp(idx >= 0 ? idx : 0, 0, Math.max(0, options.length - 1));
  });

  /** The one source of truth: drum rotation in degrees (row i fronts at i·pitch). */
  const rotation = useMotionValue(initialIndex * pitch);
  /** Side-cap glow — jumps to 1 on a tick, tweens back to rest. */
  const capPulse = useMotionValue(CAP_REST);

  /** Live nearest-detent index — drives the window row and aria wiring. */
  const [active, setActive] = React.useState(initialIndex);
  /** Last settled index — feeds the polite announcer only. */
  const [settled, setSettled] = React.useState(initialIndex);
  const [grabbing, setGrabbing] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const capAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The detent the drum last settled on or is heading to, in degrees. */
  const targetRef = React.useRef(initialIndex * pitch);
  const activeRef = React.useRef(initialIndex);
  const emittedRef = React.useRef<string | undefined>(
    options[initialIndex]?.value,
  );
  const displayRef = React.useRef(initialIndex);
  const dragRef = React.useRef<DragState | null>(null);
  const wheelRef = React.useRef({ acc: 0, steppedAt: 0, lastAt: 0 });
  const typeaheadRef = React.useRef({ buffer: "", timer: 0 });

  const onValueChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });

  /** Adopts a new in-window row and fires the tick — the caps blink once. */
  const applyActive = React.useCallback(
    (next: number) => {
      if (next === activeRef.current) return;
      activeRef.current = next;
      setActive(next);
      capAnimRef.current?.stop();
      capPulse.jump(1);
      capAnimRef.current = animate(capPulse, CAP_REST, {
        duration: durations.blink,
        ease: easings.exit,
      });
    },
    [capPulse],
  );

  // Live index: nearest detent of the rotation, deduped (event callback, not
  // an effect body — the house pattern for deriving state from a motion value).
  useMotionValueEvent(rotation, "change", (deg) => {
    if (count === 0) return;
    applyActive(clamp(Math.round(deg / pitch), 0, lastIndex));
  });

  /** The row shown in the window: prop-driven on the flat path when controlled. */
  const controlledIndex = isControlled ? indexOfValue(controlledValue) : -1;
  const displayIndex =
    !motionSafe && isControlled && controlledIndex >= 0
      ? controlledIndex
      : clamp(active, 0, lastIndex);

  React.useEffect(() => {
    displayRef.current = displayIndex;
  });

  const emitSettle = React.useCallback(
    (idx: number) => {
      setSettled(idx);
      const option = options[idx];
      if (!option || option.value === emittedRef.current) return;
      emittedRef.current = option.value;
      onValueChangeRef.current?.(option.value);
    },
    [options],
  );

  const settleTo = React.useCallback(
    (detent: number, transition: Transition, velocity?: number) => {
      targetRef.current = detent;
      controlsRef.current?.stop();
      controlsRef.current = animate(rotation, detent, {
        ...transition,
        ...(velocity === undefined ? null : { velocity }),
        onComplete: () =>
          emitSettle(clamp(Math.round(detent / pitch), 0, lastIndex)),
      });
    },
    [rotation, pitch, lastIndex, emitSettle],
  );

  /** `snap` for a one-row move, `glide` for anything farther. */
  const springFor = React.useCallback(
    (detent: number): Transition =>
      Math.abs(detent - rotation.get()) <= pitch * 1.5
        ? springs.snap
        : springs.glide,
    [rotation, pitch],
  );

  const stepBy = React.useCallback(
    (delta: number) => {
      if (count === 0) return;
      const from = Math.round(targetRef.current / pitch);
      settleTo(clamp(from + delta, 0, lastIndex) * pitch, springs.snap);
    },
    [count, pitch, lastIndex, settleTo],
  );

  const goToIndex = React.useCallback(
    (idx: number) => {
      if (count === 0) return;
      const detent = clamp(idx, 0, lastIndex) * pitch;
      settleTo(detent, springFor(detent));
    },
    [count, pitch, lastIndex, settleTo, springFor],
  );

  /** Flat-path move: instant, ticked, announced, and emitted straight away. */
  const moveInstant = React.useCallback(
    (idx: number) => {
      if (count === 0) return;
      const target = clamp(idx, 0, lastIndex);
      applyActive(target);
      emitSettle(target);
    },
    [count, lastIndex, applyActive, emitSettle],
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

  // Controlled value rolls the drum (motion-value ops only, never setState).
  React.useEffect(() => {
    if (!motionSafe || !isControlled || count === 0) return;
    const idx = indexOfValue(controlledValue);
    if (idx < 0 || Math.round(targetRef.current / pitch) === idx) return;
    goToIndex(idx);
  }, [
    controlledValue,
    isControlled,
    motionSafe,
    count,
    pitch,
    indexOfValue,
    goToIndex,
  ]);

  // Re-seat the drum when the 3D path (re)mounts or the detent grid changes —
  // the flat path may have moved the row while this one was away.
  React.useEffect(() => {
    if (!motionSafe || count === 0) return;
    controlsRef.current?.stop();
    const detent = clamp(displayRef.current, 0, count - 1) * pitch;
    targetRef.current = detent;
    rotation.jump(detent);
  }, [motionSafe, count, pitch, rotation]);

  // Wheel: one notch = one row. React's onWheel is passive, so the non-passive
  // listener is bound by hand — it exists only on the control, which is the
  // whole hijack boundary; elsewhere the page scrolls untouched.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || count === 0 || disabled) return;
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
  }, [count, disabled, moveBy, motionSafe]);

  // Nothing in flight may outlive the component: settle spring, cap tween,
  // typeahead timeout.
  React.useEffect(
    () => () => {
      controlsRef.current?.stop();
      capAnimRef.current?.stop();
      window.clearTimeout(typeaheadRef.current.timer);
    },
    [],
  );

  /** Rubber past the ends: excess compresses asymptotically toward the give. */
  const resistPast = React.useCallback(
    (deg: number) => {
      const give = pitch * 0.75;
      if (deg < 0) {
        const excess = -deg;
        return -give * (excess / (excess + give));
      }
      if (deg > lastDetent) {
        const excess = deg - lastDetent;
        return lastDetent + give * (excess / (excess + give));
      }
      return deg;
    },
    [pitch, lastDetent],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || count === 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    controlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      raw: rotation.get(),
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // rows still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dy = event.clientY - drag.lastY;
    // Drag up rolls the next row into the window.
    const dDeg = -dy * SENSITIVITY;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = dDeg / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    drag.raw += dDeg;
    rotation.set(resistPast(drag.raw));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its row.
    setGrabbing(false);
    // Momentum capped at ±4 rows: clamp the release velocity so the
    // projection can never carry farther, then snap with that velocity.
    const maxSpin = (MAX_CARRY * pitch) / MOMENTUM_WINDOW;
    const velocity = clamp(drag.velocity, -maxSpin, maxSpin);
    const projected = rotation.get() + velocity * MOMENTUM_WINDOW;
    const detent = clamp(Math.round(projected / pitch), 0, lastIndex) * pitch;
    settleTo(detent, springs.snap, velocity);
  };

  const runTypeahead = React.useCallback(
    (character: string) => {
      if (count === 0) return;
      const state = typeaheadRef.current;
      window.clearTimeout(state.timer);
      state.buffer += character.toLowerCase();
      state.timer = window.setTimeout(() => {
        state.buffer = "";
      }, TYPEAHEAD_MS);
      // A fresh prefix searches from the next row; a growing one re-tests the
      // current row first. The search wraps even though the drum never loops.
      const start =
        state.buffer.length === 1 ? displayRef.current + 1 : displayRef.current;
      for (let step = 0; step < count; step += 1) {
        const idx = (((start + step) % count) + count) % count;
        const option = options[idx];
        if (option && option.label.toLowerCase().startsWith(state.buffer)) {
          moveTo(idx);
          return;
        }
      }
    },
    [count, options, moveTo],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (disabled || count === 0) return;
    switch (event.key) {
      case "ArrowDown":
        moveBy(1);
        break;
      case "ArrowUp":
        moveBy(-1);
        break;
      case "PageDown":
        moveBy(visibleRows);
        break;
      case "PageUp":
        moveBy(-visibleRows);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(lastIndex);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          return;
        }
        if (event.key !== " ") runTypeahead(event.key);
        break;
      }
    }
    event.preventDefault();
  };

  /** A tap or click on any visible row rolls it into the window. */
  const handleRowPress = (idx: number) => {
    if (disabled) return;
    // Keep focus on the listbox — aria-activedescendant only reads from there.
    listRef.current?.focus({ preventScroll: true });
    moveTo(idx);
  };

  const optionId = (index: number) => `${uid}option-${index}`;

  const announceIndex = motionSafe ? clamp(settled, 0, lastIndex) : displayIndex;
  const announcement = count === 0 ? "" : (options[announceIndex]?.label ?? "");

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  // The fixed selection window: hairline rules over a faint accent wash, with
  // side caps that blink once whenever a row lands. Shared by both paths.
  const selectionWindow = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2"
      style={{ height: rowHeight }}
    >
      <div className="absolute inset-0 border-y border-hairline-strong bg-cobalt-wash" />
      <motion.span
        className="absolute top-1/2 left-0 h-[55%] w-0.5 -translate-y-1/2 rounded-r-full bg-cobalt"
        style={{ opacity: capPulse }}
      />
      <motion.span
        className="absolute top-1/2 right-0 h-[55%] w-0.5 -translate-y-1/2 rounded-l-full bg-cobalt"
        style={{ opacity: capPulse }}
      />
    </div>
  );

  // Edge fades — painted masks on the flat frame, never overflow on 3D nodes.
  const edgeFades = (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[16%] bg-linear-to-b from-surface-1 to-surface-1/0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[16%] bg-linear-to-t from-surface-1 to-surface-1/0"
      />
    </>
  );

  const rootClassName = cn(
    "relative",
    width === "auto" && "w-full",
    className,
  );
  const rootStyle = width === "auto" ? undefined : { width };

  const frameClassName = cn(
    "relative isolate w-full overflow-hidden rounded-2 border border-hairline bg-surface-1 select-none",
    RECESS_SHADOW,
    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
    disabled && "opacity-60",
  );

  const listAria = {
    role: "listbox" as const,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-orientation": "vertical" as const,
    "aria-disabled": disabled || undefined,
    "aria-activedescendant": count > 0 ? optionId(displayIndex) : undefined,
    tabIndex: disabled ? -1 : 0,
    onKeyDown: handleKeyDown,
  };

  // Reduced motion: no drum — a flat column of the window's rows with
  // duration-fast swaps and the same listbox semantics and window styling.
  if (!motionSafe) {
    const half = Math.floor(visibleRows / 2);
    const slots: { offset: number; index: number }[] = [];
    for (let offset = -half; offset <= half; offset += 1) {
      const idx = displayIndex + offset;
      if (count === 0 || idx < 0 || idx > lastIndex) continue;
      slots.push({ offset, index: idx });
    }

    return (
      <div className={rootClassName} style={rootStyle}>
        <div ref={frameRef} className={frameClassName} style={{ height }}>
          <ul
            ref={listRef}
            {...listAria}
            className="absolute inset-0 m-0 list-none p-0 outline-none"
          >
            {slots.map(({ offset, index: idx }) => {
              const option = options[idx];
              if (!option) return null;
              const front = idx === displayIndex;
              return (
                <li
                  key={`slot${offset}`}
                  id={optionId(idx)}
                  role="option"
                  aria-selected={front}
                  aria-posinset={idx + 1}
                  aria-setsize={count}
                  tabIndex={-1}
                  onClick={() => handleRowPress(idx)}
                  className={cn(
                    "absolute inset-x-0 flex items-center justify-center",
                    disabled ? "cursor-default" : "cursor-pointer",
                  )}
                  style={{
                    top: `calc(50% + ${offset * rowHeight - rowHeight / 2}px)`,
                    height: rowHeight,
                  }}
                >
                  {/* Keyed by option — a swap remounts and fades, never slides. */}
                  <motion.span
                    key={option.value}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: durations.fast }}
                    className={cn(
                      "block max-w-full truncate px-4 font-mono text-sm tabular-nums transition-colors",
                      front ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {option.label}
                  </motion.span>
                </li>
              );
            })}
          </ul>
          {edgeFades}
          {selectionWindow}
        </div>
        {status}
      </div>
    );
  }

  return (
    <div className={rootClassName} style={rootStyle}>
      {/* The frame is flat (perspective only, no preserve-3d), so it may clip
          vertical bleed and carry the recess shadow, fades, and window; the
          3D stage inside never clips or filters. */}
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          frameClassName,
          "touch-none",
          !disabled && (grabbing ? "cursor-grabbing" : "cursor-grab"),
        )}
        style={{ height, perspective: perspectives.near }}
      >
        {/* The stage: recessed by −radius so the window row sits on the
            screen plane; the only will-change layer. */}
        <ul
          ref={listRef}
          {...listAria}
          className="absolute inset-0 m-0 list-none p-0 outline-none"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateZ(${-radius}px)`,
            willChange: "transform",
          }}
        >
          {options.map((option, i) => (
            <WheelRow
              key={option.value}
              rotation={rotation}
              index={i}
              pitch={pitch}
              radius={radius}
              rowHeight={rowHeight}
              count={count}
              active={i === displayIndex}
              grabbing={grabbing}
              disabled={disabled}
              id={optionId(i)}
              label={option.label}
              onPress={() => handleRowPress(i)}
            />
          ))}
        </ul>
        {edgeFades}
        {selectionWindow}
      </div>
      {status}
    </div>
  );
}

type WheelRowProps = {
  rotation: MotionValue<number>;
  /** This row's fixed spoke on the drum. */
  index: number;
  pitch: number;
  radius: number;
  rowHeight: number;
  count: number;
  active: boolean;
  grabbing: boolean;
  disabled: boolean;
  id: string;
  label: string;
  onPress: () => void;
};

/**
 * One row on the drum. The li carries only the 3D placement (rotateX +
 * translateZ derived from the shared rotation); fade and compression live on
 * a flat inner wrapper, so grouping properties never break the 3D placement.
 * Past the horizon the row stops painting entirely.
 */
function WheelRow({
  rotation,
  index,
  pitch,
  radius,
  rowHeight,
  count,
  active,
  grabbing,
  disabled,
  id,
  label,
  onPress,
}: WheelRowProps) {
  const angle = useTransform(rotation, (deg) => index * pitch - deg);
  const transform = useTransform(
    angle,
    (a) => `rotateX(${-a}deg) translateZ(${radius}px)`,
  );
  const opacity = useTransform(angle, (a) =>
    mapRange(Math.abs(a), 0, FADE_END, 1, 0),
  );
  const scale = useTransform(angle, (a) =>
    mapRange(Math.abs(a), 0, 90, 1, MIN_ROW_SCALE),
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
      tabIndex={-1}
      onClick={onPress}
      className={cn(
        "absolute inset-x-0 top-1/2 flex items-center justify-center",
        disabled ? "cursor-default" : grabbing ? "cursor-grabbing" : "cursor-pointer",
      )}
      style={{
        height: rowHeight,
        marginTop: -rowHeight / 2,
        transform,
        visibility,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <motion.span
        style={{ opacity, scale }}
        className={cn(
          "block max-w-full truncate px-4 font-mono text-sm tabular-nums transition-colors",
          active ? "text-ink" : "text-ink-2",
        )}
      >
        {label}
      </motion.span>
    </motion.li>
  );
}
