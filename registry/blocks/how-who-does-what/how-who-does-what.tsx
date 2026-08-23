"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LaneOwner = "you" | "product" | "team";

export type HandoffStep = {
  id: string;
  /** Who is holding the work at this step. */
  owner: LaneOwner;
  title: string;
  copy: string;
  /** Roughly how long this step takes, in plain words. */
  effort?: string;
};

export type HowWhoDoesWhatProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  steps?: HandoffStep[];
  /** Lane names, in order: your side, the product, our side. */
  lanes?: Record<LaneOwner, string>;
  className?: string;
};

const DEFAULT_LANES: Record<LaneOwner, string> = {
  you: "You",
  product: "Waylight",
  team: "Our team",
};

const DEFAULT_STEPS: HandoffStep[] = [
  {
    id: "h1",
    owner: "you",
    title: "Name one yard and its crews",
    copy: "Three questions on a form. No integration, no data export, no meeting.",
    effort: "About ten minutes",
  },
  {
    id: "h2",
    owner: "product",
    title: "A first board is cut",
    copy: "From what you named plus public tide and weather. It will be roughly right and visibly incomplete, which is the point.",
    effort: "Under a minute",
  },
  {
    id: "h3",
    owner: "you",
    title: "Correct it once, in front of us",
    copy: "You tell us what the board got wrong. Every correction is a constraint the scheduler did not know about.",
    effort: "One afternoon",
  },
  {
    id: "h4",
    owner: "team",
    title: "We wire the constraints in",
    copy: "Crane windows, crew rest, and the local rules nobody writes down. This is the part we do, not you.",
    effort: "Two or three days",
  },
  {
    id: "h5",
    owner: "product",
    title: "Mornings cut themselves",
    copy: "The board arrives before the gate opens, with its reasoning attached, every day.",
    effort: "Ongoing",
  },
  {
    id: "h6",
    owner: "you",
    title: "Take the whiteboard down",
    copy: "Whenever you are ready, and not before. Most yards leave it up for about a month.",
    effort: "Your call",
  },
];

const LANE_ORDER: LaneOwner[] = ["you", "product", "team"];

/**
 * How it works, answered as who does the work: three lanes — your side, the
 * product, and ours — with each step sitting in the lane that owns it. Most
 * how-it-works sections quietly imply the reader does everything or nothing;
 * this one commits to a division of labour, which is the question a buyer is
 * really asking when they ask how long it takes. The effort line under each
 * step is the honest part.
 */
export function HowWhoDoesWhat({
  eyebrow = "Waylight · who does what",
  headline = "Six steps, and whose job each one is.",
  copy = "Your side of this is about an afternoon in total. We have marked which steps are ours so you can hold us to them.",
  steps = DEFAULT_STEPS,
  lanes = DEFAULT_LANES,
  className,
}: HowWhoDoesWhatProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(steps.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        {/* Lane headers only exist where there are lanes to head. */}
        <div className="mt-10 hidden grid-cols-3 gap-4 border-b border-hairline pb-3 text-label text-ink-3 md:grid">
          {LANE_ORDER.map((lane) => (
            <span key={lane}>{lanes[lane]}</span>
          ))}
        </div>

        <div className="relative mt-6">
          {/* Three continuous rails behind the cards. Drawing a rail per empty
              cell instead leaves a broken column of stray lines at every gap. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden grid-cols-3 gap-4 md:grid"
          >
            {LANE_ORDER.map((lane) => (
              <span key={lane} className="flex justify-center">
                <span className="h-full w-px bg-hairline" />
              </span>
            ))}
          </div>

          <ol className="relative flex flex-col gap-4">
            {steps.map((item, index) => {
              const column = LANE_ORDER.indexOf(item.owner);
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: motionSafe ? 0 : 1 }}
                  whileInView={{ opacity: 1 }}
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
                  className="grid gap-4 md:grid-cols-3"
                >
                  {/* The lane is the position; the rail behind carries the
                    continuity as the work crosses sides. */}
                  {LANE_ORDER.map((lane, laneIndex) =>
                    laneIndex === column ? (
                      <div
                        key={lane}
                        className={cn(
                          "min-w-0 rounded-4 border border-hairline p-5",
                          item.owner === "product"
                            ? "border-hairline-strong bg-surface-1"
                            : "bg-surface-0",
                        )}
                      >
                        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3">
                          {String(index + 1).padStart(2, "0")}
                          <span className="md:hidden">
                            {" "}
                            · {lanes[item.owner]}
                          </span>
                        </p>
                        <h3 className="mt-2 font-semibold tracking-tight text-ink">
                          {item.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                          {item.copy}
                        </p>
                        {item.effort && (
                          <p className="mt-3 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                            {item.effort}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span
                        key={lane}
                        aria-hidden
                        className="hidden md:block"
                      />
                    ),
                  )}
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
