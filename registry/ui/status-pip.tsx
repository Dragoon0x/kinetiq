"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PipStatus = "online" | "away" | "busy" | "offline";

export type StatusPipProps = {
  status: PipStatus;
  /** Visible text beside the dot. Omit it and the status name is used for SR. */
  label?: React.ReactNode;
  /** A breathing halo. Defaults on for live states, off for away/offline. */
  pulse?: boolean;
  className?: string;
};

const TONE: Record<PipStatus, { dot: string; name: string; live: boolean }> = {
  online: { dot: "bg-success", name: "Online", live: true },
  away: { dot: "bg-warn", name: "Away", live: false },
  busy: { dot: "bg-danger", name: "Busy", live: true },
  offline: { dot: "bg-muted-foreground", name: "Offline", live: false },
};

/**
 * A presence dot that stays alive without shouting. Live states breathe a slow
 * halo out and fade it; changing state morphs the dot's colour rather than
 * cutting to it, since the same element just transitions its fill. The status
 * name always travels with it, so the colour is a reinforcement and never the
 * only cue.
 *
 * It reports through a polite live region, so a change from Online to Busy is
 * announced once, calmly. Reduced motion drops the halo and the colour simply
 * changes — same states, same announcement.
 */
export function StatusPip({ status, label, pulse, className }: StatusPipProps) {
  const motionSafe = useMotionSafe();
  const tone = TONE[status];
  const breathing = motionSafe && (pulse ?? tone.live);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span className="relative inline-flex size-2.5 shrink-0 items-center justify-center">
        {breathing && (
          <motion.span
            aria-hidden
            className={cn("absolute inset-0 rounded-full", tone.dot)}
            animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
            transition={{ duration: 1.8, ease: easings.move, repeat: Infinity }}
          />
        )}
        <span
          aria-hidden
          className={cn(
            "relative inline-block size-2.5 rounded-full transition-colors",
            tone.dot,
          )}
          style={{ transitionDuration: `${durations.base}s` }}
        />
      </span>
      {label ? (
        <span className="text-ink-2 text-sm">{label}</span>
      ) : (
        <span className="sr-only">{tone.name}</span>
      )}
    </span>
  );
}
