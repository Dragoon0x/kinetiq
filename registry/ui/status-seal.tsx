"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const VARIANT_CLASSES = {
  info: "bg-accent text-foreground border-border",
  success:
    "text-[var(--success,var(--primary))] border-[var(--success,var(--primary))]/30 bg-[var(--success,var(--primary))]/15",
  warn: "text-[var(--warn,var(--primary))] border-[var(--warn,var(--primary))]/30 bg-[var(--warn,var(--primary))]/15",
  danger: "text-destructive border-destructive/30 bg-destructive/15",
} as const;

export type StatusSealVariant = keyof typeof VARIANT_CLASSES;

/** "label, count" announcements fire once per settled change. */
const ANNOUNCE_DEBOUNCE_MS = 400;

export type StatusSealProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children"
> & {
  variant?: StatusSealVariant;
  /**
   * The label. Plain text re-seals on change; complex nodes re-seal on
   * variant change only (their text can't be diffed or announced).
   */
  children: React.ReactNode;
  /** Embeds a Readout so the number carry-rolls instead of re-stamping. */
  count?: number;
  /** Pulses a ring behind the leading dot at drift tempo. */
  live?: boolean;
  /** Leading node; defaults to a status dot. */
  icon?: React.ReactNode;
};

/**
 * Status, re-stamped on every change. When the variant or label changes, the
 * outgoing seal fades at 0.6× while the incoming one stamps in from 1.25×
 * scale on `recoil` — a small, subtle double-bounce landing. `live` pulses a
 * ring behind the leading dot (scale 1→1.8, fading out over a ~1.6s
 * drift-tempo loop); `count` embeds a Readout so numbers carry-roll rather
 * than re-stamp. Reduced motion swaps instantly and holds the ring static at
 * mid-opacity.
 */
export function StatusSeal({
  variant = "info",
  children,
  count,
  live = false,
  icon,
  className,
  ...props
}: StatusSealProps) {
  const motionSafe = useMotionSafe();

  const label =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";
  const sealKey = `${variant}:${label}`;
  const announcement =
    typeof count === "number"
      ? label
        ? `${label}, ${count}`
        : String(count)
      : label;

  const [announced, setAnnounced] = React.useState(announcement);
  // Announce once per settled change — bursts reset the timer instead of
  // spamming (the Readout debounce pattern).
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnounced(announcement),
      ANNOUNCE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [announcement]);

  return (
    <span {...props} className={cn("relative inline-flex", className)}>
      {/* Hidden from AT: the seal briefly doubles mid-stamp, and the sr-only
          status line below carries the "label, count" reading instead. */}
      <span aria-hidden className="inline-flex">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={sealKey}
            initial={motionSafe ? { scale: 1.25, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            exit={
              motionSafe
                ? { opacity: 0, transition: exitFor(durations.fast) }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? {
                    scale: springs.recoil,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: 0 }
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-1 border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              VARIANT_CLASSES[variant],
            )}
          >
            <span className="relative inline-flex shrink-0 items-center justify-center">
              {live &&
                (motionSafe ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-current"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    // Drift tempo: one breath per ~1.6s.
                    transition={{
                      duration: 1.6,
                      ease: "easeOut",
                      repeat: Infinity,
                    }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 scale-150 rounded-full bg-current opacity-30"
                  />
                ))}
              {icon ?? <span className="size-1.5 rounded-full bg-current" />}
            </span>
            {children}
            {typeof count === "number" && <Readout size="sm" value={count} />}
          </motion.span>
        </AnimatePresence>
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
    </span>
  );
}
