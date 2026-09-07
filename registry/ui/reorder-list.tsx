"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReorderItem = {
  id: string;
  label: string;
  /** Trailing note — a count, an owner, a duration. */
  meta?: string;
};

export type ReorderListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seeds the order; the list owns it after that and reports through onReorder. */
  items: ReorderItem[];
  /** Fires with the whole list once a row is dropped, never mid-move. */
  onReorder?: (items: ReorderItem[]) => void;
  /** Replaces the row's content. The row keeps its height either way. */
  renderItem?: (item: ReorderItem) => React.ReactNode;
  /** Visible list label. */
  label: string;
  className?: string;
};

/** Travel before a press becomes a drag, so a plain click still lands. */
const DRAG_SLOP = 4;
/** Rows share one height, so the row under the pointer is never ambiguous. */
const ROW_H = 44;
const ROW_GAP = 6;
const PITCH = ROW_H + ROW_GAP;

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

const clampIndex = (value: number, last: number) =>
  Math.min(Math.max(value, 0), Math.max(last, 0));

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (from === to) return list;
  const next = list.slice();
  const [held] = next.splice(from, 1);
  if (held === undefined) return list;
  next.splice(to, 0, held);
  return next;
};

/**
 * A list you rearrange by hand. The row under the pointer lifts — 1.02 and a
 * raised edge on `flick`, quick enough to read as the grab itself — then tracks
 * the pointer 1:1 while the rows it passes slide out of its way on `glide`, the
 * spring for a layout settling somewhere new. Letting go settles the row into
 * its slot on `snap`: one crisp overshoot that says the place is committed.
 *
 * The pointer is captured only after 4px of travel. Capturing on pointerdown
 * would swallow the click a tap is made of, and every row here is also a button.
 *
 * Space lifts the focused row, Up and Down move it, Home and End send it to the
 * ends, Space drops it and Escape puts it back where it started; each step is
 * announced politely, so the move is followable without seeing it. Under reduced
 * motion nothing travels: rows swap places as the pointer crosses them, because
 * the order is the information.
 */
