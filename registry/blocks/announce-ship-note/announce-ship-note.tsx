"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShipLine = {
  id: string;
  kind: "added" | "fixed" | "changed";
  text: string;
};

export type AnnounceShipNoteProps = {
  /** Release name or number. */
  version?: string;
  /** Pre-formatted date — the strip never touches a clock. */
  date?: string;
  headline?: string;
  lines?: ShipLine[];
  linkLabel?: string;
  href?: string;
  className?: string;
};

const KIND_LABEL: Record<ShipLine["kind"], string> = {
  added: "new",
  fixed: "fix",
  changed: "changed",
};

const DEFAULT_LINES: ShipLine[] = [
  {
    id: "l1",
    kind: "added",
    text: "Boards can be signed from the gate view, without opening the plan.",
  },
  {
    id: "l2",
    kind: "changed",
    text: "Reshuffles now name the constraint that caused them, not just the time.",
  },
  {
    id: "l3",
    kind: "fixed",
    text: "Exports no longer drop the final row of a shift that closed after midnight.",
  },
];

/**
 * The week's shipping note as a strip between sections: a version, a date,
 * and three lines that say what actually changed — tagged new, changed, or
 * fixed, with the fix shown rather than hidden. A product that publishes its
 * fixes in the same voice as its features is making a small, cheap, and
 * unusually convincing claim about how it is run.
 */
export function AnnounceShipNote({
  version = "r2.14",
  date = "6 March",
  headline = "This week, three things moved.",
  lines = DEFAULT_LINES,
  linkLabel = "Full changelog",
  href = "#changelog",
  className,
}: AnnounceShipNoteProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(lines.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative border-y border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <StatusSeal>{version}</StatusSeal>
          <h2
            id={headingId}
            className="text-lg font-semibold tracking-tight text-ink"
          >
            {headline}
          </h2>
          <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
            {date}
          </span>
        </div>

        <ul className="mt-5 flex flex-col gap-2.5">
          {lines.map((line, index) => (
            <motion.li
              key={line.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="flex min-w-0 items-baseline gap-3"
            >
              <span
                className={cn(
                  "w-16 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                  line.kind === "fixed" ? "text-ink-3" : "text-ink-2",
                )}
              >
                {KIND_LABEL[line.kind]}
              </span>
              <span className="min-w-0 text-sm leading-relaxed text-ink-2">
                {line.text}
              </span>
            </motion.li>
          ))}
        </ul>

        <a
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
        >
          {linkLabel}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>
    </section>
  );
}
