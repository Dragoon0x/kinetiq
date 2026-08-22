"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeskEntry = {
  id: string;
  quote: string;
  name: string;
  role: string;
  /** The measured thing this customer's claim rests on. */
  proof: string;
};

export type TestimonialStandingDeskProps = {
  eyebrow?: string;
  headline?: string;
  entries?: DeskEntry[];
  className?: string;
};

const DEFAULT_ENTRIES: DeskEntry[] = [
  {
    id: "e1",
    quote: "Routing went from a shared inbox and a prayer to something we can actually staff against. The queue stopped being a mood.",
    name: "R. Okafor",
    role: "Payments desk lead",
    proof: "first-touch resolution +9pts",
  },
  {
    id: "e2",
    quote: "Escalations used to arrive angry because they arrived late. Now the hard cases land with us while they are still easy.",
    name: "J. Vance",
    role: "Support engineering",
    proof: "median wait 17m → 6m",
  },
  {
    id: "e3",
    quote: "I can finally explain to finance why we are staffed the way we are — the routing ledger is the argument.",
    name: "P. Iyer",
    role: "Head of operations",
    proof: "audit trail on every hop",
  },
];

/**
 * One testimony at a time, at a standing desk: the roster on the left, the
 * floor given wholly to whoever holds it. Choosing a name slides their
 * testimony in from the side it queues on, and every claim carries a proof
 * seal — the measured thing the quote rests on — because a testimonial with
 * a number survives skepticism better than adjectives do.
 */
export function TestimonialStandingDesk({
  eyebrow = "Switchyard · on the record",
  headline = "Three desks, on the record.",
  entries = DEFAULT_ENTRIES,
  className,
}: TestimonialStandingDeskProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [activeId, setActiveId] = React.useState(entries[0]?.id);
  const activeIndex = Math.max(0, entries.findIndex((e) => e.id === activeId));
  const active = entries[activeIndex];
  const [direction, setDirection] = React.useState(1);

  const choose = (id: string) => {
    const next = entries.findIndex((e) => e.id === id);
    setDirection(next >= activeIndex ? 1 : -1);
    setActiveId(id);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
        </div>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
          <div role="tablist" aria-label="Testimonies" className="flex flex-col gap-1.5">
            {entries.map((entry) => {
              const selected = entry.id === activeId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => choose(entry.id)}
                  className={cn(
                    "rounded-2 border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-hairline-strong bg-surface-1"
                      : "text-ink-2 hover:bg-surface-1 border-transparent",
                  )}
                >
                  <span className="text-ink block text-sm font-medium">
                    {entry.name}
                  </span>
                  <span className="text-ink-3 mt-0.5 block font-mono text-[10px] tracking-[0.08em] uppercase">
                    {entry.role}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-hairline bg-surface-1 rounded-4 relative min-h-56 overflow-hidden border p-6 sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              {active && (
                <motion.figure
                  key={active.id}
                  initial={
                    motionSafe
                      ? { opacity: 0, x: direction * distances.shift }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: durations.fast } }}
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: durations.fast }
                  }
                >
                  <blockquote className="text-ink text-lg leading-relaxed text-balance sm:text-xl">
                    “{active.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-ink text-sm font-medium">{active.name}</p>
                      <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                        {active.role}
                      </p>
                    </div>
                    <StatusSeal variant="success">{active.proof}</StatusSeal>
                  </figcaption>
                </motion.figure>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
