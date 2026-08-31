"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RelayStop = {
  id: string;
  /** The trigger's visible content. */
  label: React.ReactNode;
  /** What the tip says over this trigger. */
  tip: string;
};

export type RelayTipProps = {
  stops?: RelayStop[];
  /** Gap between trigger and tip in px. @default 8 */
  offset?: number;
  className?: string;
};

const DEFAULT_STOPS: RelayStop[] = [
  { id: "s1", label: "Boards", tip: "Cut fresh every morning" },
  { id: "s2", label: "Holds", tip: "Deadline is 05:15" },
  { id: "s3", label: "Exports", tip: "Filed nightly at 23:00" },
  { id: "s4", label: "Crews", tip: "Rest counted from shift end" },
];

/**
 * One tip surface, relayed: instead of each trigger owning a tooltip that
 * pops and dies, a single shared surface glides from trigger to trigger,
 * morphing to fit each caption — so moving along a row of controls reads as
 * one label travelling, not four labels blinking. The travel is a shared
 * layout element on the snap spring; entering from nothing still pops, and
 * leaving the last trigger withdraws it.
 *
 * Each trigger keeps a per-trigger description for assistive tech — the
 * relay is presentation; the semantics stay stationary.
 *
 * Reduced motion: the tip appears over each trigger without travel.
 */
export function RelayTip({
  stops = DEFAULT_STOPS,
  offset = 8,
  className,
}: RelayTipProps) {
  const motionSafe = useMotionSafe();
  const surfaceId = React.useId();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = stops.find((stop) => stop.id === activeId) ?? null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      onMouseLeave={() => setActiveId(null)}
    >
      {stops.map((stop) => (
        <span key={stop.id} className="relative">
          <button
            type="button"
            aria-describedby={`${surfaceId}-${stop.id}`}
            onMouseEnter={() => setActiveId(stop.id)}
            onFocus={() => setActiveId(stop.id)}
            onBlur={() => setActiveId(null)}
            className={cn(
              "rounded-2 border border-hairline px-3 py-1.5 text-sm transition-colors",
              activeId === stop.id
                ? "border-hairline-strong text-ink"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {stop.label}
          </button>
          {/* Stationary semantics: every trigger describes itself. */}
          <span
            id={`${surfaceId}-${stop.id}`}
            role="tooltip"
            className="sr-only"
          >
            {stop.tip}
          </span>

          <AnimatePresence>
            {active?.id === stop.id && (
              <motion.span
                layoutId={motionSafe ? surfaceId : undefined}
                initial={{ opacity: 0, scale: motionSafe ? 0.92 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.95 : 1,
                  transition: { duration: durations.fast },
                }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                aria-hidden
                style={{ bottom: `calc(100% + ${offset}px)` }}
                className="absolute left-1/2 z-10 -translate-x-1/2 rounded-2 bg-ink px-2.5 py-1 text-xs whitespace-nowrap text-surface-0 shadow-raised"
              >
                {stop.tip}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}
