"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  Reorder,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Reach of the cursor's distance field along the dock's main axis, in px. */
const FIELD_RADIUS = 120;
/** Perpendicular lift gained per unit of scale, in px. */
const LIFT_PER_SCALE = 12;
/** Sentinel for "no pointer near the dock". */
const NO_POINTER = Number.POSITIVE_INFINITY;
/** `springs.glide`, shaped as a `useSpring` smoothing config. */
const GLIDE_SMOOTHING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};

export type DockItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
};

export type MagnetDockProps = {
  items: DockItem[];
  orientation?: "horizontal" | "vertical";
  /** Peak scale of the icon directly under the pointer (or focused). */
  magnify?: number;
  /** Enables pointer-drag and keyboard (Space) reordering. */
  reorderable?: boolean;
  /** Fires with the new id order after every drag or keyboard move. */
  onReorder?: (order: string[]) => void;
  /** Accessible name for the toolbar. */
  label?: string;
  className?: string;
};

/**
 * Icons that feel the cursor coming. A shared pointer MotionValue feeds a
 * cosine distance field: within 120px each icon swells toward `magnify` and
 * lifts in proportion, smoothed per-icon with `glide` springs entirely on the
 * compositor. Focus magnifies without a pointer; leaving relaxes everything
 * back. Dragging lifts an icon (scale 1.1) while neighbors part on `recoil`,
 * and the drop snaps home on `snap`. Keyboard: arrows rove focus, Space lifts,
 * arrows move a slot on `glide`, Space drops, Escape cancels — all announced
 * via a polite live region. Reduced motion drops the magnification for a
 * simple 2px raise; reordering stays 1:1 with instant slot shifts.
 */
