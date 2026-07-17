"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PopoverMenuItem = {
  /** Stable id — also the React key. */
  id: string;
  label: React.ReactNode;
  /** Optional leading glyph, rendered muted. */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Fires on activation; the menu then closes and returns focus to the trigger. */
  onSelect?: () => void;
};

type Side = "top" | "bottom";
type Align = "start" | "end";

export type PopoverMenuProps = {
  ref?: React.Ref<HTMLButtonElement>;
  /** The menu rows. */
  items: PopoverMenuItem[];
  /** Trigger label / content. */
  children: React.ReactNode;
  /** Preferred side; flips to the other when the viewport is tight. @default "bottom" */
  side?: Side;
  /** Preferred horizontal edge to anchor to; flips on overflow. @default "start" */
  align?: Align;
  /** Accessible name for the menu surface; defaults to the trigger's label. */
  label?: string;
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Extra classes for the floating panel. */
  menuClassName?: string;
};

function firstEnabled(items: PopoverMenuItem[]): number {
  return items.findIndex((item) => !item.disabled);
}

function lastEnabled(items: PopoverMenuItem[]): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!items[i]?.disabled) return i;
  }
  return -1;
}

/** Next non-disabled index from `from`, wrapping, in direction `dir`. */
function stepEnabled(
  items: PopoverMenuItem[],
  from: number,
  dir: 1 | -1,
): number {
  const n = items.length;
  if (n === 0) return from;
  let i = from;
  for (let step = 0; step < n; step += 1) {
    i = (i + dir + n) % n;
    if (!items[i]?.disabled) return i;
  }
  return from;
}

/**
 * A trigger-anchored menu that unfolds from the button on `snap`. A small arrow
 * tracks the trigger, and the panel flips side or alignment when the viewport
 * runs short so it never spills off-screen. Full menu semantics: roving arrow
 * keys, Home/End, type-to-open on ArrowDown, Escape and outside-click close,
 * and focus returns to the trigger on select. Under reduced motion it swaps in
 * without the unfold or the row cascade.
 */
export function PopoverMenu({
  ref,
  items,
  children,
  side = "bottom",
  align = "start",
  label,
  disabled = false,
  className,
  menuClassName,
}: PopoverMenuProps) {
  const motionSafe = useMotionSafe();
  const menuId = React.useId();
  const triggerId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [placement, setPlacement] = React.useState<{
    side: Side;
    align: Align;
    arrow: number;
  }>({ side, align, arrow: 18 });

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.RefObject<HTMLButtonElement | null>).current = node;
    }
  };

  const close = React.useCallback((focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // On open, measure the panel and flip side/alignment if the viewport is
  // tight. Guarded so the correction settles instead of re-triggering.
  React.useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let nextSide: Side = side;
    if (
      side === "bottom" &&
      vh - t.bottom < p.height + margin &&
      t.top > vh - t.bottom
    ) {
      nextSide = "top";
    }
    if (
      side === "top" &&
      t.top < p.height + margin &&
      vh - t.bottom > t.top
    ) {
      nextSide = "bottom";
    }

    let nextAlign: Align = align;
    if (align === "start" && t.left + p.width > vw - margin) nextAlign = "end";
    if (align === "end" && t.right - p.width < margin) nextAlign = "start";

    const arrow = Math.max(14, Math.min(t.width / 2, p.width - 14));

    setPlacement((prev) =>
      prev.side === nextSide && prev.align === nextAlign && prev.arrow === arrow
        ? prev
        : { side: nextSide, align: nextAlign, arrow },
    );
  }, [open, side, align]);

  // On open, aim focus at the first enabled row once the panel has committed.
  // The state write lives in the rAF callback, not the effect body, so it never
  // cascades synchronously through the render.
  React.useEffect(() => {
    if (!open) return;
    const first = firstEnabled(items);
    const target = first === -1 ? 0 : first;
    const frame = window.requestAnimationFrame(() => {
      setActive(target);
      itemRefs.current[target]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, items]);

  // Outside-click and Escape dismissal while open.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const focusIndex = (index: number) => {
    if (index < 0) return;
    setActive(index);
    itemRefs.current[index]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusIndex(stepEnabled(items, active, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        focusIndex(stepEnabled(items, active, -1));
        break;
      case "Home":
        event.preventDefault();
        focusIndex(firstEnabled(items));
        break;
      case "End":
        event.preventDefault();
        focusIndex(lastEnabled(items));
        break;
      case "Tab":
        // Let focus flow onward; just retire the surface.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const activate = (item: PopoverMenuItem) => {
    if (item.disabled) return;
    item.onSelect?.();
    close(true);
  };

  const sideClass =
    placement.side === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const alignClass = placement.align === "start" ? "left-0" : "right-0";
  const originX =
    placement.align === "start"
      ? `${placement.arrow}px`
      : `calc(100% - ${placement.arrow}px)`;
  const originY = placement.side === "bottom" ? "0%" : "100%";

  const arrowStyle: React.CSSProperties =
    placement.align === "start"
      ? { left: placement.arrow - 5 }
      : { right: placement.arrow - 5 };
  const arrowSideClass =
    placement.side === "bottom"
      ? "-top-[5px] border-t border-l"
      : "-bottom-[5px] border-r border-b";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={setTriggerRef}
        type="button"
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "border-hairline bg-surface-1 text-ink inline-flex items-center gap-2 rounded-2 border px-3 py-2 text-sm font-medium",
          "hover:bg-surface-2 focus-visible:ring-cobalt-bright/50 transition-colors focus-visible:ring-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {children}
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={cn(
            "text-ink-3 transition-transform duration-200",
            open && "rotate-180",
          )}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={label}
            aria-labelledby={label ? undefined : triggerId}
            aria-orientation="vertical"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            style={{ transformOrigin: `${originX} ${originY}` }}
            initial={
              motionSafe
                ? {
                    opacity: 0,
                    scale: 0.94,
                    y: placement.side === "bottom" ? -4 : 4,
                  }
                : { opacity: 0 }
            }
            animate={
              motionSafe
                ? {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    transition: {
                      scale: springs.snap,
                      y: springs.snap,
                      opacity: { duration: durations.fast, ease: easings.enter },
                    },
                  }
                : { opacity: 1, transition: { duration: durations.fast } }
            }
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.97 : 1,
              transition: exitFor(durations.fast),
            }}
            className={cn(
              "bg-popover text-popover-foreground border-border absolute z-50 min-w-[11rem] rounded-3 border p-1 shadow-lg",
              sideClass,
              alignClass,
              menuClassName,
            )}
          >
            <span
              aria-hidden
              style={arrowStyle}
              className={cn(
                "bg-popover border-border absolute h-2.5 w-2.5 rotate-45",
                arrowSideClass,
              )}
            />
            {items.map((item, index) => (
              <motion.button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={active === index ? 0 : -1}
                data-active={active === index}
                disabled={item.disabled}
                onClick={() => activate(item)}
                onMouseEnter={() => {
                  if (!item.disabled) setActive(index);
                }}
                initial={
                  motionSafe
                    ? { opacity: 0, x: placement.align === "start" ? -6 : 6 }
                    : false
                }
                animate={
                  motionSafe
                    ? {
                        opacity: 1,
                        x: 0,
                        transition: {
                          delay: index * cascade(items.length),
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { opacity: 1 }
                }
                className={cn(
                  "text-ink relative z-10 flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left text-sm",
                  "hover:bg-surface-2 data-[active=true]:bg-surface-2 focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                {item.icon && (
                  <span className="text-ink-3 grid size-4 shrink-0 place-items-center [&_svg]:size-4">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
