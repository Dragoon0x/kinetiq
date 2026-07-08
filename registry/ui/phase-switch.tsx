"use client";

import * as React from "react";
import { flushSync } from "react-dom";

import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const SIZES = {
  sm: { button: "size-7", icon: "size-3.5" },
  md: { button: "size-9", icon: "size-4" },
  lg: { button: "size-11", icon: "size-5" },
} as const;

export type PhaseSwitchProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "children" | "role" | "aria-checked" | "onChange" | "value" | "defaultChecked"
> & {
  /** Current phase — `true` is dark. Controlled only; there is no internal state. */
  checked: boolean;
  /**
   * Flip your real theme here (toggle your `dark` class, persist the choice…).
   * The component owns zero theme logic; on capable browsers this callback
   * runs inside a View Transition so the change is revealed by the sweep.
   */
  onCheckedChange: (next: boolean) => void;
  size?: keyof typeof SIZES;
  /** Accessible name for the switch. */
  label?: string;
};

/**
 * Day to night in one clean sweep. Clicking wraps your state flip in
 * `document.startViewTransition` (flushed synchronously so the new theme is
 * captured), then reveals it with a clip-path circle growing from the button
 * to the farthest viewport corner — `durations.page` on `easings.enter`.
 * Keyboard "clicks" report (0,0), so those expand from the button center. The
 * Sun/Moon glyph swaps in step: the outgoing icon rotates -90° and shrinks
 * away via `exitFor(durations.fast)`, the incoming one rotates in from +90°
 * on `springs.snap`. Under reduced motion — or wherever View Transitions are
 * unsupported — the flip applies instantly and the glyph simply crossfades at
 * `durations.fast`.
 *
 * Required CSS, once, globally (this registry item ships it in its `css`;
 * without it the browser's default crossfade fights the sweep):
 *
 * ```css
 * ::view-transition-old(root),
 * ::view-transition-new(root) {
 *   animation: none;
 *   mix-blend-mode: normal;
 * }
 * ```
 */
export function PhaseSwitch({
  checked,
  onCheckedChange,
  size = "md",
  label = "Toggle theme",
  className,
  onClick,
  ...props
}: PhaseSwitchProps) {
  const motionSafe = useMotionSafe();
  const geo = SIZES[size];

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const next = !checked;

    if (!motionSafe || !document.startViewTransition) {
      onCheckedChange(next);
      return;
    }

    // Keyboard "clicks" report (0,0); expand from the button center instead.
    let x = event.clientX;
    let y = event.clientY;
    if (x === 0 && y === 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    // flushSync commits the consumer's theme flip inside the transition
    // callback, so the "new" snapshot captures the flipped DOM.
    const transition = document.startViewTransition(() => {
      flushSync(() => onCheckedChange(next));
    });
    transition.ready
      .then(() => {
        const radius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: durations.page * 1000,
            easing: `cubic-bezier(${easings.enter.join(", ")})`,
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // Transition was skipped (rapid toggling); the state still flipped.
      });
  };

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={handleClick}
      className={cn(
        "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex shrink-0 items-center justify-center rounded-2 border transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        geo.button,
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={checked ? "moon" : "sun"}
          aria-hidden
          className="flex items-center justify-center"
          initial={
            motionSafe
              ? { rotate: 90, scale: 0.6, opacity: 0 }
              : { opacity: 0 }
          }
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={
            motionSafe
              ? {
                  rotate: -90,
                  scale: 0.6,
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }
              : { opacity: 0, transition: { duration: durations.fast } }
          }
          transition={
            motionSafe
              ? {
                  rotate: springs.snap,
                  scale: springs.snap,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
        >
          {checked ? (
            <Moon className={geo.icon} />
          ) : (
            <Sun className={geo.icon} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
