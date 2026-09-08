"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpendAlertProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The category the alert is about; named in the copy and the labels. */
  category: string;
  /** Money spent in the category so far. */
  spent: number;
  /** The category's cap. */
  limit: number;
  /** Share of the limit at which the pill arrives. @default 0.85 */
  warnAt?: number;
  /** Controlled visibility; overrides both the threshold and the dismissal. */
  open?: boolean;
  /** Initial state for uncontrolled usage; `false` starts dismissed. */
  defaultOpen?: boolean;
  /** Fires from the click or key that dismissed or restored it. */
  onOpenChange?: (open: boolean) => void;
  /** Formats both amounts. */
  format?: (value: number) => string;
  /** Leaves a dot behind on dismissal. @default true */
  showDot?: boolean;
  /** Overrides the default top-inside placement. */
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and this one
 * sits in a live region where a mismatch is loud.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Level = "clear" | "near" | "over";

const levelOf = (spent: number, limit: number, warnAt: number): Level => {
  if (limit > 0 && spent > limit) return "over";
  const span = limit > 0 ? limit : 1;
  return spent / span >= warnAt ? "near" : "clear";
};

/**
 * What a dismissal is dismissing. A pill put away while the category was
 * "nearing" has not been told about the breach that comes after it, so the
 * signature changes with the level and the alert returns once — and only once —
 * for the news it has not delivered yet.
 */
const signatureOf = (category: string, level: Level) => `${category}:${level}`;

/**
 * A warning that arrives softly. Crossing `warnAt` slides the pill in from a
 * `shift` above its rail on `glide` — no overshoot, because a warning that
 * celebrates is a warning nobody believes — and while it sits there a halo
 * behind its icon breathes between two keyframes on `drift`, the slowest spring
 * in the house, reversing forever. A hairline meter inside the pill fills to the
 * share of the limit already spent.
 *
 * Crossing the limit is a different state, not a louder one: the copy and the
 * colour turn `danger` and the breath stops, because a breach is a fact rather
 * than an ambient condition. Dismissing slides the pill away on the exit ease
 * and leaves a small dot on the rail, arriving on `snap`; the dot keeps the
 * breath and is a real button that brings the pill back. A dismissal is
 * remembered against the level it was made at, so putting away a warning does
 * not silence the breach that follows.
 *
 * The pill is a `role="status"`, not a dialog: it announces itself politely and
 * never steals focus or traps it. Escape from inside it dismisses and moves
 * focus to the dot, so the keyboard never lands on nothing. Under reduced motion
 * nothing slides and nothing breathes, but the meter still fills and every word
 * still changes.
 */
