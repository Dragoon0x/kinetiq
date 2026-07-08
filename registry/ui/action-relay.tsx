"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const VARIANT_CLASSES = {
  solid:
    "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
  outline:
    "border border-input bg-transparent text-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-accent",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
} as const;

const SIZE_CLASSES = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-base",
} as const;

/** State nodes carry the same icon/label gap as the button size. */
const CONTENT_GAP = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
} as const;

/** How far content travels through the one-line mask. */
const ROLL_IN = "0.7em";
const ROLL_OUT = "-0.7em";

export type ActionRelayProps = Omit<
  React.ComponentPropsWithoutRef<typeof motion.button>,
  "children"
> & {
  /** Current state key — controlled; must exist in `states`. */
  state: string;
  /**
   * Content per state. Nodes may embed icons or loaders; keep them within
   * the button's line height, since the mask is exactly one line tall.
   */
  states: Record<string, React.ReactNode>;
  /**
   * Screen-reader text per state. Falls back to the state's node when it is
   * plain text; otherwise nothing is announced for that state.
   */
  announcements?: Record<string, string>;
  /**
   * States during which the button reports busy: `aria-busy`, pointer events
   * suppressed and clicks swallowed via `aria-disabled` — but never the
   * `disabled` attribute, so keyboard focus stays put.
   */
  busyStates?: string[];
  /** Fires once the incoming state's roll has fully settled. */
  onSettled?: (state: string) => void;
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
};

/**
 * A button that narrates the job. On every `state` change the outgoing
 * content rolls up through a one-line overflow mask (0.7em rise, blurring to
 * 4px and fading at 0.6×) while the incoming content rolls in from below on
 * `snap`, its blur and opacity tweened at `base`/enter; the button's width
 * follows the new label on `glide`. Busy states keep focus but suppress
 * interaction. Reduced motion crossfades at `fast` and lets the width jump.
 */
export function ActionRelay({
  state,
  states,
  announcements,
  busyStates,
  onSettled,
  variant = "solid",
  size = "md",
  onClick,
  className,
  style,
  ...props
}: ActionRelayProps) {
  const motionSafe = useMotionSafe();
  const busy = busyStates?.includes(state) ?? false;
  const node = states[state];

  // Stable identity lets onAnimationComplete tell the incoming roll's
  // completion apart from an exit finishing on the outgoing node.
  const enterTarget = React.useMemo(
    () =>
      motionSafe
        ? { y: "0em", opacity: 1, filter: "blur(0px)" }
        : { opacity: 1 },
    [motionSafe],
  );

  const announcement =
    announcements?.[state] ??
    (typeof node === "string" || typeof node === "number" ? String(node) : "");

  return (
    <>
      <motion.button
        type="button"
        layout={motionSafe}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={(event) => {
          // aria-disabled without the disabled attr: swallow activation
          // (pointer and keyboard both arrive here as clicks).
          if (busy) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        transition={{ layout: springs.glide }}
        // Radius as a style so the layout animation can correct distortion.
        style={{ borderRadius: 6, ...style }}
        className={cn(
          "relative inline-flex items-center justify-center rounded-2 font-medium whitespace-nowrap select-none",
          "disabled:pointer-events-none disabled:opacity-50",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          busy && "pointer-events-none",
          className,
        )}
        {...props}
      >
        <motion.span
          layout={motionSafe}
          transition={{ layout: springs.glide }}
          className="relative inline-flex h-[1lh] items-center overflow-hidden"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={state}
              initial={
                motionSafe
                  ? { y: ROLL_IN, opacity: 0, filter: "blur(4px)" }
                  : { opacity: 0 }
              }
              animate={enterTarget}
              exit={
                motionSafe
                  ? {
                      y: ROLL_OUT,
                      opacity: 0,
                      filter: "blur(4px)",
                      transition: exitFor(durations.base),
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe
                  ? {
                      y: springs.snap,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                      filter: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
              onAnimationComplete={(definition) => {
                if (definition === enterTarget) onSettled?.(state);
              }}
              className={cn(
                "inline-flex items-center whitespace-nowrap",
                CONTENT_GAP[size],
              )}
            >
              {node}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </motion.button>
      {/* Outside the button: aria-busy would hold announcements inside it. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
