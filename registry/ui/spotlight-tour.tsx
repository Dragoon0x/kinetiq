"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const emptySubscribe = () => () => {};
const useMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

export type TourStep = {
  id: string;
  /** The element this step spotlights. */
  target: React.RefObject<HTMLElement | null>;
  title: React.ReactNode;
  body: React.ReactNode;
};

export type SpotlightTourProps = {
  steps: TourStep[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires when the last step is completed (as opposed to dismissed). */
  onFinish?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const POP_W = 304;
const HOLE_SHADOW =
  "0 0 0 2px var(--accent-bright), 0 0 0 9999px rgba(2, 6, 23, 0.62)";

/**
 * A guided tour. A dimming scrim cuts a moving spotlight over each target in
 * turn while a popover explains it, gliding from one step to the next; the
 * highlighted element stays lit through the dark. Arrow keys and the buttons
 * step through, Escape or the close control ends it, focus is trapped in the
 * popover, and the spotlight re-tracks its target on scroll and resize. Under
 * reduced motion the spotlight jumps between steps instead of gliding.
 */
export function SpotlightTour({
  steps,
  open,
  onOpenChange,
  onFinish,
}: SpotlightTourProps) {
  const motionSafe = useMotionSafe();
  const mounted = useMounted();
  const titleId = React.useId();
  const bodyId = React.useId();
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);

  const count = steps.length;
  const isLast = index >= count - 1;

  // Reset to the first step whenever the tour is dismissed.
  React.useEffect(() => {
    if (open) return;
    const frame = window.requestAnimationFrame(() => {
      setIndex(0);
      setRect(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Bring the current target into view, then track its rect through scroll and
  // resize. The state write lives in the rAF callback, not the effect body.
  React.useEffect(() => {
    if (!open) return;
    const el = steps[index]?.target.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "center" });
    let frame = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const pad = 8;
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, index, steps]);

  // Keep focus on the primary control as steps advance.
  React.useEffect(() => {
    if (!open || !rect) return;
    const frame = window.requestAnimationFrame(() => primaryRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, index, rect]);

  const finish = React.useCallback(() => {
    onFinish?.();
    onOpenChange(false);
  }, [onFinish, onOpenChange]);

  // Global arrow / escape control.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index >= count - 1) finish();
        else setIndex(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, count, finish, onOpenChange]);

  const onPopoverKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusables = popoverRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled])",
    );
    if (!focusables || focusables.length === 0) return;
    const list = Array.from(focusables);
    const firstEl = list[0];
    const lastEl = list[list.length - 1];
    if (!firstEl || !lastEl) return;
    if (event.shiftKey && document.activeElement === firstEl) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && document.activeElement === lastEl) {
      event.preventDefault();
      firstEl.focus();
    }
  };

  const next = () => {
    if (isLast) finish();
    else setIndex(index + 1);
  };
  const back = () => setIndex((value) => Math.max(0, value - 1));

  const step = steps[index];

  let popLeft = 8;
  let popTop = 8;
  if (rect && typeof window !== "undefined") {
    popLeft = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POP_W / 2),
      window.innerWidth - POP_W - 8,
    );
    const below = rect.top + rect.height + 12;
    popTop =
      window.innerHeight - below > 188 ? below : Math.max(8, rect.top - 188);
  }

  const holeTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  const overlay =
    open && rect && step ? (
      <>
        <div className="fixed inset-0 z-[70]" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none fixed z-[71] rounded-2"
          style={{ boxShadow: HOLE_SHADOW }}
          initial={{
            opacity: 0,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          animate={{
            opacity: 1,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            top: holeTransition,
            left: holeTransition,
            width: holeTransition,
            height: holeTransition,
          }}
        />
        <motion.div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          onKeyDown={onPopoverKeyDown}
          className="border-border bg-popover text-popover-foreground fixed z-[72] w-[19rem] max-w-[calc(100vw-16px)] rounded-3 border p-4 shadow-xl"
          initial={
            motionSafe
              ? { opacity: 0, y: 8, top: popTop, left: popLeft }
              : { opacity: 0, top: popTop, left: popLeft }
          }
          animate={{
            opacity: 1,
            y: 0,
            top: popTop,
            left: popLeft,
            transition: {
              top: holeTransition,
              left: holeTransition,
              opacity: { duration: durations.fast, ease: easings.enter },
              y: motionSafe ? springs.snap : { duration: durations.fast },
            },
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-label text-ink-3">
              Step {index + 1} of {count}
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="End tour"
              className="text-ink-3 hover:text-ink hover:bg-surface-2 focus-visible:ring-cobalt-bright/50 -mr-1 grid size-6 place-items-center rounded-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path
                  d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <p id={titleId} className="text-ink mt-2 text-base font-semibold">
            {step.title}
          </p>
          <p id={bodyId} className="text-ink-2 mt-1 text-sm">
            {step.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              {steps.map((dot, dotIndex) => (
                <span
                  key={dot.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    dotIndex === index
                      ? "bg-cobalt w-4"
                      : "bg-hairline-strong w-1.5",
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={back}
                disabled={index === 0}
                className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 rounded-2 border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
              >
                Back
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={next}
                className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-cobalt-bright/50 rounded-2 px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {isLast ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </>
    ) : null;

  return mounted ? createPortal(overlay, document.body) : null;
}