export function SpendAlert({
  ref,
  category,
  spent,
  limit,
  warnAt = 0.85,
  open,
  defaultOpen,
  onOpenChange,
  format = (value) => money.format(value),
  showDot = true,
  className,
}: SpendAlertProps) {
  const motionSafe = useMotionSafe();
  const meterId = React.useId();

  const level = levelOf(spent, limit, warnAt);
  const signature = signatureOf(category, level);

  const [dismissedFor, setDismissedFor] = React.useState<string | null>(() =>
    defaultOpen === false
      ? signatureOf(category, levelOf(spent, limit, warnAt))
      : null,
  );

  const isControlled = open !== undefined;
  const dismissed = dismissedFor === signature;
  const visible = isControlled ? open : level !== "clear" && !dismissed;
  const dotVisible = !visible && showDot && level !== "clear";

  /** Which control should take focus once the swap has actually rendered. */
  const handOff = React.useRef<"dot" | "close" | null>(null);

  // Claimed by a callback ref rather than an effect: the pill and the dot swap
  // through `mode="wait"`, so the control that should take focus does not exist
  // yet on the render that asked for it — but it does the moment it mounts.
  const dotRef = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node || handOff.current !== "dot") return;
    handOff.current = null;
    node.focus();
  }, []);
  const closeRef = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node || handOff.current !== "close") return;
    handOff.current = null;
    node.focus();
  }, []);

  const dismiss = () => {
    handOff.current = showDot ? "dot" : null;
    if (!isControlled) setDismissedFor(signature);
    onOpenChange?.(false);
  };

  const restore = () => {
    handOff.current = "close";
    if (!isControlled) setDismissedFor(null);
    onOpenChange?.(true);
  };

  const isOver = level === "over";
  const remaining = limit - spent;
  const span = limit > 0 ? limit : 1;
  const fill = Math.min(1, Math.max(0, spent / span));
  const headline = isOver
    ? `${category} is over its limit`
    : `${category} is nearing its limit`;
  const detail = isOver
    ? `${format(Math.abs(remaining))} over ${format(limit)}`
    : `${format(Math.max(0, remaining))} left of ${format(limit)}`;
  const valueText = isOver
    ? `${format(spent)} of ${format(limit)}, ${format(Math.abs(remaining))} over`
    : `${format(spent)} of ${format(limit)}, ${format(Math.max(0, remaining))} left`;

  // Ambient, so it is the first thing reduced motion takes away — and a breach
  // is a fact rather than a condition, so it stops breathing then too.
  const breathes = motionSafe && !isOver;
  const breath = breathes
    ? { ...springs.drift, repeat: Infinity, repeatType: "reverse" as const }
    : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-end",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {visible ? (
          <motion.div
            key="pill"
            role="status"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              dismiss();
            }}
            initial={
              motionSafe ? { opacity: 0, y: -distances.shift } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.step : 0,
              transition: exitFor(),
            }}
            transition={
              motionSafe
                ? {
                    ...springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast, ease: easings.enter }
            }
            className={cn(
              "pointer-events-auto flex w-full items-start gap-2.5 rounded-3 border bg-popover px-3 py-2.5 shadow-raised transition-colors",
              isOver
                ? "border-danger/40 text-popover-foreground"
                : "border-warn/40 text-popover-foreground",
            )}
          >
            <span
              aria-hidden
              className="relative grid size-5 shrink-0 place-items-center"
            >
              <motion.span
                className={cn(
                  "absolute inset-0 rounded-full transition-colors",
                  isOver ? "bg-danger/20" : "bg-warn/25",
                )}
                initial={false}
                animate={{ scale: breathes ? 1.55 : 1 }}
                transition={breath}
              />
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  "relative size-4 transition-colors",
                  isOver ? "text-danger" : "text-warn",
                )}
              >
                <path d="M8 1.8 15 14H1Z" />
                <path d="M8 6.4v3.2" />
                <path d="M8 11.8h.01" />
              </svg>
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm leading-snug font-medium">
                {headline}
              </span>
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                {detail}
              </span>
              <span
                role="meter"
                aria-labelledby={meterId}
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-valuenow={Math.min(Math.max(0, spent), limit)}
                aria-valuetext={valueText}
                className="block h-1 w-full overflow-hidden rounded-full bg-hairline-strong"
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "block h-full origin-left rounded-full transition-colors",
                    isOver ? "bg-danger" : "bg-warn",
                  )}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: fill }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.base, ease: easings.enter }
                  }
                />
              </span>
              <span id={meterId} className="sr-only">
                {category} against its limit
              </span>
            </span>

            <button
              ref={closeRef}
              type="button"
              aria-label={`Dismiss the ${category} alert`}
              onClick={dismiss}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="size-3.5 shrink-0"
              >
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </motion.div>
        ) : dotVisible ? (
          <motion.button
            key="dot"
            ref={dotRef}
            type="button"
            aria-label={`Show the ${category} alert`}
            aria-expanded={false}
            onClick={restore}
            initial={motionSafe ? { opacity: 0, scale: 0.4 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            className={cn(
              "pointer-events-auto relative grid size-7 shrink-0 place-items-center rounded-full outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <motion.span
              aria-hidden
              className={cn(
                "absolute size-5 rounded-full transition-colors",
                isOver ? "bg-danger/25" : "bg-warn/30",
              )}
              initial={false}
              animate={{ scale: breathes ? 1.5 : 1 }}
              transition={breath}
            />
            <span
              aria-hidden
              className={cn(
                "relative size-2.5 rounded-full transition-colors",
                isOver ? "bg-danger" : "bg-warn",
              )}
            />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