export function MagnetDock({
  items,
  orientation = "horizontal",
  magnify = 1.6,
  reorderable = false,
  onReorder,
  label = "Dock",
  className,
}: MagnetDockProps) {
  const motionSafe = useMotionSafe();
  const horizontal = orientation === "horizontal";
  const peakScale = Math.max(1, magnify);

  const groupRef = React.useRef<HTMLUListElement | null>(null);
  const liRefs = React.useRef(new Map<string, HTMLLIElement>());
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pointerInside = React.useRef(false);
  const dragEndedAt = React.useRef(Number.NEGATIVE_INFINITY);
  const liftSnapshot = React.useRef<string[] | null>(null);

  /** Pointer position along the main axis, relative to the dock. */
  const pointer = useMotionValue(NO_POINTER);

  const [order, setOrder] = React.useState<string[]>(() =>
    items.map((item) => item.id),
  );
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [droppedId, setDroppedId] = React.useState<string | null>(null);
  const [liftedId, setLiftedId] = React.useState<string | null>(null);
  const [tabStop, setTabStop] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // Internal order is authoritative for slots; unknown ids append in item order.
  const orderedItems = React.useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const kept = order.filter((id) => byId.has(id));
    const seen = new Set(kept);
    for (const item of items) if (!seen.has(item.id)) kept.push(item.id);
    return kept.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }, [items, order]);
  const orderedIds = React.useMemo(
    () => orderedItems.map((item) => item.id),
    [orderedItems],
  );

  const fallbackTab = orderedItems.find((item) => item.active)?.id ?? orderedIds[0];
  const tabStopId =
    tabStop !== null && orderedIds.includes(tabStop) ? tabStop : fallbackTab;

  const labelOf = (id: string) =>
    items.find((item) => item.id === id)?.label ?? "Item";

  const commitOrder = (next: string[]) => {
    setOrder(next);
    onReorder?.(next);
  };

  /** Centers the field on an item (layout coords, immune to transforms). */
  const focusField = (id: string | null) => {
    if (!motionSafe) return;
    const el = id === null ? undefined : liRefs.current.get(id);
    if (!el) {
      pointer.set(NO_POINTER);
      return;
    }
    pointer.set(
      horizontal
        ? el.offsetLeft + el.offsetWidth / 2
        : el.offsetTop + el.offsetHeight / 2,
    );
  };

  const registerLi = React.useCallback(
    (id: string, el: HTMLLIElement | null) => {
      if (el) liRefs.current.set(id, el);
      else liRefs.current.delete(id);
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

  const focusItem = (id: string) => {
    setTabStop(id);
    buttonRefs.current.get(id)?.focus();
  };

  const cancelLift = () => {
    if (liftSnapshot.current) commitOrder(liftSnapshot.current);
    liftSnapshot.current = null;
    setLiftedId(null);
    setAnnouncement("Reorder cancelled");
    focusField(null);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLUListElement>) => {
    pointerInside.current = true;
    if (!motionSafe || draggingId !== null || liftedId !== null) return;
    const rect = groupRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointer.set(
      horizontal ? event.clientX - rect.left : event.clientY - rect.top,
    );
  };

  const handlePointerLeave = () => {
    pointerInside.current = false;
    if (focusedId !== null && liftedId === null) focusField(focusedId);
    else pointer.set(NO_POINTER);
  };

  const handleItemFocus = (id: string) => {
    setFocusedId(id);
    setTabStop(id);
    if (liftedId === null && !pointerInside.current) focusField(id);
  };

  const handleItemBlur = (id: string) => {
    setFocusedId((current) => (current === id ? null : current));
    if (liftedId === id) cancelLift();
    if (!pointerInside.current) pointer.set(NO_POINTER);
  };

  const handleSelect = (id: string) => {
    // A drop is not a click: swallow the click that trails a drag release.
    if (performance.now() - dragEndedAt.current < 250) return;
    items.find((item) => item.id === id)?.onSelect?.();
  };

  const handleDragStart = (id: string) => {
    setDraggingId(id);
    setDroppedId(null);
    setHoveredId(null);
    pointer.set(NO_POINTER);
  };

  const handleDragEnd = (id: string) => {
    setDraggingId(null);
    setDroppedId(id);
    dragEndedAt.current = performance.now();
  };

  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const prevKey = horizontal ? "ArrowLeft" : "ArrowUp";
    const nextKey = horizontal ? "ArrowRight" : "ArrowDown";
    const index = orderedIds.indexOf(id);

    if (liftedId === id) {
      if (event.key === prevKey || event.key === nextKey) {
        event.preventDefault();
        const to = index + (event.key === nextKey ? 1 : -1);
        if (to < 0 || to >= orderedIds.length) return;
        const next = [...orderedIds];
        next.splice(index, 1);
        next.splice(to, 0, id);
        commitOrder(next);
        setAnnouncement(
          `${labelOf(id)} moved to position ${to + 1} of ${next.length}`,
        );
      } else if (event.key === " ") {
        event.preventDefault();
        liftSnapshot.current = null;
        setLiftedId(null);
        setAnnouncement(
          `Dropped ${labelOf(id)} at position ${index + 1} of ${orderedIds.length}`,
        );
        focusField(id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelLift();
      }
      return;
    }

    if (event.key === prevKey || event.key === nextKey) {
      event.preventDefault();
      const target = orderedIds[index + (event.key === nextKey ? 1 : -1)];
      if (target) focusItem(target);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = orderedIds[0];
      if (first) focusItem(first);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = orderedIds[orderedIds.length - 1];
      if (last) focusItem(last);
    } else if (event.key === " " && reorderable) {
      event.preventDefault();
      liftSnapshot.current = orderedIds;
      setLiftedId(id);
      setDroppedId(null);
      setAnnouncement(
        `Lifted ${labelOf(id)}. Arrow keys move, Space drops, Escape cancels.`,
      );
      focusField(null);
    }
  };

  return (
    <>
      <Reorder.Group
        ref={groupRef}
        axis={horizontal ? "x" : "y"}
        values={orderedIds}
        onReorder={(next: string[]) => commitOrder(next)}
        role="toolbar"
        aria-label={label}
        aria-orientation={orientation}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "bg-card/80 border-border relative flex border backdrop-blur",
          horizontal
            ? "flex-row gap-1 rounded-4 px-2 py-1.5"
            : "flex-col gap-1 rounded-4 px-1.5 py-2",
          className,
        )}
      >
        {orderedItems.map((item) => (
          <DockIconItem
            key={item.id}
            item={item}
            horizontal={horizontal}
            magnify={peakScale}
            motionSafe={motionSafe}
            reorderable={reorderable}
            pointer={pointer}
            isTabStop={item.id === tabStopId}
            isLifted={liftedId === item.id}
            isDragging={draggingId === item.id}
            justDropped={droppedId === item.id}
            othersDragging={draggingId !== null && draggingId !== item.id}
            showTooltip={
              (hoveredId === item.id || focusedId === item.id) &&
              draggingId === null
            }
            registerLi={registerLi}
            registerButton={registerButton}
            onHover={setHoveredId}
            onItemFocus={handleItemFocus}
            onItemBlur={handleItemBlur}
            onItemKeyDown={handleItemKeyDown}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </Reorder.Group>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}

type DockIconItemProps = {
  item: DockItem;
  horizontal: boolean;
  magnify: number;
  motionSafe: boolean;
  reorderable: boolean;
  pointer: MotionValue<number>;
  isTabStop: boolean;
  isLifted: boolean;
  isDragging: boolean;
  justDropped: boolean;
  othersDragging: boolean;
  showTooltip: boolean;
  registerLi: (id: string, el: HTMLLIElement | null) => void;
  registerButton: (id: string, el: HTMLButtonElement | null) => void;
  onHover: (id: string | null) => void;
  onItemFocus: (id: string) => void;
  onItemBlur: (id: string) => void;
  onItemKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => void;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string) => void;
};

function DockIconItem({
  item,
  horizontal,
  magnify,
  motionSafe,
  reorderable,
  pointer,
  isTabStop,
  isLifted,
  isDragging,
  justDropped,
  othersDragging,
  showTooltip,
  registerLi,
  registerButton,
  onHover,
  onItemFocus,
  onItemBlur,
  onItemKeyDown,
  onSelect,
  onDragStart,
  onDragEnd,
}: DockIconItemProps) {
  const liRef = React.useRef<HTMLLIElement | null>(null);

  // Distance from the shared pointer, in layout coordinates (offsetLeft is
  // immune to the transforms the magnification itself applies).
  const targetScale = useTransform(pointer, (p: number) => {
    const el = liRef.current;
    if (!el || !Number.isFinite(p)) return 1;
    const center = horizontal
      ? el.offsetLeft + el.offsetWidth / 2
      : el.offsetTop + el.offsetHeight / 2;
    const distance = Math.abs(p - center);
    if (distance >= FIELD_RADIUS) return 1;
    // Cosine falloff: full magnify under the pointer, easing to 1 at the edge.
    return 1 + (magnify - 1) * ((1 + Math.cos((distance / FIELD_RADIUS) * Math.PI)) / 2);
  });
  const scale = useSpring(targetScale, GLIDE_SMOOTHING);
  const lift = useTransform(
    scale,
    (s) => (s - 1) * LIFT_PER_SCALE * (horizontal ? -1 : 1),
  );

  return (
    <Reorder.Item
      ref={(el: HTMLLIElement | null) => {
        liRef.current = el;
        registerLi(item.id, el);
      }}
      // The group is a toolbar, not a list; the button inside carries semantics.
      role="none"
      value={item.id}
      dragListener={reorderable}
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={() => onDragEnd(item.id)}
      whileDrag={motionSafe ? { scale: 1.1 } : undefined}
      animate={{ scale: motionSafe && isLifted ? 1.1 : 1 }}
      transition={
        !motionSafe
          ? { duration: 0 }
          : isDragging || justDropped
            ? springs.snap
            : othersDragging
              ? springs.recoil
              : springs.glide
      }
      className={cn("relative", (isDragging || isLifted) && "z-10")}
    >
      <motion.div
        className={horizontal ? "origin-bottom" : "origin-left"}
        style={
          motionSafe
            ? horizontal
              ? { scale, y: lift }
              : { scale, x: lift }
            : undefined
        }
        animate={
          motionSafe
            ? undefined
            : horizontal
              ? { y: showTooltip ? -2 : 0 }
              : { x: showTooltip ? 2 : 0 }
        }
        transition={{ duration: durations.fast }}
      >
        <button
          type="button"
          ref={(el) => {
            registerButton(item.id, el);
          }}
          tabIndex={isTabStop ? 0 : -1}
          aria-label={item.label}
          aria-pressed={item.active === true}
          className={cn(
            "text-foreground hover:bg-accent flex size-9 items-center justify-center rounded-2",
            (isDragging || isLifted) && "bg-secondary",
            isDragging && motionSafe && "shadow-lg",
          )}
          onClick={() => onSelect(item.id)}
          onPointerEnter={() => onHover(item.id)}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onItemFocus(item.id)}
          onBlur={() => onItemBlur(item.id)}
          onKeyDown={(event) => onItemKeyDown(event, item.id)}
        >
          <span aria-hidden className="pointer-events-none">
            {item.icon}
          </span>
        </button>
      </motion.div>

      <AnimatePresence>
        {showTooltip && (
          <motion.span
            aria-hidden
            initial={
              motionSafe
                ? horizontal
                  ? { opacity: 0, y: distances.nudge }
                  : { opacity: 0, x: -distances.nudge }
                : { opacity: 0 }
            }
            animate={horizontal ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            style={horizontal ? { x: "-50%" } : { y: "-50%" }}
            className={cn(
              "bg-popover text-popover-foreground border-border pointer-events-none absolute z-20 rounded-2 border px-2 py-1 text-xs whitespace-nowrap",
              horizontal
                ? cn("bottom-full left-1/2", motionSafe ? "mb-8" : "mb-2")
                : cn("left-full top-1/2", motionSafe ? "ml-8" : "ml-2"),
            )}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {item.active && (
          <motion.span
            aria-hidden
            className={cn(
              "bg-primary absolute size-1 rounded-full",
              horizontal ? "-bottom-1 left-1/2" : "top-1/2 -left-1",
            )}
            style={horizontal ? { x: "-50%" } : { y: "-50%" }}
            initial={motionSafe ? { scale: 0.5, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? springs.recoil : { duration: durations.fast }}
          />
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}
