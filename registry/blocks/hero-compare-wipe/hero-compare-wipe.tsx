"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { SliceCompare } from "@/registry/ui/slice-compare";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WipeLine = { id: string; time: string; text: string };

export type HeroCompareWipeProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  cta?: string;
  onCta?: () => void;
  altLabel?: string;
  altHref?: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** The old way, as it actually looked. */
  before?: WipeLine[];
  /** The same morning, after. */
  after?: WipeLine[];
  className?: string;
};

const DEFAULT_BEFORE: WipeLine[] = [
  { id: "b1", time: "06:40", text: "radio: who has the crane?" },
  { id: "b2", time: "06:52", text: "radio: still checking" },
  { id: "b3", time: "07:15", text: "whiteboard redrawn (2nd time)" },
  { id: "b4", time: "07:40", text: "crew B idle, cause unknown" },
];

const DEFAULT_AFTER: WipeLine[] = [
  { id: "a1", time: "06:40", text: "plan r2 posted — crane to yard 3" },
  { id: "a2", time: "06:52", text: "crew B ack, second slot" },
  { id: "a3", time: "07:15", text: "no change" },
  { id: "a4", time: "07:40", text: "no change" },
];

/**
 * A hero for products that replace something: the argument on the left, and
 * on the right the same morning twice with a blade between them the reader
 * drags themselves. Handing over the blade is the point — a claim the visitor
 * proves with their own hand in the first ten seconds is worth more than any
 * headline, and the wipe belongs entirely to the compare instrument.
 */
export function HeroCompareWipe({
  eyebrow = "Waylight",
  headline = "Drag the blade. That is the pitch.",
  copy = "Left is a morning on radio and a whiteboard. Right is the same morning on a shared record. Same yard, same crane, same weather.",
  cta = "Try a Tuesday",
  onCta,
  altLabel = "See how a rollout goes",
  altHref = "#rollout",
  beforeLabel = "On the radio",
  afterLabel = "On the record",
  before = DEFAULT_BEFORE,
  after = DEFAULT_AFTER,
  className,
}: HeroCompareWipeProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(3);

  const rise = (index: number) => ({
    initial: {
      opacity: motionSafe ? 0 : 1,
      y: motionSafe ? distances.shift : 0,
    },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay: index * step }
      : { duration: 0 },
  });

  // Rows span the full width with a state marker at the right edge, so both
  // sides of the blade always carry content — a panel whose text happens to
  // end before the blade would otherwise read as blank rather than as the
  // other half of the same table. Top padding clears the instrument's labels.
  const panel = (lines: WipeLine[], tone: "before" | "after") => (
    <div
      className={cn(
        "flex h-full flex-col px-5 pt-11 pb-5",
        tone === "before" ? "bg-surface-2" : "bg-surface-1",
      )}
    >
      {lines.map((line) => (
        <p
          key={line.id}
          className="flex min-w-0 items-baseline gap-3 border-b border-hairline py-2 font-mono text-[11px] last:border-b-0"
        >
          <span className="shrink-0 text-ink-3">{line.time}</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              tone === "before" ? "text-ink-3" : "text-ink",
            )}
          >
            {line.text}
          </span>
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-[10px]",
              tone === "before"
                ? "text-ink-3"
                : "text-[var(--success,var(--primary))]",
            )}
          >
            {tone === "before" ? "?" : "ok"}
          </span>
        </p>
      ))}
    </div>
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative overflow-hidden bg-surface-0", className)}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <motion.p {...rise(0)} className="text-label text-ink-3">
            {eyebrow}
          </motion.p>
          <motion.h1
            {...rise(1)}
            id={headingId}
            className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            {headline}
          </motion.h1>
          <motion.p
            {...rise(2)}
            className="mt-5 max-w-md text-lg leading-relaxed text-ink-2"
          >
            {copy}
          </motion.p>
          <motion.div
            {...rise(3)}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            <PressureButton size="lg" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <a
              href={altHref}
              className="text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
            >
              {altLabel}
            </a>
          </motion.div>
        </div>

        <motion.div {...rise(2)} className="min-w-0">
          <div className="overflow-hidden rounded-4 border border-hairline shadow-raised">
            <SliceCompare
              before={panel(before, "before")}
              after={panel(after, "after")}
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
              height={220}
              aria-label="The same morning, before and after"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
