"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ArcCard = {
  id: string;
  title: string;
  /** A small mono stat under the title. */
  stat: string;
  /** Two CSS colors for the card's wash. */
  wash: [string, string];
};

export type VignetteArcGalleryProps = {
  cards?: ArcCard[];
  /** "over" bows the fan upward; "under" hangs it downward. @default "over" */
  arc?: "over" | "under";
  /** Seconds each card leads the fan. @default 2.6 */
  holdSeconds?: number;
  className?: string;
};

const DEFAULT_CARDS: ArcCard[] = [
  {
    id: "a1",
    title: "North Basin",
    stat: "06:40 · clear",
    wash: [
      "color-mix(in oklab, var(--primary) 24%, transparent)",
      "transparent",
    ],
  },
  {
    id: "a2",
    title: "Fern Nursery",
    stat: "misting · zone 2",
    wash: [
      "color-mix(in oklab, var(--success, #047857) 22%, transparent)",
      "transparent",
    ],
  },
  {
    id: "a3",
    title: "Gauge Bench",
    stat: "cal due · 3",
    wash: [
      "color-mix(in oklab, var(--warning, #b45309) 22%, transparent)",
      "transparent",
    ],
  },
  {
    id: "a4",
    title: "Gate Four",
    stat: "9 through",
    wash: ["color-mix(in oklab, var(--ink-3) 20%, transparent)", "transparent"],
  },
  {
    id: "a5",
    title: "The Ledger",
    stat: "filed 23:00",
    wash: [
      "color-mix(in oklab, var(--primary) 16%, transparent)",
      "transparent",
    ],
  },
];

/**
 * Cards fanned along an arc, each taking a turn at the front: every advance
 * sends the whole fan one seat around, so a card leaves the lead by swinging
 * to the wing rather than vanishing. The washes are gradients, not images —
 * the scene stays theme-aware and weightless. Presentational and marked as
 * one image; hovering rests the turn.
 *
 * Reduced motion: the fan holds still with the first card leading.
 */
export function VignetteArcGallery({
  cards = DEFAULT_CARDS,
  arc = "over",
  holdSeconds = 2.6,
  className,
}: VignetteArcGalleryProps) {
  const motionSafe = useMotionSafe();
  const [resting, setResting] = React.useState(false);
  const [lead, setLead] = React.useState(0);

  React.useEffect(() => {
    if (!motionSafe || resting) return;
    const id = window.setInterval(
      () => setLead((l) => (l + 1) % cards.length),
      Math.max(1.2, holdSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [motionSafe, resting, cards.length, holdSeconds]);

  const shownLead = motionSafe ? lead : 0;
  const droop = arc === "over" ? 1 : -1;

  return (
    <div
      role="img"
      aria-label={`Card fan: ${cards.map((c) => c.title).join(", ")}`}
      className={cn("w-full max-w-sm", className)}
      onMouseEnter={() => setResting(true)}
      onMouseLeave={() => setResting(false)}
    >
      <div aria-hidden className="relative mx-auto h-[190px] w-full">
        {cards.map((card, index) => {
          const n = cards.length;
          // Circular offset from the lead, in [-n/2, n/2).
          const off =
            ((index - shownLead + n + Math.floor(n / 2)) % n) -
            Math.floor(n / 2);
          const dist = Math.abs(off);
          return (
            <motion.span
              key={card.id}
              animate={{
                x: off * 64,
                y: dist * 16 * droop,
                rotate: off * 9 * droop,
                scale: 1 - dist * 0.07,
                opacity: dist > 2 ? 0 : 1 - dist * 0.18,
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              style={{ zIndex: n - dist }}
              className="absolute top-1/2 left-1/2 flex h-32 w-24 -translate-x-1/2 -translate-y-1/2 flex-col justify-end overflow-hidden rounded-3 border border-hairline bg-surface-1 p-2.5 shadow-raised"
            >
              <span
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(160deg, ${card.wash[0]}, ${card.wash[1]} 70%)`,
                }}
              />
              <span className="relative text-xs font-semibold tracking-tight text-ink">
                {card.title}
              </span>
              <span className="relative font-mono text-[9px] tracking-[0.06em] text-ink-3">
                {card.stat}
              </span>
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
