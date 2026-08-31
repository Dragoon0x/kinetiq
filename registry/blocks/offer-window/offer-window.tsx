"use client";

import * as React from "react";

import { motion } from "motion/react";

import { VignetteAppWindow } from "@/registry/ui/vignette-app-window";
import { PressureButton } from "@/registry/ui/pressure-button";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OfferCard = { id: string; title: string; copy: string };

export type OfferWindowProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  cta?: string;
  onCta?: () => void;
  cards?: OfferCard[];
  className?: string;
};

const DEFAULT_CARDS: OfferCard[] = [
  {
    id: "c1",
    title: "The morning, cut for you",
    copy: "Boards arrive before the gate opens, constraints printed on the sheet.",
  },
  {
    id: "c2",
    title: "Changes that propagate",
    copy: "One reshuffle updates every board that shares the constraint.",
  },
  {
    id: "c3",
    title: "A record that holds up",
    copy: "Audits answered from exports, not screenshots and memory.",
  },
];

/**
 * The offer stated beside the product doing it: value proposition on the
 * left, a live app-window vignette on the right, and the capability cards
 * beneath — the "what we actually sell" section for pages that need one
 * clear paragraph, one visible proof, and one action. The vignette is the
 * proof; a claims list beside a screenshot is just two kinds of assertion.
 */
export function OfferWindow({
  eyebrow = "Waylight · what we offer",
  headline = "A morning that runs itself.",
  copy = "One system for the plan, the changes, and the record — sold as a working morning, not a feature list.",
  cta = "See a live yard",
  onCta,
  cards = DEFAULT_CARDS,
  className,
}: OfferWindowProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(cards.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 text-lg leading-relaxed">{copy}</p>
            <div className="mt-7">
              <PressureButton size="lg" onClick={onCta}>
                {cta}
              </PressureButton>
            </div>
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <VignetteAppWindow />
          </div>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          {cards.map((card, index) => (
            <motion.li
              key={card.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="border-hairline bg-surface-1 min-w-0 rounded-4 border p-5"
            >
              <h3 className="text-ink font-semibold tracking-tight">
                {card.title}
              </h3>
              <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                {card.copy}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
