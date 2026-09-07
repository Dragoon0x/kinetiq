"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CanopyLink = { label: string; href: string };

export type CanopyColumn = { heading: string; links: CanopyLink[] };

export type CanopyItem = {
  id: string;
  label: string;
  columns: CanopyColumn[];
};

export type CanopyMenuProps = {
  /** The bar and the panel behind each item. */
  items: CanopyItem[];
  /** Hover intent delay in ms before an unopened panel unfolds. @default 80 */
  openDelay?: number;
  /** Accessible name for the nav. @default "Site" */
  label?: string;
  /** Fires with the open item's id, or null when the panel closes. */
  onOpenChange?: (id: string | null) => void;
  className?: string;
};

/** Column width; two fit a 342px viewport and three fit the doc column. */
const COLUMN = "w-28";

/**
 * A mega menu that stays one panel. Hovering or focusing an item unfolds the
 * canopy beneath the bar — scaleY from the top on `glide`, clipped — and its
 * columns cascade in inside the 600ms budget. Moving to another item morphs
 * the same panel to the new content's measured width and height rather than
 * closing and reopening, which is why the panel's contents are laid out
 * absolutely: their natural size is measured free of the box that is chasing
 * them.
 *
 * The bar is a roving tabindex of `aria-expanded` buttons over one region:
 * Left and Right walk the bar, Home and End jump to its ends, Enter and Space
 * toggle, Tab steps down into the open panel, and Escape closes and hands
 * focus back to the item it came from. A closed panel is inert, so nothing
 * behind it can be tabbed into. Under reduced motion the panel simply appears
 * and the columns arrive with it.
 */
