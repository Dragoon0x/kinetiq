"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OfferPanel = {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  /** The concrete first step for this offer. */
  firstStep: string;
};

export type OfferTriptychProps = {
  eyebrow?: string;
  headline?: string;
  panels?: OfferPanel[];
  defaultId?: string;
  className?: string;
};

const DEFAULT_PANELS: OfferPanel[] = [
  {
    id: "p1",
    kicker: "For one yard",
    title: "Run your morning",
    copy: "A single yard on the free tier: the board, the changes, the record. No card, no clock.",
    firstStep: "Name the yard — three questions",
  },
  {
    id: "p2",
    kicker: "For a floor",
    title: "Run every yard",
    copy: "Shared gear modelled once, boards cut for every site, one record under all of them.",
    firstStep: "Bring one week of a real plan",
  },
  {
    id: "p3",
    kicker: "With our team",
    title: "Rolled out with you",
    copy: "Constraints wired in by people who have run yards, at the gate, in whatever weather there is.",
    firstStep: "Book a half hour with the field team",
  },
];

/**
 * Three offers as panels sharing one rail, the focused one growing to tell
 * its story while the others hold their titles — a spatial answer to "which
 * of these am I": hover or focus a panel and it takes the room it needs.
 * Every panel ends in its concrete first step, because an offer without a
 * first step is a category, not an invitation.
 *
 * Reduced motion: panels share the row evenly and the focused one is marked
 * by border rather than growth.
 */
export function OfferTriptych({
  eyebrow = "Fernworks · what we offer",
  headline = "Three ways in, one system underneath.",
  panels = DEFAULT_PANELS,
  defaultId,
  className,
}: OfferTriptychProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [activeId, setActiveId] = React.useState(
    defaultId ?? panels[0]?.id ?? "",
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
        </div>

        <div className="mt-10 flex flex-col gap-3 md:flex-row">
          {panels.map((panel) => {
            const active = panel.id === activeId;
            return (
              <motion.button
                key={panel.id}
                type="button"
                onClick={() => setActiveId(panel.id)}
                onMouseEnter={() => setActiveId(panel.id)}
                onFocus={() => setActiveId(panel.id)}
                aria-expanded={active}
                animate={
                  motionSafe ? { flexGrow: active ? 2.2 : 1 } : { flexGrow: 1 }
                }
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className={cn(
                  "min-w-0 basis-0 rounded-4 border p-6 text-left transition-colors",
                  active
                    ? "border-hairline-strong bg-surface-1"
                    : "border-hairline hover:border-hairline-strong",
                )}
                style={{ flexGrow: 1 }}
              >
                <p className="text-label text-ink-3">{panel.kicker}</p>
                <h3 className="text-ink mt-2 text-xl font-semibold tracking-tight">
                  {panel.title}
                </h3>
                <motion.div
                  animate={{ opacity: active || !motionSafe ? 1 : 0.4 }}
                  transition={{ duration: durations.base }}
                >
                  <p className="text-ink-2 mt-2 text-sm leading-relaxed">
                    {panel.copy}
                  </p>
                  <p className="text-ink mt-4 font-mono text-[11px] tracking-[0.04em]">
                    → {panel.firstStep}
                  </p>
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
