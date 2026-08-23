"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ResumeSection = {
  id: string;
  title: string;
  /** What this section asks for, in one line. */
  asks: string;
  /** Minutes it usually takes. */
  minutes: number;
  done?: boolean;
  /** Who has to do it, when that is not the reader. */
  owner?: string;
};

export type StepformResumeLaterProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  sections?: ResumeSection[];
  continueLabel?: string;
  onContinue?: (id: string) => void;
  /** The promise that makes leaving safe. */
  savedLine?: string;
  className?: string;
};

const DEFAULT_SECTIONS: ResumeSection[] = [
  {
    id: "s1",
    title: "The yard",
    asks: "Name, location, and how many crews",
    minutes: 3,
    done: true,
  },
  {
    id: "s2",
    title: "Gear and constraints",
    asks: "Cranes, rigs, and anything shared with another site",
    minutes: 12,
    done: true,
  },
  {
    id: "s3",
    title: "Shift patterns",
    asks: "Start times, rest rules, and your usual rotation",
    minutes: 8,
  },
  {
    id: "s4",
    title: "Payroll codes",
    asks: "How signed hours map to your finance system",
    minutes: 15,
    owner: "Your finance lead",
  },
  {
    id: "s5",
    title: "Gate devices",
    asks: "Which screens live at which gates",
    minutes: 6,
  },
];

/**
 * The long form that admits it is long: every section listed with what it
 * asks for and how many minutes it takes, what is already done, and — the
 * part that makes it usable — which sections somebody else has to fill in.
 * A setup that needs finance to supply payroll codes cannot be completed in
 * one sitting by one person, and a wizard that pretends otherwise just
 * strands them on step four.
 */
export function StepformResumeLater({
  eyebrow = "Waylight · setup",
  headline = "Two done, three to go.",
  copy = "Everything saves as you type. Close the tab whenever you like — the link in your email comes back to exactly here.",
  sections = DEFAULT_SECTIONS,
  continueLabel = "Continue",
  onContinue,
  savedLine = "Saved a moment ago",
  className,
}: StepformResumeLaterProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(sections.length);

  const done = sections.filter((section) => section.done).length;
  const remaining = sections.filter((section) => !section.done);
  const minutesLeft = remaining.reduce(
    (sum, section) => sum + section.minutes,
    0,
  );
  const next = remaining[0];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
          </div>
          <StatusSeal variant="success">{savedLine}</StatusSeal>
        </div>
        <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

        <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-hairline py-5">
          <div className="min-w-0">
            <dd className="flex items-baseline gap-1">
              <Readout value={done} size="lg" />
              <span className="text-sm text-ink-3">of {sections.length}</span>
            </dd>
            <dt className="mt-1 text-label text-ink-3">sections done</dt>
          </div>
          <div className="min-w-0">
            <dd className="flex items-baseline gap-1">
              <Readout value={minutesLeft} size="lg" />
              <span className="text-sm text-ink-3">min</span>
            </dd>
            <dt className="mt-1 text-label text-ink-3">left, roughly</dt>
          </div>
        </dl>

        <ul className="mt-6 flex flex-col">
          {sections.map((section, index) => (
            <motion.li
              key={section.id}
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
              className="flex min-w-0 items-start gap-4 border-b border-hairline py-4 last:border-b-0"
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  section.done
                    ? "border-[var(--success,var(--primary))] bg-[var(--success,var(--primary))]/15"
                    : "border-hairline-strong",
                )}
              >
                {section.done && (
                  <Check className="size-3 text-[var(--success,var(--primary))]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-medium",
                    section.done ? "text-ink-3" : "text-ink",
                  )}
                >
                  {section.title}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-3">
                  {section.asks}
                </span>
                {section.owner && (
                  <span className="mt-1.5 block font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase">
                    Needs {section.owner}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3">
                {section.done ? "done" : `${section.minutes} min`}
              </span>
            </motion.li>
          ))}
        </ul>

        {next && (
          <PressureButton
            size="lg"
            onClick={() => onContinue?.(next.id)}
            className="mt-8"
          >
            {continueLabel} — {next.title}
          </PressureButton>
        )}
      </div>
    </section>
  );
}
