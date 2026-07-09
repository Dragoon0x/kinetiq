"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Pointer travel, in px, before a press is treated as a drag rather than a tap. */
const DRAG_THRESHOLD = 3;

export type Tile = {
  id: string;
  content: React.ReactNode;
};

export type TileGridProps = {
  tiles: Tile[];
  /** Grid columns; the reflow moves tiles across rows in steps of this. */
  columns?: number;
  /** Fires with the new id order after every drag or keyboard reorder. */
  onOrderChange?: (ids: string[]) => void;
  className?: string;
  /** Names the reorderable list. */
  "aria-label"?: string;
};

/** Live pointer offset the dragged tile carries while it tracks the cursor. */
type DragState = {
  id: string;
  /** Pointer displacement from the grab point, in px. */
  dx: number;
  dy: number;
  /** Pointer position at grab, to measure the tap-vs-drag threshold. */
  originX: number;
  originY: number;
  pointerId: number;
  /** True once travel crosses the threshold and the lift begins. */
  active: boolean;
};

/** Moves `id` to `to`, returning a new array; a no-op when already there. */
function moveId(order: string[], id: string, to: number): string[] {
  const from = order.indexOf(id);
  if (from === -1) return order;
  const clamped = Math.max(0, Math.min(order.length - 1, to));
  if (from === clamped) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(clamped, 0, id);
  return next;
}

/**
 * A 2D grid whose tiles you drag to reorder while the rest FLIP-reflow into
 * their new slots on `glide`. The dragged tile leaves the layout flow — it
 * scales up, lifts on a stronger hairline and shadow, and tracks the pointer
 * 1:1 via a transform offset — so `layout` never fights the drag; the others
 * glide. The hovered slot is read from live bounding rects each move, and
 * crossing into one splices the order so neighbors part immediately. Keyboard
 * mirrors it: Space/Enter lifts the focused tile (`aria-pressed`), arrows move
 * it a slot or a full row, Home/End jump to the ends, Space/Enter or blur drop,
 * Escape restores the pre-lift order. Every lift, move, drop, and cancel is
 * announced. Reduced motion keeps the interactions 1:1 but tiles snap home with
 * no glide.
 */
