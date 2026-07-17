"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

export type HoverCardProps = {
  ref?: React.Ref<HTMLSpanElement>;
  /** Inline anchor — a link, name, or chip. */
  trigger: React.ReactNode;
  /** Rich card content; may be interactive. */
  children: React.ReactNode;
  /** Preferred side; flips when the viewport is tight. @default "bottom" */
  side?: Side;
  /** Horizontal anchoring. @default "start" */
  align?: Align;
  /** Hover open delay in ms. Focus opens immediately. @default 220 */
  openDelay?: number;
  /** Grace period before closing after the pointer leaves, in ms. @default 140 */
  closeDelay?: number;
  /** Extra classes for the floating card. */
  className?: string;
};

/**
 * A rich preview that expands from an inline anchor. Hovering the trigger — or
 * focusing it — floats a card in on `snap` with a small arrow; the pointer can
 * cross into the card without it closing, and it retracts a beat after you
 * leave. The card flips above the anchor when the space below runs short. Under
 * reduced motion it cross-fades in place with no scale or travel.
 */
export function HoverCard({
  ref,
  trigger,
  children,
  side = "bottom",
  align = "start",
  openDelay = 220,
  closeDelay = 140,
  className,
}: HoverCardProps) {
  const motionSafe = useMotionSafe();
  const cardId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [resolvedSide, setResolvedSide] = React.useState<Side>(side);

  const wrapperRef = React.useRef<HTMLSpanElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);

  const setWrapperRef = (node: HTMLSpanElement | null) => {
    wrapperRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.RefObject<HTMLSpanElement | null>).current = node;
    }
  };

  const clearTimers = React.useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, openDelay);
  };

  const scheduleClose = () => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, closeDelay);
  };

  const openNow = () => {
    clearTimers();
    setOpen(true);
  };

  // Flip above the anchor when the card would overflow the bottom edge.
  React.useEffect(() => {
    if (!open) return;
    const wrap = wrapperRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;
    const t = wrap.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const vh = window.innerHeight;
    let next: Side = side;
    if (side === "bottom" && vh - t.bottom < c.height + 16 && t.top > vh - t.bottom) {
      next = "top";
    }
    if (side === "top" && t.top < c.height + 16 && vh - t.bottom > t.top) {
      next = "bottom";
    }
    setResolvedSide((prev) => (prev === next ? prev : next));
  }, [open, side]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const containerSideClass =
    resolvedSide === "bottom" ? "top-full pt-2.5" : "bottom-full pb-2.5";
  const containerAlignClass =
    align === "start"
      ? "left-0 items-start"
      : align === "end"
        ? "right-0 items-end"
        : "left-1/2 -translate-x-1/2 items-center";

  const originX = align === "start" ? "0%" : align === "end" ? "100%" : "50%";
  const originY = resolvedSide === "bottom" ? "0%" : "100%";

  const arrowStyle: React.CSSProperties =
    align === "start"
      ? { left: 20 }
      : align === "end"
        ? { right: 20 }
        : { left: "50%", marginLeft: -5 };
  const arrowSideClass =
    resolvedSide === "bottom"
      ? "-top-[5px] border-t border-l"
      : "-bottom-[5px] border-r border-b";

  return (
    <span
      ref={setWrapperRef}
      className="relative inline-block"
      onPointerEnter={scheduleOpen}
      onPointerLeave={scheduleClose}
      onFocusCapture={openNow}
      onBlurCapture={scheduleClose}
      aria-describedby={open ? cardId : undefined}
    >
      {trigger}
      <AnimatePresence>
        {open && (
          <span
            className={cn(
              "absolute z-50 flex",
              containerSideClass,
              containerAlignClass,
            )}
            onPointerEnter={() => {
              if (closeTimer.current !== null) {
                window.clearTimeout(closeTimer.current);
                closeTimer.current = null;
              }
            }}
            onPointerLeave={scheduleClose}
          >
            <motion.div
              ref={cardRef}
              id={cardId}
              role="group"
              style={{ transformOrigin: `${originX} ${originY}` }}
              initial={
                motionSafe
                  ? {
                      opacity: 0,
                      scale: 0.96,
                      y: resolvedSide === "bottom" ? -4 : 4,
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
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
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
                "bg-popover text-popover-foreground border-border relative w-64 rounded-3 border p-4 shadow-lg",
                className,
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
              {children}
            </motion.div>
          </span>
        )}
      </AnimatePresence>
    </span>
  );
}