export function CanopyMenu({
  items,
  openDelay = 80,
  label = "Site",
  onOpenChange,
  className,
}: CanopyMenuProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;

  const [openId, setOpenId] = React.useState<string | null>(null);
  // The panel keeps rendering the last item it showed, so closing does not
  // empty it mid-fade and its size stays where the eye left it.
  const [shownId, setShownId] = React.useState(items[0]?.id ?? "");
  const [morph, setMorph] = React.useState(false);
  // Bumped on every open so the columns remount and cascade again, rather than
  // sitting where the last opening left them.
  const [seq, setSeq] = React.useState(0);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [barWidth, setBarWidth] = React.useState(0);

  const wrapRef = React.useRef<HTMLElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<number | null>(null);
  // Escape refocuses the trigger; without this the trigger's own focus handler
  // would open the panel again on the way out.
  const escaping = React.useRef(false);

  const shown = items.find((item) => item.id === shownId) ?? items[0];

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setBarWidth(node.getBoundingClientRect().width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  React.useEffect(() => clearTimer, []);

  const open = (id: string) => {
    clearTimer();
    if (id === openId) return;
    // Only a panel already on screen morphs; one arriving sizes itself first.
    setMorph(openId !== null);
    setShownId(id);
    setOpenId(id);
    setSeq((count) => count + 1);
    onOpenChange?.(id);
  };

  const close = () => {
    clearTimer();
    if (openId === null) return;
    setOpenId(null);
    onOpenChange?.(null);
  };

  const hover = (id: string) => {
    clearTimer();
    if (openId !== null) {
      open(id);
      return;
    }
    timer.current = window.setTimeout(() => open(id), openDelay);
  };

  const focusAt = (index: number): CanopyItem | undefined => {
    const wrapped = (index + items.length) % items.length;
    const item = items[wrapped];
    if (!item) return undefined;
    setFocusIndex(wrapped);
    document.getElementById(`${baseId}-item-${item.id}`)?.focus();
    return item;
  };

  const walk = (index: number) => {
    const next = focusAt(index);
    if (next && openId !== null) open(next.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const item = items[index];
    switch (event.key) {
      // An open panel follows the bar: arrowing along it morphs the canopy
      // instead of closing one and unfolding another.
      case "ArrowRight":
        event.preventDefault();
        walk(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        walk(index - 1);
        break;
      case "Home":
        event.preventDefault();
        walk(0);
        break;
      case "End":
        event.preventDefault();
        walk(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        escaping.current = true;
        close();
        if (item) document.getElementById(`${baseId}-item-${item.id}`)?.focus();
        escaping.current = false;
        break;
      default:
        break;
    }
  };

  // Escape anywhere in the panel returns to the item that opened it.
  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    escaping.current = true;
    close();
    if (openId) document.getElementById(`${baseId}-item-${openId}`)?.focus();
    escaping.current = false;
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    close();
  };

  const columns = shown?.columns ?? [];
  const step = cascade(columns.length);
  const isOpen = openId !== null;

  return (
    <nav
      aria-label={label}
      ref={wrapRef}
      onPointerLeave={close}
      onBlur={handleBlur}
      className={cn("relative w-full", className)}
    >
      <div className="flex w-full flex-wrap items-center gap-1 rounded-3 border border-hairline bg-surface-1 p-1.5">
        {items.map((item, index) => {
          const expanded = openId === item.id;
          return (
            <button
              key={item.id}
              id={`${baseId}-item-${item.id}`}
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              tabIndex={index === focusIndex ? 0 : -1}
              onPointerEnter={() => hover(item.id)}
              onFocus={(event) => {
                setFocusIndex(index);
                if (escaping.current) return;
                // Only a keyboard arrival unfolds the panel: a mouse press
                // focuses first and clicks second, which would open the canopy
                // and then immediately toggle it shut.
                if (event.currentTarget.matches(":focus-visible")) {
                  open(item.id);
                }
              }}
              onClick={() => (expanded ? close() : open(item.id))}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-9 cursor-pointer items-center gap-1.5 rounded-2 px-3 text-sm font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                expanded
                  ? "bg-cobalt-wash text-cobalt-bright"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {item.label}
              <svg viewBox="0 0 24 24" aria-hidden className="size-3 shrink-0">
                <motion.path
                  d="M6 9.5 12 15.5 18 9.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  style={{ originX: 0.5, originY: 0.5 }}
                />
              </svg>
            </button>
          );
        })}
      </div>

      <motion.div
        id={panelId}
        role="region"
        aria-label={shown?.label}
        inert={!isOpen}
        onKeyDown={handlePanelKeyDown}
        initial={false}
        animate={{
          opacity: isOpen ? 1 : 0,
          scaleY: isOpen || !motionSafe ? 1 : 0.85,
          width: size.width,
          height: size.height,
        }}
        transition={{
          opacity: {
            duration: isOpen ? durations.fast : durations.blink,
            ease: isOpen ? easings.enter : easings.exit,
          },
          // Unfolding springs; folding away never does — exits ease out.
          scaleY: !motionSafe
            ? { duration: 0 }
            : isOpen
              ? springs.glide
              : exitFor(durations.fast),
          width: morph && motionSafe ? springs.glide : { duration: 0 },
          height: morph && motionSafe ? springs.glide : { duration: 0 },
        }}
        className={cn(
          "absolute top-full left-0 z-30 mt-1.5 origin-top overflow-hidden rounded-3 border border-hairline bg-popover shadow-raised",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Absolutely positioned so the content measures at its natural size
            instead of chasing the width the panel is animating toward. */}
        <div
          ref={innerRef}
          style={{ maxWidth: barWidth || undefined }}
          className="absolute top-0 left-0 w-max p-4"
        >
          <div
            key={`${shownId}-${seq}`}
            className="flex flex-wrap gap-x-6 gap-y-4"
          >
            {columns.map((column, index) => {
              const delay = motionSafe ? index * step : 0;
              return (
                <div
                  key={column.heading}
                  className={cn("flex min-w-0 flex-col gap-2", COLUMN)}
                >
                  <motion.p
                    className="truncate text-label text-ink-3"
                    initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      y: motionSafe
                        ? { ...springs.snap, delay }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay,
                      },
                    }}
                  >
                    {column.heading}
                  </motion.p>
                  {column.links.map((link, linkIndex) => (
                    <motion.a
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "truncate rounded-1 text-xs text-ink-2 transition-colors outline-none hover:text-ink",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        y: motionSafe
                          ? { ...springs.snap, delay: delay + linkIndex * 0.02 }
                          : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: delay + linkIndex * 0.02,
                        },
                      }}
                    >
                      {link.label}
                    </motion.a>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </nav>
  );
}
