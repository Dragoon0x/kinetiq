"use client";

import * as React from "react";

import {
  Anchor,
  Bell,
  Box,
  Calendar,
  Camera,
  CloudSun,
  Compass,
  FileText,
  Radio,
  Ship,
  Waves,
  Wrench,
} from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type ReelIcon = {
  id: string;
  /** What the tile stands for — read to screen readers, shown on nothing. */
  name: string;
  icon: React.ReactNode;
  /** CSS color for the glyph. */
  tone?: string;
};

export type VignetteIconReelProps = {
  icons?: ReelIcon[];
  /** Seconds for one full pass. @default 18 */
  reelSeconds?: number;
  className?: string;
};

const DEFAULT_ICONS: ReelIcon[] = [
  { id: "i1", name: "Berths", icon: <Anchor />, tone: "var(--primary)" },
  {
    id: "i2",
    name: "Weather",
    icon: <CloudSun />,
    tone: "var(--warning, #b45309)",
  },
  { id: "i3", name: "Tides", icon: <Waves />, tone: "var(--success, #047857)" },
  { id: "i4", name: "Arrivals", icon: <Ship />, tone: "var(--primary)" },
  { id: "i5", name: "Gear", icon: <Wrench />, tone: "var(--ink-2)" },
  { id: "i6", name: "Alerts", icon: <Bell />, tone: "var(--warning, #b45309)" },
  { id: "i7", name: "Ledger", icon: <FileText />, tone: "var(--ink-2)" },
  { id: "i8", name: "Radio", icon: <Radio />, tone: "var(--success, #047857)" },
  { id: "i9", name: "Stores", icon: <Box />, tone: "var(--primary)" },
  { id: "i10", name: "Rosters", icon: <Calendar />, tone: "var(--ink-2)" },
  {
    id: "i11",
    name: "Bearings",
    icon: <Compass />,
    tone: "var(--warning, #b45309)",
  },
  {
    id: "i12",
    name: "Gate cams",
    icon: <Camera />,
    tone: "var(--success, #047857)",
  },
];

/**
 * A reel of icon tiles drifting past — the "everything it touches" scene for
 * a feature card, at card scale rather than a section's. The track is doubled
 * and translated by half so the loop never jumps, edge masks fade the ends,
 * and hovering rests the reel because a reader leaning in deserves a still
 * page. Purely presentational and marked as one image.
 *
 * Reduced motion: the reel holds still from its start.
 */
export function VignetteIconReel({
  icons = DEFAULT_ICONS,
  reelSeconds = 18,
  className,
}: VignetteIconReelProps) {
  const motionSafe = useMotionSafe();
  const [resting, setResting] = React.useState(false);

  const doubled = [...icons, ...icons];

  return (
    <div
      role="img"
      aria-label={`Icon reel: ${icons.map((i) => i.name).join(", ")}`}
      className={cn("w-full max-w-sm", className)}
      onMouseEnter={() => setResting(true)}
      onMouseLeave={() => setResting(false)}
    >
      <div
        aria-hidden
        className="overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <motion.div
          className="flex w-max gap-2.5 py-1"
          animate={motionSafe && !resting ? { x: ["0%", "-50%"] } : { x: "0%" }}
          transition={
            motionSafe && !resting
              ? {
                  duration: Math.max(6, reelSeconds),
                  ease: "linear",
                  repeat: Infinity,
                }
              : { duration: 0 }
          }
        >
          {doubled.map((item, index) => (
            <span
              key={`${item.id}-${index}`}
              className="grid size-10 shrink-0 place-items-center rounded-3 border border-hairline bg-surface-1 [&_svg]:size-4"
              style={{ color: item.tone ?? "var(--ink-2)" }}
            >
              {item.icon}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