export function TileGrid({
  tiles,
  columns = 3,
  onOrderChange,
  className,
  "aria-label": ariaLabel = "Reorderable tiles",
}: TileGridProps) {
  const motionSafe = useMotionSafe();
  const cols = Math.max(1, Math.floor(columns));

  const tileRefs = React.useRef(new Map<string, HTMLDivElement>());
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  /** Order captured at lift, restored on Escape. */
  const liftSnapshot = React.useRef<string[] | null>(null);

  // Order is seeded once from the initial tiles (uncontrolled); later tile
  // props reconcile below so added/removed ids never desync the grid.
  const [order, setOrder] = React.useState<string[]>(() =>
    tiles.map((tile) => tile.id),
  );
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [liftedId, setLiftedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // Internal order is authoritative; unknown ids append in tile order, dropped
  // ids fall away. Derived during render — never written back to state.
  const orderedTiles = React.useMemo(() => {
    const byId = new Map(tiles.map((tile) => [tile.id, tile] as const));
    const kept = order.filter((id) => byId.has(id));
    const seen = new Set(kept);
    for (const tile of tiles) if (!seen.has(tile.id)) kept.push(tile.id);
    return kept.flatMap((id) => {
      const tile = byId.get(id);
      return tile ? [{ id, tile }] : [];
    });
  }, [tiles, order]);
  const orderedIds = React.useMemo(
    () => orderedTiles.map((entry) => entry.id),
    [orderedTiles],
  );

  const commitOrder = React.useCallback(
    (next: string[]) => {
      setOrder(next);
      onOrderChange?.(next);
    },
    [onOrderChange],
  );

  const registerTile = React.useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) tileRefs.current.set(id, el);
      else tileRefs.current.delete(id);
    },
    [],
  );
  const registerButton = React.useCallback(
    (id: string, el: HTMLButtonElement | null) => {
      if (el) buttonRefs.current.set(id, el);
      else buttonRefs.current.delete(id);
    },
    [],
  );

  // Pointer handlers are recreated each render and re-bound in the JSX, so they
  // always close over the current `drag`/`orderedIds` — no ref mirroring, no
  // ref reads or writes during render.
  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.button !== 0 || liftedId !== null || drag) return;
    // Capture so moves keep flowing to this element even past the grid edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      dx: 0,
      dy: 0,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      active: false,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.originX;
    const dy = event.clientY - drag.originY;
    const active = drag.active || Math.hypot(dx, dy) >= DRAG_THRESHOLD;
    setDrag({ ...drag, dx, dy, active });
    if (!active) return;

    // Retarget to whichever tile's center the pointer is nearest; crossing a
    // slot boundary splices the order so the others glide out of the way.
    let nearestId: string | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const id of orderedIds) {
      const rect = tileRefs.current.get(id)?.getBoundingClientRect();
      if (!rect) continue;
      const distance = Math.hypot(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2),
      );
      if (distance < nearest) {
        nearest = distance;
        nearestId = id;
      }
    }
    if (nearestId === null || nearestId === drag.id) return;
    const to = orderedIds.indexOf(nearestId);
    if (to !== -1) commitOrder(moveId(orderedIds, drag.id, to));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A real drag settles the tile home via layout; a tap leaves order alone
    // and lets the click fall through for selection.
    if (drag.active) {
      const position = orderedIds.indexOf(drag.id) + 1;
      setAnnouncement(
        `Dropped ${drag.id} at position ${position} of ${orderedIds.length}`,
      );
    }
    setDrag(null);
  };

  const focusTile = (id: string) => buttonRefs.current.get(id)?.focus();

  // Drops the lifted tile at its current slot and announces the landing. Called
  // from a key press or from blur; both close over the current `orderedIds`.
  const dropLift = (id: string) => {
    const position = orderedIds.indexOf(id) + 1;
    liftSnapshot.current = null;
    setLiftedId(null);
    setAnnouncement(
      `Dropped ${id} at position ${position} of ${orderedIds.length}`,
    );
  };

  const cancelLift = () => {
    if (liftSnapshot.current) commitOrder(liftSnapshot.current);
    liftSnapshot.current = null;
    setLiftedId(null);
    setAnnouncement("Reorder canceled");
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (drag) return;
    const ids = orderedIds;
    const index = ids.indexOf(id);
    if (index === -1) return;
    const n = ids.length;

    if (liftedId === id) {
      let to: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          to = index - 1;
          break;
        case "ArrowRight":
          to = index + 1;
          break;
        case "ArrowUp":
          to = index - cols;
          break;
        case "ArrowDown":
          to = index + cols;
          break;
        case "Home":
          to = 0;
          break;
        case "End":
          to = n - 1;
          break;
        case " ":
        case "Enter":
          event.preventDefault();
          dropLift(id);
          return;
        case "Escape":
          event.preventDefault();
          cancelLift();
          return;
        default:
          return;
      }
      event.preventDefault();
      const clamped = Math.max(0, Math.min(n - 1, to));
      if (clamped !== index) {
        commitOrder(moveId(ids, id, clamped));
        setAnnouncement(`${id}, position ${clamped + 1} of ${n}`);
      }
      // Focus rides with the tile across its move.
      focusTile(id);
      return;
    }

    // Not lifted: Space/Enter picks the tile up.
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      liftSnapshot.current = ids;
      setLiftedId(id);
      setAnnouncement(`Lifted ${id}, position ${index + 1} of ${n}`);
    }
  };

  return (
    <>
      <div
        role="list"
        aria-label={ariaLabel}
        className={cn("grid gap-2", className)}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {orderedTiles.map(({ id, tile }, index) => {
          const isDragging = drag?.id === id && drag.active;
          const isLifted = liftedId === id;
          const raised = isDragging || isLifted;
          return (
            <motion.div
              key={id}
              ref={(el) => registerTile(id, el)}
              role="listitem"
              // The dragged tile is transform-driven and must not also run a
              // layout animation, or the two transforms fight. Everyone else —
              // and the dragged tile once dropped — glides home via FLIP.
              // Reduced motion: no layout prop, so slots snap into place.
              layout={motionSafe && !isDragging}
              // Lift scale is direct manipulation (a `flick` press), so it plays
              // in both modes; only the reflow glide is gated on motionSafe.
              animate={{ scale: raised ? 1.04 : 1 }}
              transition={{
                layout: springs.glide,
                scale: motionSafe ? springs.flick : { duration: 0 },
              }}
              style={
                isDragging
                  ? {
                      x: drag.dx,
                      y: drag.dy,
                      zIndex: 30,
                      position: "relative",
                    }
                  : raised
                    ? { zIndex: 20, position: "relative" }
                    : undefined
              }
            >
              <button
                type="button"
                ref={(el) => registerButton(id, el)}
                aria-label={`Tile ${index + 1} of ${orderedIds.length}: ${id}`}
                aria-pressed={isLifted}
                aria-roledescription="Draggable tile"
                data-dragging={isDragging || undefined}
                data-lifted={isLifted || undefined}
                onPointerDown={(event) => handlePointerDown(event, id)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => handleKeyDown(event, id)}
                onBlur={() => {
                  if (isLifted) dropLift(id);
                }}
                className={cn(
                  "relative flex h-full w-full touch-none items-stretch rounded-3 border text-left select-none",
                  "bg-surface-1 transition-colors",
                  raised
                    ? "border-hairline-strong shadow-raised cursor-grabbing"
                    : "border-hairline cursor-grab hover:border-hairline-strong",
                  isLifted && "ring-2 ring-[var(--ring)]",
                )}
              >
                {tile.content}
              </button>
            </motion.div>
          );
        })}
      </div>
      <span aria-live="assertive" role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
