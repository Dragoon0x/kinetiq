"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type RunFile = { id: string; label: string };

export type VignetteFileRunProps = {
  files?: RunFile[];
  /** Where the files land. */
  destination?: string;
  /** Seconds between departures. @default 1.6 */
  cadence?: number;
  className?: string;
};

const DEFAULT_FILES: RunFile[] = [
  { id: "f1", label: "rosters.csv" },
  { id: "f2", label: "holds.json" },
  { id: "f3", label: "tides.xml" },
  { id: "f4", label: "moves.csv" },
];

/**
 * Files flowing a drawn path into a destination, one departing at a time,
 * with the landed tally rolling on the readout — the ingestion scene, for
 * heroes about pipelines and imports. The path is a fixed curve, departures
 * are a mount-driven cycle, and the tally counts landings honestly: it only
 * rolls when a chip arrives. One image to assistive tech.
 *
 * Reduced motion: chips rest along the path and the tally reads complete.
 */
export function VignetteFileRun({
  files = DEFAULT_FILES,
  destination = "The record",
  cadence = 1.6,
  className,
}: VignetteFileRunProps) {
  const motionSafe = useMotionSafe();
  const [landed, setLanded] = React.useState(motionSafe ? 0 : files.length);

  // Mode change: settle during render, never in the effect.
  const [modeKey, setModeKey] = React.useState(motionSafe);
  if (modeKey !== motionSafe) {
    setModeKey(motionSafe);
    setLanded(motionSafe ? 0 : files.length);
  }

  React.useEffect(() => {
    if (!motionSafe) return;
    const flightMs = 1200;
    const id = window.setInterval(() => {
      setLanded((n) => (n >= files.length ? n : n + 1));
    }, cadence * 1000);
    const settle = window.setTimeout(() => undefined, flightMs);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(settle);
    };
  }, [motionSafe, files.length, cadence]);

  return (
    <div
      role="img"
      aria-label={`${files.length} files flowing into ${destination}`}
      className={cn("w-full max-w-sm", className)}
    >
      <div aria-hidden className="relative h-44">
        <svg viewBox="0 0 320 176" className="absolute inset-0 size-full">
          <path
            d="M24 40 C 120 40, 140 88, 296 88"
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <path
            d="M24 136 C 120 136, 140 88, 296 88"
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        </svg>

        {/* Departing chips: alternate the two rails; each flies then rests hidden. */}
        {files.map((file, index) => {
          const flying =
            motionSafe &&
            index === Math.min(landed, files.length - 1) &&
            landed < files.length;
          const waiting = motionSafe ? index > landed : false;
          const topRail = index % 2 === 0;
          return (
            <motion.span
              key={file.id}
              className="absolute rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[10px] text-ink-2 shadow-raised"
              style={{ top: topRail ? 28 : 124 }}
              initial={false}
              animate={
                flying
                  ? { left: [8, 250], opacity: [1, 0.2], scale: [1, 0.85] }
                  : waiting
                    ? { left: 8, opacity: 0.8, scale: 1 }
                    : { left: 8, opacity: motionSafe ? 0 : 0.8, scale: 1 }
              }
              transition={
                flying
                  ? { duration: 1.1, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              {file.label}
            </motion.span>
          );
        })}

        {/* Destination with the honest tally. */}
        <div className="absolute top-1/2 right-0 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-3 border-2 border-hairline-strong bg-surface-0 px-3 py-2 shadow-raised">
          <span className="text-xs font-semibold text-ink">{destination}</span>
          <span className="flex items-baseline gap-1 font-mono text-[10px] text-ink-3">
            <Readout value={landed} size="sm" />
            <span>landed</span>
          </span>
        </div>
      </div>
    </div>
  );
}
