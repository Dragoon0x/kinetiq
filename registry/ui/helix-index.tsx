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
import { clamp, mapRange, snapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Only the first 12 items wind onto the helix — past that the coil crowds. */
const MAX_ITEMS = 12;
/** Pointer travel → rotation, degrees per px — either axis winds the coil. */
const DRAG_PER_PX = 0.5;
/** Pointer travel (px) before a press becomes a wind — protects chip taps. */
const DRAG_THRESHOLD = 4;
/** Release momentum is projected this many seconds past the finger. */
const MOMENTUM_WINDOW = 0.25;
/** A fling carries at most this many items past the release detent. */
const MAX_CARRY = 2;
/** Springy give past the ends of the coil, in degrees — the rail never loops. */
const OVERDRAG = 12;
/** Accumulated wheel delta that equals one notch — one item. */
const WHEEL_NOTCH = 50;
/** Wheel input is rate-limited to one item per this many ms. */
const WHEEL_LOCK_MS = 140;
/** Idle gap (ms) after which the wheel accumulator resets. */
const WHEEL_IDLE_MS = 250;
/** Render window: chips beyond this angular distance stay mounted, unpainted. */
const WINDOW_DEG = 200;
/** Dots tracing the helical rail behind the chips — the fixed spiral guide. */
const GUIDE_DOTS = 20;
/** Depth envelope: rear chips recede, the front chip sits slightly proud. */
const BACK_SCALE = 0.62;
const FRONT_SCALE = 1.05;
const BACK_OPACITY = 0.15;

const DEG = Math.PI / 180;

/** Chip tone: selected wears the accent wash, the reading slot an accent hairline. */
const chipTone = (front: boolean, pressed: boolean): string =>
  pressed
    ? "border-[var(--accent-bright)] bg-[var(--accent-wash)]"
    : front
      ? "border-[var(--accent)] bg-surface-2"
      : "border-hairline bg-surface-2";

type DragState = {
  pointerId: number;
  /** Press origin — measures the tap threshold. */
  startX: number;
  startY: number;
  /** Last pointer position, for per-move deltas. */
  lastX: number;
  lastY: number;
  /** Last move timestamp (ms), for angular velocity. */
  lastT: number;
  /** Smoothed velocity in deg/s; positive winds toward higher items. */
  velocity: number;
  engaged: boolean;
};

export type HelixItem = {
  /** Stable identity — also the payload of `onSelect`. */
  id: string;
  /** Chip face and the voice of the announcements. */
  label: string;
  /** Small annotation, visible only at the reading position. */
  hint?: string;
};

export type HelixIndexProps = {
  /** Index entries on the coil (5–12; the first 12 are used). */
  items: HelixItem[];
  /** Controlled selection (`null` = nothing selected). */
  value?: string | null;
  /** Initial selection for uncontrolled usage — also seats the coil there. */
  defaultValue?: string | null;
  /** Fires with the item id whenever the front item is activated. */
  onSelect?: (id: string) => void;
  /** Horizontal swing of the coil, px. @default 96 */
  radius?: number;
  /** Vertical rise per item, px — the travel half of the coupling. @default 34 */
  pitch?: number;
  /** Angle per item, degrees — the detent grid. @default 40 */
  stepDeg?: number;
  /** Stage height, px (the reduced-motion list flows naturally). @default 260 */
  height?: number;
  className?: string;
  /** Accessible name for the group. @default "Helix index" */
  "aria-label"?: string;
};

/**
 * An index wound on a helix — rotate to read, click to jump. One rotation
 * motion value R (degrees) is the single source of truth: item k derives its
 * pose via `useTransform` off R — angle `a = k·step − R`, `x = sin(a)·radius`,
 * depth `cos(a)`, and THE COUPLING: `y = (k − R/step)·pitch`, so winding the
 * coil also travels it vertically one item-height per step. The rail itself is
 * rotation-invariant — the exact parametric curve the aria-hidden guide dots
 * trace around the center mast — so chips slide along a fixed spiral and the
 * front-facing item is always mid-stage, at the reading position: accent
 * hairline, full opacity, its hint uncovered. Depth chains scale
 * (0.62 → 1.05), opacity (0.15 → 1), z-order, and pointer-events (back half
 * inert) off `cos(a)`; chips beyond ±200° stay mounted but unpainted.
 *
 * Drag (either axis, 0.5°/px) winds live with a ±12° give past the ends;
 * release projects the smoothed velocity ~250ms ahead (carry capped at ±2
 * items) and snaps the nearest detent on `springs.snap`, seeded with that
 * velocity. A hand-bound non-passive wheel listener steps one item per notch —
 * it exists only over the control, so the page never loses its scroll.
 *
 * Semantics: every chip is a real `<button>` with `aria-pressed`
 * (single-select toggle). Roving tabindex keeps exactly one tab stop — the
 * front chip. ArrowDown/Right wind to the next detent on `snap`,
 * ArrowUp/Left back, Home/End glide the full coil, Enter/Space activate the
 * focused (front) chip. Clicking the front chip selects; clicking any other
 * visible chip winds it to front on `springs.glide`. An sr-only polite region
 * reads the label on settle and "label selected" on select. The roving chip is
 * exempt from the render window so keyboard focus never sits on a hidden node.
 *
 * Reduced motion: no coil — a flat vertical list of the same buttons (index,
 * label, hint all readable) with identical roving order, selection, and
 * announcements; arrows move focus instantly.
 *
 * Cleanup: the wheel listener and any in-flight snap/glide are torn down on
 * unmount. No rAF loops and no ambient motion — this instrument only moves
 * when handled. Selection, roving, and announcements are written only from
 * event handlers and animation callbacks, never effect bodies.
 */
export function HelixIndex({
  items,
  value: valueProp,
  defaultValue = null,
  onSelect,
  radius = 96,
  pitch = 34,
  stepDeg = 40,
  height = 260,
  className,
  "aria-label": ariaLabel = "Helix index",
}: HelixIndexProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const roster = items.slice(0, MAX_ITEMS);
  const count = roster.length;
  const lastIndex = Math.max(0, count - 1);

  // Selection: controlled or uncontrolled, toggled only from activations.
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue);
  const selected = valueProp !== undefined ? valueProp : uncontrolledValue;

  // The coil seats on the initial selection so a preselected item fronts.
  const [initialIndex] = React.useState(() => {
    const initial = valueProp !== undefined ? valueProp : defaultValue;
    if (initial == null) return 0;
    const index = items.findIndex((item) => item.id === initial);
    return index >= 0 && index < MAX_ITEMS ? index : 0;
  });

  /** The one source of truth: coil rotation in degrees (item k fronts at k·step). */
  const rotation = useMotionValue(initialIndex * stepDeg);
  /** Roving index mirrored as a motion value — keeps the focused chip painted. */
  const rovingMv = useMotionValue<number>(initialIndex);

  /** Live nearest-detent index — the reading position. */
  const [active, setActive] = React.useState(initialIndex);
  /** The single tab stop; follows the front through every interaction. */
  const [rovingIndex, setRovingIndex] = React.useState(initialIndex);
  const [announcement, setAnnouncement] = React.useState("");
  const [grabbing, setGrabbing] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const chipRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  /** The detent the coil last settled on or is heading to, in degrees. */
  const targetRef = React.useRef(initialIndex * stepDeg);
  const activeRef = React.useRef(initialIndex);
  const rovingRef = React.useRef(initialIndex);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const indexForDeg = (deg: number): number =>
    clamp(Math.round(deg / stepDeg), 0, lastIndex);

  // Live front index: nearest detent of the rotation, deduped (event callback,
  // never an effect body — the house pattern for state off a motion value).
  useMotionValueEvent(rotation, "change", (deg) => {
    const next = indexForDeg(deg);
    if (next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
  });

  const registerChip = (id: string, node: HTMLButtonElement | null) => {
    const map = chipRefs.current;
    if (node) map.set(id, node);
    else map.delete(id);
  };

  /** True while focus already lives inside the instrument — never steal it. */
  const rootHasFocus = (): boolean => {
    const root = rootRef.current;
    return root !== null && root.contains(document.activeElement);
  };

  /**
   * Move the tab stop (state for tabIndex, motion value for the render-window
   * exemption, ref for effects). Focusing writes visibility inline first —
   * motion flushes styles next frame, and a hidden node cannot take focus.
   */
  const syncRoving = (index: number, opts?: { focus?: boolean }) => {
    rovingRef.current = index;
    rovingMv.set(index);
    setRovingIndex(index);
    if (!opts?.focus) return;
    const item = roster[index];
    const node = item ? chipRefs.current.get(item.id) : undefined;
    if (!node) return;
    if (motionSafe) {
      node.style.visibility = "visible";
      node.focus({ preventScroll: true });
    } else {
      node.focus();
    }
  };

  /** Wind to a detent; every settle announces its label from onComplete. */
  const settleTo = (detent: number, transition: Transition, velocity?: number) => {
    targetRef.current = detent;
    controlsRef.current?.stop();
    controlsRef.current = animate(rotation, detent, {
      ...transition,
      ...(velocity === undefined ? null : { velocity }),
      onComplete: () => {
        const item = roster[indexForDeg(detent)];
        if (item) setAnnouncement(item.label);
      },
    });
  };

  const windTo = (index: number, transition: Transition, focus: boolean) => {
    if (count === 0) return;
    const next = clamp(index, 0, lastIndex);
    settleTo(next * stepDeg, transition);
    syncRoving(next, { focus });
  };

  /** One detent over — stacks from the in-flight target so taps accumulate. */
  const stepBy = (dir: 1 | -1, focus: boolean) => {
    if (count === 0) return;
    const anchor = clamp(Math.round(targetRef.current / stepDeg), 0, lastIndex);
    windTo(anchor + dir, springs.snap, focus);
  };

  /** Flat-path move: instant, focused, announced. */
  const moveInstant = (index: number) => {
    const next = clamp(index, 0, lastIndex);
    const item = roster[next];
    if (!item) return;
    syncRoving(next, { focus: true });
    setAnnouncement(item.label);
  };

  /** Activation: the front item selects (toggle); any other chip winds front. */
  const handleActivate = (item: HelixItem, index: number) => {
    if (motionSafe && index !== active) {
      windTo(index, springs.glide, false);
      return;
    }
    const next = selected === item.id ? null : item.id;
    if (valueProp === undefined) setUncontrolledValue(next);
    onSelect?.(item.id);
    setAnnouncement(next === null ? item.label : `${item.label} selected`);
  };

  /** Focus carries the tab stop; Enter/Space then activate natively. */
  const handleChipFocus = (index: number) => {
    rovingRef.current = index;
    rovingMv.set(index);
    setRovingIndex(index);
  };

  const handleChipKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        if (motionSafe) stepBy(1, true);
        else moveInstant(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        if (motionSafe) stepBy(-1, true);
        else moveInstant(index - 1);
        break;
      case "Home":
        if (motionSafe) windTo(0, springs.glide, true);
        else moveInstant(0);
        break;
      case "End":
        if (motionSafe) windTo(lastIndex, springs.glide, true);
        else moveInstant(lastIndex);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // --- drag: wind live, snap a detent on release (coil mode only) ----------
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Seizing the coil interrupts any snap or glide in flight.
    controlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
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
      const travel = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (travel < DRAG_THRESHOLD) return;
      // Crossed the threshold — a wind, not a tap. Capture now so clean taps
      // on chips still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    // Drag up or left winds forward — the next chip climbs to the reading slot.
    const dDeg = -(dx + dy) * DRAG_PER_PX;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      drag.velocity = drag.velocity * 0.4 + (dDeg / dt) * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    rotation.set(
      clamp(rotation.get() + dDeg, -OVERDRAG, lastIndex * stepDeg + OVERDRAG),
    );
  };

  const settleDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    fling: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its chip.
    setGrabbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const anchor = clamp(
      snapAngle(rotation.get(), stepDeg),
      0,
      lastIndex * stepDeg,
    );
    let detent = anchor;
    let velocity: number | undefined;
    if (fling) {
      // Momentum capped at ±2 items: clamp the release velocity so the
      // projection can never carry farther, then snap with that velocity.
      const maxSpin = (MAX_CARRY * stepDeg) / MOMENTUM_WINDOW;
      velocity = clamp(drag.velocity, -maxSpin, maxSpin);
      const projected = rotation.get() + velocity * MOMENTUM_WINDOW;
      detent = clamp(
        clamp(
          snapAngle(projected, stepDeg),
          anchor - MAX_CARRY * stepDeg,
          anchor + MAX_CARRY * stepDeg,
        ),
        0,
        lastIndex * stepDeg,
      );
    }
    settleTo(detent, springs.snap, velocity);
    // The tab stop tracks the new front; focus follows only if already inside.
    syncRoving(indexForDeg(detent), { focus: fling && rootHasFocus() });
  };

  // Wheel: one notch = one item. React's onWheel is passive, so the
  // non-passive listener is bound by hand — on the control only, which is the
  // whole hijack boundary; elsewhere the page scrolls untouched. The step goes
  // through a ref so the listener binds once per mode/roster.
  const wheelStepRef = React.useRef<(dir: 1 | -1) => void>(() => {});
  React.useEffect(() => {
    wheelStepRef.current = (dir) => stepBy(dir, rootHasFocus());
  });

  React.useEffect(() => {
    if (!motionSafe || count === 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = { acc: 0, steppedAt: 0, lastAt: 0 };
    const handleWheel = (event: WheelEvent) => {
      if (dragRef.current?.engaged) return;
      event.preventDefault();
      if (event.timeStamp - wheel.lastAt > WHEEL_IDLE_MS) wheel.acc = 0;
      wheel.lastAt = event.timeStamp;
      if (event.timeStamp - wheel.steppedAt < WHEEL_LOCK_MS) return;
      // deltaMode 1 is line-based (Firefox) — normalize toward pixels.
      wheel.acc += event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      if (Math.abs(wheel.acc) < WHEEL_NOTCH) return;
      const dir = wheel.acc > 0 ? 1 : -1;
      wheel.acc = 0;
      wheel.steppedAt = event.timeStamp;
      wheelStepRef.current(dir);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [motionSafe, count]);

  // Re-seat the coil when the 3D path (re)mounts or the detent grid changes —
  // the flat path may have moved the roving item while this one was away.
  // Motion-value ops only, never setState.
  React.useEffect(() => {
    if (!motionSafe || count === 0) return;
    controlsRef.current?.stop();
    const detent = clamp(rovingRef.current, 0, lastIndex) * stepDeg;
    targetRef.current = detent;
    rotation.jump(detent);
  }, [motionSafe, count, lastIndex, stepDeg, rotation]);

  // A snap or glide in flight must never outlive the component.
  React.useEffect(() => () => controlsRef.current?.stop(), []);

  const tabStop = clamp(rovingIndex, 0, lastIndex);

  // The helical guide: ~20 dots along the exact curve the chips ride —
  // rotation slides chips ALONG this rail, so the rail itself never moves.
  const guide: { x: number; y: number; depth: number }[] = [];
  for (let i = 0; i < GUIDE_DOTS; i += 1) {
    const a = -WINDOW_DEG + (i / (GUIDE_DOTS - 1)) * (2 * WINDOW_DEG);
    guide.push({
      x: Math.sin(a * DEG) * radius,
      y: (a / stepDeg) * pitch,
      depth: Math.cos(a * DEG),
    });
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={ariaLabel}
      className={cn("relative w-full", className)}
    >
      {motionSafe ? (
        <div
          ref={stageRef}
          className={cn(
            "relative isolate w-full touch-none overflow-hidden rounded-3 border border-hairline bg-surface-1 select-none",
            grabbing ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => settleDrag(event, true)}
          onPointerCancel={(event) => settleDrag(event, false)}
        >
          {/* Center mast + helical rail guide — pure ornament, fixed in place. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-hairline-strong" />
            {guide.map((dot, i) => (
              <span
                key={i}
                className="absolute top-1/2 left-1/2 size-1 rounded-full bg-hairline-strong"
                style={{
                  transform: `translate(-50%, -50%) translate(${dot.x}px, ${dot.y}px) scale(${mapRange(dot.depth, -1, 1, 0.5, 1).toFixed(3)})`,
                  opacity: mapRange(dot.depth, -1, 1, 0.25, 0.9),
                }}
              />
            ))}
          </div>

          {roster.map((item, index) => (
            <HelixChip
              // Remount when the geometry changes so every useTransform
              // closure stays bound to fresh numbers.
              key={`${item.id}:${index}:${radius}:${pitch}:${stepDeg}`}
              item={item}
              index={index}
              stepDeg={stepDeg}
              radius={radius}
              pitch={pitch}
              rotation={rotation}
              roving={rovingMv}
              front={index === active}
              pressed={selected === item.id}
              tabStop={index === tabStop}
              register={registerChip}
              onActivate={() => handleActivate(item, index)}
              onChipFocus={() => handleChipFocus(index)}
              onChipKeyDown={(event) => handleChipKeyDown(event, index)}
            />
          ))}

          {/* Edge dissolves — the coil travels out through these, not a hard clip. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-[110] h-[18%] bg-linear-to-b from-surface-1 to-surface-1/0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[110] h-[18%] bg-linear-to-t from-surface-1 to-surface-1/0"
          />
        </div>
      ) : (
        /* Reduced motion: the index flattens — same buttons, roving order,
           selection, and announcements as plain rows; every hint readable. */
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {roster.map((item, index) => (
            <li key={item.id}>
              <button
                ref={(node) => registerChip(item.id, node)}
                type="button"
                aria-pressed={selected === item.id}
                tabIndex={index === tabStop ? 0 : -1}
                onClick={() => handleActivate(item, index)}
                onFocus={() => handleChipFocus(index)}
                onKeyDown={(event) => handleChipKeyDown(event, index)}
                className={cn(
                  "flex w-full cursor-pointer items-baseline gap-2 rounded-2 border px-2.5 py-1 text-left transition-colors duration-200",
                  selected === item.id
                    ? "border-[var(--accent-bright)] bg-[var(--accent-wash)] text-ink"
                    : "border-hairline bg-surface-2 text-ink-2 hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em] whitespace-nowrap">
                  {item.label}
                </span>
                {item.hint ? (
                  <span
                    aria-hidden
                    className="ml-auto min-w-0 truncate text-[10px] text-ink-3"
                  >
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Polite announcer: label on settle, "label selected" on select. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type HelixChipProps = {
  item: HelixItem;
  /** This chip's fixed rung on the coil. */
  index: number;
  stepDeg: number;
  radius: number;
  pitch: number;
  rotation: MotionValue<number>;
  /** Roving index as a motion value — the focused chip is never unpainted. */
  roving: MotionValue<number>;
  front: boolean;
  pressed: boolean;
  tabStop: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onChipFocus: () => void;
  onChipKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One chip on the coil. Pose is pure derivation off the shared rotation:
 * angle a = k·step − R, x = sin(a)·radius, y = (k − R/step)·pitch — the
 * coupling that makes winding also travel — with scale, opacity, z-order,
 * and pointer-events chained off depth = cos(a). The back half goes inert;
 * beyond ±200° the chip stays mounted but unpainted, except while it holds
 * the roving tab stop. No per-frame setState anywhere.
 */
function HelixChip({
  item,
  index,
  stepDeg,
  radius,
  pitch,
  rotation,
  roving,
  front,
  pressed,
  tabStop,
  register,
  onActivate,
  onChipFocus,
  onChipKeyDown,
}: HelixChipProps) {
  const angle = useTransform(rotation, (deg) => index * stepDeg - deg);
  const x = useTransform(angle, (a) => Math.sin(a * DEG) * radius);
  const y = useTransform(rotation, (deg) => (index - deg / stepDeg) * pitch);
  const depth = useTransform(angle, (a) => Math.cos(a * DEG));
  const scale = useTransform(depth, (d) =>
    mapRange(d, -1, 1, BACK_SCALE, FRONT_SCALE),
  );
  const opacity = useTransform(depth, (d) => mapRange(d, -1, 1, BACK_OPACITY, 1));
  const zIndex = useTransform(depth, (d) => Math.round((d + 1) * 50) + 1);
  const pointerEvents = useTransform(depth, (d): string =>
    d < 0 ? "none" : "auto",
  );
  const visibility = useTransform(
    [rotation, roving],
    ([deg = 0, rov = -1]: number[]) =>
      Math.abs(index * stepDeg - deg) <= WINDOW_DEG || rov === index
        ? "visible"
        : "hidden",
  );

  return (
    <motion.button
      ref={(node) => register(item.id, node)}
      type="button"
      aria-pressed={pressed}
      tabIndex={tabStop ? 0 : -1}
      onClick={onActivate}
      onFocus={onChipFocus}
      onKeyDown={onChipKeyDown}
      transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
      className={cn(
        "absolute top-1/2 left-1/2 inline-flex cursor-pointer flex-col items-start rounded-2 border px-2.5 py-1 transition-colors duration-200",
        chipTone(front, pressed),
      )}
      style={{ x, y, scale, opacity, zIndex, pointerEvents, visibility }}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          aria-hidden
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.08em] whitespace-nowrap",
            front || pressed ? "text-ink" : "text-ink-2",
          )}
        >
          {item.label}
        </span>
      </span>
      {item.hint ? (
        <span
          aria-hidden
          className={cn(
            "text-[10px] leading-tight whitespace-nowrap text-ink-3 transition-opacity duration-200",
            front ? "opacity-100" : "opacity-0",
          )}
        >
          {item.hint}
        </span>
      ) : null}
    </motion.button>
  );
}
