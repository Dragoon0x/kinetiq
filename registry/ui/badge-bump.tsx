"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BadgeBumpProps = {
  /** The number. Zero collapses the badge. */
  count: number;
  /** Cap; anything above reads as `max+`. @default 99 */
  max?: number;
  /** Colour. @default "primary" */
  tone?: "primary" | "danger" | "neutral";
  /** Names the number for assistive technology. @default "unread" */
  label?: string;
  /** The thing the badge sits on. */
  children: React.ReactNode;
  className?: string;
};

const TONE_CLASSES = {
  primary: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-destructive-foreground",
  neutral: "border-hairline-strong bg-surface-2 text-ink border",
} as const;

/**
 * A count badge that reacts to its own number. Every change bumps the pill from
 * 1.25 back to 1 on `recoil` — two visible bounces, the physics of something
 * landing — while the digits roll on `snap` and a wash of the badge's own ink
 * flashes and drains on the exit ease. Going to zero is not a bump: the badge
 * shrinks away on the exit ease, because nothing celebrates an empty inbox.
 *
 * The bump is driven imperatively rather than declaratively, which is what keeps
 * it honest: a spring takes exactly two keyframes, so `[1.25, 1]` is the whole
 * animation, and running it from the count's own effect leaves the digit stack
 * mounted underneath so the outgoing number can still roll out.
 *
 * The badge itself is decoration — a polite status line carries `12 unread` to
 * assistive technology, once per change, so the host button keeps whatever name
 * it already had. Under reduced motion the digits simply swap and the wash still
 * flashes, because the new number is information.
 */
export function BadgeBump({
  count,
  max = 99,
  tone = "primary",
  label = "unread",
  children,
  className,
}: BadgeBumpProps) {
  const motionSafe = useMotionSafe();
  const bumpRef = React.useRef<HTMLSpanElement | null>(null);

  const display = count > max ? `${max}+` : String(count);
  const showing = count > 0;

  React.useEffect(() => {
    const node = bumpRef.current;
    if (!node || !showing || !motionSafe) return;
    // Exactly two keyframes: a spring silently drops anything in between.
    const bump = animate(node, { scale: [1.25, 1] }, springs.recoil);
    return () => bump.stop();
  }, [count, showing, motionSafe]);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {children}

      <AnimatePresence initial={false}>
        {showing ? (
          <motion.span
            key="badge"
            aria-hidden
            className="pointer-events-none absolute -top-1 -right-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              motionSafe
                ? { opacity: 0, scale: 0.6, transition: exitFor() }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {/* The bump target is a plain span so the imperative scale and the
                presence opacity never write the same style. */}
            <span
              ref={bumpRef}
              className={cn(
                "relative flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-full px-1.5 font-mono text-[10px] leading-none font-semibold tabular-nums",
                TONE_CLASSES[tone],
              )}
            >
              <motion.span
                key={`wash-${count}`}
                className="pointer-events-none absolute inset-0 bg-current"
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 0 }}
                transition={{
                  duration: motionSafe ? durations.slow : durations.fast,
                  ease: easings.exit,
                }}
              />

              {/* One grid cell holds both numbers, so the outgoing digits roll
                  out over the incoming ones instead of being pushed sideways. */}
              <span className="relative grid">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={display}
                    className="col-start-1 row-start-1 text-center"
                    initial={
                      motionSafe
                        ? { y: -distances.step, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ y: 0, opacity: 1 }}
                    exit={
                      motionSafe
                        ? {
                            y: distances.step,
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                    transition={
                      motionSafe
                        ? springs.snap
                        : { duration: durations.blink, ease: easings.enter }
                    }
                  >
                    {display}
                  </motion.span>
                </AnimatePresence>
              </span>
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {count === 0 ? `No ${label}` : `${display} ${label}`}
      </span>
    </span>
  );
}