export function ReorderList({
  ref,
  items,
  onReorder,
  renderItem,
  label,
  className,
}: ReorderListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;

  const [order, setOrder] = React.useState<ReorderItem[]>(items);
  /** Live pointer drag: raw travel plus the slot it currently points at. */
  const [drag, setDrag] = React.useState<{
    id: string;
    dy: number;
    from: number;
    to: number;
  } | null>(null);
  /** A keyboard lift holds the order it started from, so Escape can restore it. */
  const [lifted, setLifted] = React.useState<{
    id: string;
    restore: ReorderItem[];
  } | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const dragRef = React.useRef<{
    id: string;
    pointerId: number;
    startY: number;
    from: number;
    engaged: boolean;
  } | null>(null);
  const rowRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const last = order.length - 1;
  /** What the list shows right now: the committed order plus any live drag. */
  const shown = drag ? moveItem(order, drag.from, drag.to) : order;
  const heldId = drag?.id ?? lifted?.id ?? null;
  const tabbableId = focusedId ?? shown[0]?.id ?? null;

  const say = (item: ReorderItem, verb: string, index: number) => {
    setAnnouncement(
      `${item.label} ${verb} position ${index + 1} of ${order.length}.`,
    );
  };

  const commit = (next: ReorderItem[], changed: boolean) => {
    setOrder(next);
    // Reported from the handler, after the state that caused it — a parent
    // callback fired inside an updater runs during another render.
    if (changed) onReorder?.(next);
  };

  const focusRow = (index: number) => {
    rowRefs.current[clampIndex(index, last)]?.focus();
  };

  const lift = (item: ReorderItem, index: number) => {
    setLifted({ id: item.id, restore: order });
    say(item, "lifted at", index);
  };

  const moveLifted = (from: number, to: number) => {
    const target = clampIndex(to, last);
    const item = shown[from];
    if (!item || target === from) return;
    setOrder(moveItem(order, from, target));
    say(item, "moved to", target);
  };

  const drop = (item: ReorderItem, index: number) => {
    const restore = lifted?.restore;
    setLifted(null);
    const changed =
      !!restore && restore.some((row, at) => row.id !== order[at]?.id);
    if (changed) onReorder?.(order);
    say(item, "dropped at", index);
  };

  const cancel = (item: ReorderItem) => {
    const restore = lifted?.restore;
    setLifted(null);
    if (!restore) return;
    setOrder(restore);
    setAnnouncement(
      `Move cancelled. ${item.label} back at position ${
        restore.findIndex((row) => row.id === item.id) + 1
      } of ${restore.length}.`,
    );
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: ReorderItem,
    index: number,
  ) => {
    const held = lifted?.id === item.id;
    switch (event.key) {
      case " ":
        // A button fires click on Space keyup and scrolls the page meanwhile;
        // taking the key here keeps the lift from doing both.
        event.preventDefault();
        if (held) drop(item, index);
        else lift(item, index);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (held) moveLifted(index, index - 1);
        else focusRow(index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        if (held) moveLifted(index, index + 1);
        else focusRow(index + 1);
        break;
      case "Home":
        event.preventDefault();
        if (held) moveLifted(index, 0);
        else focusRow(0);
        break;
      case "End":
        event.preventDefault();
        if (held) moveLifted(index, last);
        else focusRow(last);
        break;
      case "Escape":
        if (!held) break;
        event.preventDefault();
        cancel(item);
        break;
      default:
        break;
    }
  };

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    // A second finger must not steal a drag already under way.
    if (event.button !== 0 || lifted || dragRef.current?.engaged) return;
    const item = shown[index];
    if (!item) return;
    dragRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      from: index,
      engaged: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    if (!grip || grip.pointerId !== event.pointerId) return;
    const dy = event.clientY - grip.startY;
    if (!grip.engaged) {
      if (Math.abs(dy) <= DRAG_SLOP) return;
      grip.engaged = true;
      capturePointer(event.currentTarget, event.pointerId);
    }
    setDrag({
      id: grip.id,
      dy,
      from: grip.from,
      to: clampIndex(grip.from + Math.round(dy / PITCH), last),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    setDrag(null);
    if (!grip?.engaged) return;
    const to = clampIndex(
      grip.from + Math.round((event.clientY - grip.startY) / PITCH),
      last,
    );
    const item = order[grip.from];
    if (!item) return;
    commit(moveItem(order, grip.from, to), to !== grip.from);
    say(item, "dropped at", to);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Drag to order
        </span>
      </div>

      <p id={hintId} className="sr-only">
        Press Space to lift the row, Up and Down to move it, Space to drop it,
        Escape to put it back.
      </p>

      <ul
        aria-labelledby={labelId}
        className="flex flex-col"
        style={{ gap: ROW_GAP }}
      >
        {shown.map((item, index) => {
          const isHeld = heldId === item.id;
          const dragging = drag?.id === item.id;
          // The row's slot has already moved to `to`; the offset walks it back
          // to the pointer, so the two changes cancel and the row reads as
          // continuous while the rows around it re-flow.
          const offset =
            dragging && motionSafe
              ? drag.dy - (drag.to - drag.from) * PITCH
              : 0;

          return (
            <motion.li
              key={item.id}
              layout={motionSafe && !dragging ? "position" : false}
              transition={springs.glide}
              className={cn("relative", isHeld && "z-10")}
            >
              <motion.button
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                type="button"
                aria-pressed={lifted?.id === item.id}
                aria-describedby={hintId}
                tabIndex={item.id === tabbableId ? 0 : -1}
                onFocus={() => setFocusedId(item.id)}
                onBlur={() => {
                  // Focus leaving mid-lift drops the row where it stands
                  // rather than stranding the list in a held state.
                  if (lifted?.id === item.id) drop(item, index);
                }}
                onKeyDown={(event) => handleKeyDown(event, item, index)}
                onPointerDown={(event) => startDrag(event, index)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                animate={{ y: offset, scale: isHeld && motionSafe ? 1.02 : 1 }}
                transition={{
                  // Tracking is 1:1 while the pointer is down; the settle is
                  // the only part with physics.
                  y: dragging ? { duration: 0 } : springs.snap,
                  scale: motionSafe ? springs.flick : { duration: 0 },
                }}
                style={{ height: ROW_H, touchAction: "none" }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2 border px-2.5 text-left transition-[background-color,border-color,box-shadow] outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isHeld
                    ? "cursor-grabbing border-cobalt-bright bg-surface-0 shadow-lg"
                    : "cursor-grab border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
                )}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isHeld ? "text-cobalt-bright" : "text-ink-3",
                  )}
                  fill="currentColor"
                >
                  <circle cx="6" cy="4" r="1.15" />
                  <circle cx="10" cy="4" r="1.15" />
                  <circle cx="6" cy="8" r="1.15" />
                  <circle cx="10" cy="8" r="1.15" />
                  <circle cx="6" cy="12" r="1.15" />
                  <circle cx="10" cy="12" r="1.15" />
                </svg>

                {renderItem ? (
                  <span className="min-w-0 flex-1">{renderItem(item)}</span>
                ) : (
                  <>
                    <span
                      title={item.label}
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                    >
                      {item.label}
                    </span>
                    {item.meta ? (
                      <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                        {item.meta}
                      </span>
                    ) : null}
                  </>
                )}

                <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
                  {index + 1}
                </span>
              </motion.button>
            </motion.li>
          );
        })}
      </ul>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
