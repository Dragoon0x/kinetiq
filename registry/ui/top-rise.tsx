"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TopRiseProps = {
  /** The scrolling element; defaults to the window. */
  container?: React.RefObject<HTMLElement | null>;
  /** Pixels scrolled before it surfaces. @default 240 */
  threshold?: number;
  /** Accessible name. @default "Back to top" */
  label?: string;
  /** Fires with whole-percent scroll depth, 0–100, when the percent changes. */
  onDepthChange?: (percent: number) => void;
  /** Positioning is the caller's: pass `absolute bottom-3 right-3` inside a
   *  relative frame, or `fixed` when the page itself scrolls. */
  className?: string;
};

/**
 * A back-to-top control that surfaces from the bottom edge on `recoil` — ζ0.53,
 * two visible bounces, the physics of something landing — once the container
 * has passed the threshold, and sinks away on the exit ease when the top comes
 * back into reach. Its ring carries scroll depth, drawn with `pathLength` so
 * the geometry follows the button's own box rather than a hard-coded radius.
 *
 * Pressing it scrolls the container to the top while the arrow lifts 4px on
 * `flick`. It is a plain button with an accessible name, so Tab reaches it and
 * Enter or Space presses it, and it leaves the DOM below the threshold so the
 * keyboard never lands on something invisible. Under reduced motion it fades
 * in and out without travelling, the ring still fills, and the scroll is
 * instant rather than smooth.
 */
export function TopRise({
  container,
  threshold = 240,
  label = "Back to top",
  onDepthChange,
  className,
}: TopRiseProps) {
  const motionSafe = useMotionSafe();
  const [visible, setVisible] = React.useState(false);
  const [lifted, setLifted] = React.useState(false);
  const depth = useMotionValue(0);
  // pathLength normalises the ring to 0–1, so the dash maths never touches the
  // radius and the SVG can be sized entirely by its container.
  const ringOffset = useTransform(depth, [0, 1], [1, 0]);

  // Latest-callback ref: the scroll listener is attached once, even when the
  // caller passes a fresh arrow function on every render.
  const depthCallback = React.useRef(onDepthChange);
  React.useEffect(() => {
    depthCallback.current = onDepthChange;
  }, [onDepthChange]);

  React.useEffect(() => {
    const root = container?.current ?? null;
    const scrollTarget: EventTarget = root ?? window;
    let lastPercent = -1;

    const measure = () => {
      const travelled = root ? root.scrollTop : window.scrollY;
      const span = root
        ? root.scrollHeight - root.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const fraction =
        span > 0 ? Math.min(1, Math.max(0, travelled / span)) : 0;
      depth.set(fraction);
      setVisible(travelled > threshold);
      const percent = Math.round(fraction * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        depthCallback.current?.(percent);
      }
    };

    scrollTarget.addEventListener("scroll", measure, { passive: true });
    // ResizeObserver fires once on observe, which seeds the first reading
    // without setting state inside the effect body.
    const observer = new ResizeObserver(measure);
    observer.observe(root ?? document.documentElement);

    return () => {
      scrollTarget.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [container, depth, threshold]);

  // The lift is a press gesture, not a loop: it starts on click and clears
  // itself, and the timer never runs on mount.
  React.useEffect(() => {
    if (!lifted) return;
    const timer = window.setTimeout(() => setLifted(false), 260);
    return () => window.clearTimeout(timer);
  }, [lifted]);

  const goTop = () => {
    setLifted(true);
    const root = container?.current ?? null;
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (root) root.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  };

  return (
    <div className={cn("inline-flex", className)}>
      <AnimatePresence>
        {visible ? (
          <motion.button
            type="button"
            aria-label={label}
            onClick={goTop}
            initial={
              motionSafe
                ? { opacity: 0, y: distances.shift }
                : { opacity: 0, y: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? { opacity: 0, y: distances.shift, transition: exitFor() }
                : { opacity: 0, y: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.recoil : { duration: durations.fast }
            }
            className={cn(
              "relative flex size-11 cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-surface-1 text-ink shadow-raised outline-none",
              "transition-colors hover:bg-surface-2",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {/* Sized by the button, never by pixels: inset-0 plus a viewBox
                means the ring cannot overhang its own control. */}
            <svg
              viewBox="0 0 44 44"
              aria-hidden
              className="absolute inset-0 size-full -rotate-90"
            >
              <circle
                cx="22"
                cy="22"
                r="19"
                fill="none"
                strokeWidth="2"
                className="stroke-current text-hairline-strong"
              />
              <motion.circle
                cx="22"
                cy="22"
                r="19"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                style={{ strokeDashoffset: ringOffset }}
                className="stroke-current text-cobalt-bright"
              />
            </svg>

            <motion.span
              className="relative flex"
              animate={{ y: lifted && motionSafe ? -distances.nudge : 0 }}
              transition={springs.flick}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-4 shrink-0 fill-none stroke-current"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V6.5M6.6 11.9 12 6.5l5.4 5.4" />
              </svg>
            </motion.span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
