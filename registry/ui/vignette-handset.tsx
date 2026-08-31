"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type HandsetCard = {
  id: string;
  title: string;
  line: string;
  /** A small stat printed on the card's right. */
  stat?: string;
};

export type VignetteHandsetProps = {
  /** The app name on the handset's status strip. */
  appName?: string;
  cards?: HandsetCard[];
  /** Seconds for one full scroll loop. @default 14 */
  loopSeconds?: number;
  className?: string;
};

const DEFAULT_CARDS: HandsetCard[] = [
  {
    id: "c1",
    title: "Morning board",
    line: "Cut 05:55 · crane 2 clear",
    stat: "9 slots",
  },
  {
    id: "c2",
    title: "Crew B",
    line: "Coating pass from 10:15",
    stat: "rested",
  },
  { id: "c3", title: "Holds", line: "One entered overnight", stat: "1" },
  { id: "c4", title: "Handover", line: "Draft ready for sign-off", stat: "r3" },
  { id: "c5", title: "Exports", line: "Filed at 23:00 as usual", stat: "ok" },
  { id: "c6", title: "Tide", line: "Window opens 11:40", stat: "+2h" },
];

/**
 * A handset with an app scene scrolling on a slow loop — the mobile-demo
 * vignette for a hero that wants to show the phone view without a video
 * file. The card list is doubled and translated by half, so the loop never
 * jumps; hovering rests the scroll, because a reader leaning in deserves a
 * still page. Purely presentational and marked as one image.
 *
 * Reduced motion: the scene holds still at the top of the list.
 */
export function VignetteHandset({
  appName = "Waylight",
  cards = DEFAULT_CARDS,
  loopSeconds = 14,
  className,
}: VignetteHandsetProps) {
  const motionSafe = useMotionSafe();
  const [resting, setResting] = React.useState(false);

  const doubled = [...cards, ...cards];

  return (
    <div
      role="img"
      aria-label={`${appName} on a handset: ${cards.map((c) => c.title).join(", ")}`}
      className={cn("w-full max-w-[220px]", className)}
      onMouseEnter={() => setResting(true)}
      onMouseLeave={() => setResting(false)}
    >
      <div
        aria-hidden
        className="overflow-hidden rounded-[28px] border-[3px] border-hairline-strong bg-surface-1 shadow-raised"
      >
        {/* Status strip. */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
          <span className="font-mono text-[10px] text-ink">09:41</span>
          <span className="h-4 w-16 rounded-full bg-surface-2" />
          <span className="font-mono text-[10px] text-ink-3">{appName}</span>
        </div>

        {/* The scrolling scene. */}
        <div className="relative h-64 overflow-hidden px-2.5 pb-2.5">
          <motion.div
            className="flex flex-col gap-2"
            animate={
              motionSafe && !resting ? { y: ["0%", "-50%"] } : { y: "0%" }
            }
            transition={
              motionSafe && !resting
                ? {
                    duration: loopSeconds,
                    ease: "linear",
                    repeat: Infinity,
                  }
                : { duration: 0.4 }
            }
          >
            {doubled.map((card, index) => (
              <div
                key={`${card.id}-${index}`}
                className="rounded-3 border border-hairline bg-surface-0 p-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-ink">
                    {card.title}
                  </span>
                  {card.stat && (
                    <span className="shrink-0 font-mono text-[9px] text-ink-3">
                      {card.stat}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-ink-3">
                  {card.line}
                </p>
              </div>
            ))}
          </motion.div>
          {/* Fade rails so the loop enters and leaves softly. */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-surface-1 to-transparent" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-1 to-transparent" />
        </div>
      </div>
    </div>
  );
}
