"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AgendaEvent = {
  id: string;
  title: string;
  /** Minutes from the start of the day. */
  start: number;
  /** Minutes from the start of the day, exclusive. */
  end: number;
  /** Any CSS colour — pass a token, never a hex. Defaults to the cobalt accent. */
  tint?: string;
};

export type AgendaDayProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seeds the day; the agenda owns positions after that and reports via onChange. */
  events: AgendaEvent[];
  /** Visible range as whole hours. @default [8, 18] */
  hours?: [number, number];
  /** Minutes for the now-line. Omit it, or send it out of range, and no line is drawn. */
  now?: number;
  /** Fires with the whole day after a drop or a keyboard nudge. */
  onChange?: (events: AgendaEvent[]) => void;
  /** Fires with the focused event id, or null when focus leaves the day. */
  onActiveChange?: (id: string | null) => void;
  /** Visible label. Omit it and pass `aria-label` to name the day invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** One hour of column. Ten hours fit a phone without a scroll. */
const HOUR_H = 36;
const PX_PER_MIN = HOUR_H / 60;
/** Events land on the quarter hour — the unit a dispatcher actually books in. */
const STEP = 15;
/** Hour labels; narrow enough to leave the column usable at 342px. */
const GUTTER = 26;
/** A quarter-hour block is still worth aiming at. */
const MIN_BLOCK_H = 20;
/** Travel before a press becomes a drag, so a plain click still lands. */
const DRAG_SLOP = 4;

/** Capture throws on a synthetic pointer id; the drag works without it. */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No live pointer to capture — the drag continues unconfined.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

/** Fixed 24-hour clock: a locale lookup during render would not survive hydration. */
const clock = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

type Slot = { col: number; cols: number };

/**
 * Sweeps the day, packing overlapping events into the fewest columns and
 * closing a cluster the moment nothing is still running — so a lone afternoon
 * event takes the full width even when the morning is three deep.
 */
const packColumns = (list: AgendaEvent[]): Map<string, Slot> => {
  const slots = new Map<string, Slot>();
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: string[] = [];
  let colEnds: number[] = [];

  const close = () => {
    for (const id of cluster) {
      const slot = slots.get(id);
      if (slot) slot.cols = colEnds.length;
    }
    cluster = [];
    colEnds = [];
  };

  for (const event of sorted) {
    if (colEnds.length > 0 && event.start >= Math.max(...colEnds)) close();
    let col = colEnds.findIndex((end) => end <= event.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(event.end);
    } else {
      colEnds[col] = event.end;
    }
    slots.set(event.id, { col, cols: 1 });
    cluster.push(event.id);
  }
  close();
  return slots;
};

/**
 * A day, drawn on its hours. Events arrive a `step` from the gutter in
 * `cascade()` order on `glide` — the spring for a layout settling into place —
 * so a full morning reads as one sweep rather than five separate blinks.
 * Overlapping events share the column between them and re-divide it as an
 * event is moved out of the pile. The now-line creeps down on `drift`, driven
 * by the `now` prop rather than the wall clock, so the day renders the same on
 * the server as in the browser.
 *
 * Dragging a block tracks the pointer 1:1 while the grid re-divides in quarter
 * hours underneath it, then the block settles onto its quarter hour on `snap`:
 * one crisp overshoot to say the time is committed. The pointer is captured
 * only after 4px of travel — capturing on pointerdown would swallow the click
 * a tap is made of.
 *
 * Every event is a button whose name reads its title and both times. Up and
 * Down move the focused event a quarter hour, Page Up and Page Down an hour,
 * Left and Right walk between events, Home and End jump to the first and last;
 * each move is announced politely. Under reduced motion events simply appear
 * and land without travel — the times still change, because the time is the
 * information.
 */
