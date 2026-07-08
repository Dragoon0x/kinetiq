"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IrisMenuItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive tint for dangerous actions. */
  destructive?: boolean;
};

type Quadrant = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type IrisMenuProps = {
  /** Up to six actions seated along the bloom arc. */
  items: IrisMenuItem[];
  /** "auto" picks the roomiest viewport quadrant when opening. */
  placement?: "auto" | Quadrant;
  /** Distance from the trigger center to each seat, in px. */
  radius?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  triggerIcon?: React.ReactNode;
  className?: string;
};

/** Arc start/end angles per quadrant (degrees, 0 = east, CCW positive). */
const ARCS: Record<Quadrant, [number, number]> = {
  "top-right": [10, 80],
  "top-left": [100, 170],
  "bottom-left": [190, 260],
  "bottom-right": [280, 350],
};

/**
 * Actions bloom from where you pressed: items launch from the trigger's
 * center to seats along the freest quadrant's arc with a radial cascade,
 * and fold back into the center on close. Arrow keys rotate focus around
 * the ring.
 */
export function IrisMenu({
  items,
  placement = "auto",
  radius = 84,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  label = "Quick actions",
  triggerIcon,
  className,
}: IrisMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const [quadrant, setQuadrant] = React.useState<Quadrant>("top-right");
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = React.useId();

  const visible = items.slice(0, 6);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (!next) triggerRef.current?.focus();
    },
    [controlledOpen, onOpenChange],
  );

  const toggle = () => {
    if (!open && placement === "auto") {
      // Event-driven measurement: pick the quadrant with the most room.
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const roomLeft = cx;
        const roomRight = window.innerWidth - cx;
        const roomTop = cy;
        const roomBottom = window.innerHeight - cy;
        const horizontal = roomRight >= roomLeft ? "right" : "left";
        const vertical = roomTop >= roomBottom ? "top" : "bottom";
        setQuadrant(`${vertical}-${horizontal}` as Quadrant);
      }
    } else if (placement !== "auto") {
      setQuadrant(placement);
    }
    setOpen(!open);
  };

  // Focus the first item when the bloom opens.
  const onRingRef = (node: HTMLButtonElement | null, index: number) => {
    itemRefs.current[index] = node;
    if (node && index === 0 && open) node.focus();
  };

  // Click outside closes.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  const seatFor = (index: number) => {
    const [start, end] = ARCS[quadrant];
    const count = Math.max(visible.length - 1, 1);
    const angle = start + ((end - start) * index) / count;
    const rad = (angle * Math.PI) / 180;
    // Screen coordinates: +y is down, so CCW-positive angles negate y.
    return { x: Math.cos(rad) * radius, y: -Math.sin(rad) * radius };
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const focusables = itemRefs.current.filter(Boolean);
    const current = focusables.findIndex(
      (el) => el === document.activeElement,
    );
    const move = (delta: number) => {
      const next =
        (current + delta + focusables.length) % focusables.length;
      focusables[next]?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        focusables[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        focusables[focusables.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  const interval = cascade(visible.length);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={toggle}
        className="bg-primary text-primary-foreground relative z-10 flex size-11 items-center justify-center rounded-full shadow-md"
      >
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          className="flex items-center justify-center"
          aria-hidden
        >
          {triggerIcon ?? <Plus className="size-5" />}
        </motion.span>
      </button>

      <AnimatePresence>
        {open ? (
          <div
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="absolute top-1/2 left-1/2 z-20"
          >
            {visible.map((item, index) => {
              const seat = seatFor(index);
              return (
                <motion.button
                  key={item.id}
                  ref={(node) => onRingRef(node, index)}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  initial={
                    motionSafe
                      ? { x: 0, y: 0, scale: 0.4, opacity: 0 }
                      : { x: seat.x, y: seat.y, opacity: 0 }
                  }
                  animate={{
                    x: seat.x,
                    y: seat.y,
                    scale: 1,
                    opacity: 1,
                    transition: motionSafe
                      ? { ...springs.snap, delay: index * interval }
                      : { duration: durations.fast },
                  }}
                  exit={{
                    x: motionSafe ? 0 : seat.x,
                    y: motionSafe ? 0 : seat.y,
                    scale: motionSafe ? 0.4 : 1,
                    opacity: 0,
                    transition: {
                      ...exitFor(durations.base),
                      delay:
                        (visible.length - 1 - index) * (interval / 2),
                    },
                  }}
                  whileHover={motionSafe ? { scale: 1.05 } : undefined}
                  whileFocus={motionSafe ? { scale: 1.05 } : undefined}
                  className={cn(
                    "group bg-popover border-border absolute -top-4.5 -left-4.5 flex size-9 items-center justify-center rounded-full border shadow-sm",
                    "hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-40",
                    item.destructive &&
                      "text-destructive border-destructive/40",
                  )}
                >
                  <span aria-hidden className="[&>svg]:size-4">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "text-muted-foreground pointer-events-none absolute top-full mt-1 font-mono text-[10px] tracking-wide uppercase opacity-0 transition-opacity duration-150",
                      "group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    {item.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