export function AgendaDay({
  ref,
  events,
  hours = [8, 18],
  now,
  onChange,
  onActiveChange,
  label,
  className,
  "aria-label": ariaLabel,
}: AgendaDayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;

  const [startHour, endHour] = hours;
  const dayStart = startHour * 60;
  const dayEnd = Math.max(endHour, startHour + 1) * 60;
  const bandCount = Math.round((dayEnd - dayStart) / 60);
  const gridH = bandCount * HOUR_H;

  const clampEvent = React.useCallback(
    (event: AgendaEvent): AgendaEvent => {
      const span = Math.max(STEP, event.end - event.start);
      const start = Math.min(
        Math.max(Math.round(event.start), dayStart),
        dayEnd - span,
      );
      return { ...event, start, end: start + span };
    },
    [dayStart, dayEnd],
  );

  const [items, setItems] = React.useState<AgendaEvent[]>(() =>
    events.map(clampEvent),
  );
  /**
   * Where each block's box is nailed down. Every move after that is a
   * transform off this origin, so nothing animates `top` and the springs stay
   * on the compositor.
   */
  const [origin] = React.useState(
    () => new Map(events.map((event) => [event.id, event.start])),
  );

  const [drag, setDrag] = React.useState<{
    id: string;
    dy: number;
    start: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const dragRef = React.useRef<{
    id: string;
    pointerId: number;
    startY: number;
    from: number;
    engaged: boolean;
  } | null>(null);
  const blockRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const snapStart = (event: AgendaEvent, minutes: number) => {
    const span = event.end - event.start;
    const stepped = Math.round(minutes / STEP) * STEP;
    return Math.min(Math.max(stepped, dayStart), dayEnd - span);
  };

  /** Committed day, plus the quarter hour a live drag is pointing at. */
  const shown = drag
    ? items.map((event) =>
        event.id === drag.id
          ? {
              ...event,
              start: drag.start,
              end: drag.start + (event.end - event.start),
            }
          : event,
      )
    : items;
  const slots = packColumns(shown);

  const commit = (id: string, start: number) => {
    const target = items.find((event) => event.id === id);
    if (!target || target.start === start) return;
    const next = items.map((event) =>
      event.id === id
        ? clampEvent({
            ...event,
            start,
            end: start + (event.end - event.start),
          })
        : event,
    );
    setItems(next);
    // Reported from the handler that caused it — a parent callback fired from
    // inside an updater would run during another component's render.
    onChange?.(next);
    const moved = next.find((event) => event.id === id);
    if (moved) {
      setAnnouncement(
        `${moved.title} ${clock(moved.start)} to ${clock(moved.end)}.`,
      );
    }
  };

  const nudge = (event: AgendaEvent, deltaMinutes: number) => {
    commit(event.id, snapStart(event, event.start + deltaMinutes));
  };

  const focusBlock = (index: number) => {
    const clamped = Math.min(items.length - 1, Math.max(0, index));
    blockRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (
    keyEvent: React.KeyboardEvent<HTMLButtonElement>,
    event: AgendaEvent,
    index: number,
  ) => {
    switch (keyEvent.key) {
      case "ArrowUp":
        keyEvent.preventDefault();
        nudge(event, -STEP);
        break;
      case "ArrowDown":
        keyEvent.preventDefault();
        nudge(event, STEP);
        break;
      case "PageUp":
        keyEvent.preventDefault();
        nudge(event, -60);
        break;
      case "PageDown":
        keyEvent.preventDefault();
        nudge(event, 60);
        break;
      case "ArrowLeft":
        keyEvent.preventDefault();
        focusBlock(index - 1);
        break;
      case "ArrowRight":
        keyEvent.preventDefault();
        focusBlock(index + 1);
        break;
      case "Home":
        keyEvent.preventDefault();
        focusBlock(0);
        break;
      case "End":
        keyEvent.preventDefault();
        focusBlock(items.length - 1);
        break;
      default:
        break;
    }
  };

  const startDrag = (
    pointerEvent: React.PointerEvent<HTMLButtonElement>,
    event: AgendaEvent,
  ) => {
    // A second finger must not steal a drag already under way.
    if (pointerEvent.button !== 0 || dragRef.current?.engaged) return;
    dragRef.current = {
      id: event.id,
      pointerId: pointerEvent.pointerId,
      startY: pointerEvent.clientY,
      from: event.start,
      engaged: false,
    };
  };

  const moveDrag = (pointerEvent: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    if (!grip || grip.pointerId !== pointerEvent.pointerId) return;
    const dy = pointerEvent.clientY - grip.startY;
    if (!grip.engaged) {
      if (Math.abs(dy) <= DRAG_SLOP) return;
      grip.engaged = true;
      capturePointer(pointerEvent.currentTarget, pointerEvent.pointerId);
    }
    const event = items.find((entry) => entry.id === grip.id);
    if (!event) return;
    setDrag({
      id: grip.id,
      dy,
      start: snapStart(event, grip.from + dy / PX_PER_MIN),
    });
  };

  const endDrag = (pointerEvent: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    releasePointer(pointerEvent.currentTarget, pointerEvent.pointerId);
    dragRef.current = null;
    const landed = drag;
    setDrag(null);
    if (!grip?.engaged || !landed) return;
    commit(grip.id, landed.start);
  };

  const cancelDrag = (pointerEvent: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(pointerEvent.currentTarget, pointerEvent.pointerId);
    dragRef.current = null;
    setDrag(null);
  };

  const nowY = now === undefined ? null : (now - dayStart) * PX_PER_MIN;
  const nowVisible = nowY !== null && nowY >= 0 && nowY <= gridH;
  const step = cascade(items.length);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        {nowVisible ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] text-signal tabular-nums">
            <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            {clock(now ?? 0)}
          </span>
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Up and Down move the event a quarter hour, Page Up and Page Down an
        hour, Left and Right move between events.
      </p>

      <div className="relative flex" style={{ height: gridH }}>
        <div className="relative shrink-0" style={{ width: GUTTER }}>
          {Array.from({ length: bandCount }, (_, band) => (
            <span
              key={band}
              className="absolute left-0 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
              style={{ top: band * HOUR_H + 2 }}
            >
              {String(startHour + band).padStart(2, "0")}
            </span>
          ))}
        </div>

        <div
          role="group"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : ariaLabel}
          className="relative min-w-0 flex-1"
        >
          {Array.from({ length: bandCount + 1 }, (_, line) => (
            <span
              key={line}
              aria-hidden
              className="absolute inset-x-0 h-px bg-hairline"
              style={{ top: Math.min(line * HOUR_H, gridH - 1) }}
            />
          ))}

          {items.map((event, index) => {
            const dragging = drag?.id === event.id;
            const slot = slots.get(event.id) ?? { col: 0, cols: 1 };
            const span = event.end - event.start;
            const base = origin.get(event.id) ?? event.start;
            const y =
              (event.start - base) * PX_PER_MIN + (dragging ? drag.dy : 0);
            const readStart = dragging ? drag.start : event.start;
            const height = Math.max(MIN_BLOCK_H, span * PX_PER_MIN);
            const tint = event.tint ?? "var(--accent-bright)";
            const delay = index * step;

            return (
              <motion.button
                key={event.id}
                ref={(node) => {
                  blockRefs.current[index] = node;
                }}
                type="button"
                aria-label={`${event.title}, ${clock(readStart)} to ${clock(
                  readStart + span,
                )}`}
                aria-describedby={hintId}
                onFocus={() => onActiveChange?.(event.id)}
                onBlur={() => onActiveChange?.(null)}
                onKeyDown={(keyEvent) => handleKeyDown(keyEvent, event, index)}
                onPointerDown={(pointerEvent) => startDrag(pointerEvent, event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                initial={
                  motionSafe
                    ? { opacity: 0, x: -distances.step }
                    : { opacity: 0, x: 0 }
                }
                animate={{
                  opacity: 1,
                  x: 0,
                  y,
                  scale: dragging && motionSafe ? 1.02 : 1,
                }}
                transition={{
                  // Tracking is 1:1 while the pointer is down; the settle onto
                  // the quarter hour is the only part with physics.
                  y: dragging || !motionSafe ? { duration: 0 } : springs.snap,
                  x: motionSafe
                    ? { ...springs.glide, delay }
                    : { duration: 0, delay },
                  opacity: {
                    duration: motionSafe ? durations.base : durations.fast,
                    ease: easings.enter,
                    delay,
                  },
                  scale: motionSafe ? springs.flick : { duration: 0 },
                }}
                style={{
                  top: (base - dayStart) * PX_PER_MIN,
                  height,
                  left: `${(slot.col / slot.cols) * 100}%`,
                  width: `calc(${100 / slot.cols}% - 3px)`,
                  zIndex: dragging ? 2 : 1,
                  background: `color-mix(in oklab, ${tint} 18%, transparent)`,
                  borderColor: `color-mix(in oklab, ${tint} 45%, transparent)`,
                  borderLeftColor: tint,
                  touchAction: "none",
                  // Only the column division tweens; it is secondary to the
                  // block's own travel and never fights the spring on y.
                  transition: motionSafe
                    ? "left 240ms cubic-bezier(0.65,0,0.35,1), width 240ms cubic-bezier(0.65,0,0.35,1), box-shadow 150ms linear"
                    : "box-shadow 150ms linear",
                }}
                className={cn(
                  "absolute flex flex-col justify-center overflow-hidden rounded-2 border border-l-[3px] px-1.5 text-left outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  dragging
                    ? "cursor-grabbing shadow-lg"
                    : "cursor-grab hover:shadow-md",
                )}
              >
                <span
                  title={event.title}
                  className="truncate text-[11px] leading-tight font-medium text-foreground"
                >
                  {event.title}
                </span>
                {height >= 32 ? (
                  <span className="truncate font-mono text-[10px] leading-tight text-ink-3 tabular-nums">
                    {clock(readStart)}–{clock(readStart + span)}
                  </span>
                ) : null}
              </motion.button>
            );
          })}

          {nowVisible ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ zIndex: 3 }}
              initial={false}
              animate={{ y: nowY }}
              transition={motionSafe ? springs.drift : { duration: 0 }}
            >
              <span className="absolute inset-x-0 h-px bg-signal" />
              <span className="absolute -top-[2.5px] -left-1 size-1.5 rounded-full bg-signal" />
            </motion.span>
          ) : null}
        </div>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
