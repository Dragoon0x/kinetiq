"use client";

import * as React from "react";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";

import { HowPlainSteps } from "@/registry/blocks/how-plain-steps/how-plain-steps";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RoleFact = { id: string; label: string; value: string };

export type CareersRoleProps = {
  backLabel?: string;
  backHref?: string;
  role?: string;
  /** Who the seat is for, in one line. */
  forWhom?: string;
  facts?: RoleFact[];
  /** What the person will actually do, first ninety days. */
  doing?: string[];
  /** What we are not asking for — the list that saves everyone time. */
  notAsking?: string[];
  /** The salary, stated. */
  payLine?: string;
  applyLabel?: string;
  applyHref?: string;
  onApply?: () => void;
  className?: string;
};

const DEFAULT_FACTS: RoleFact[] = [
  {
    id: "f1",
    label: "Where",
    value: "Rotterdam or Gdańsk, two days a week in",
  },
  { id: "f2", label: "Reports to", value: "Tobias, who wrote most of it" },
  { id: "f3", label: "Team", value: "Six engineers, one designer" },
  {
    id: "f4",
    label: "Interviewing",
    value: "Three conversations, no take-home",
  },
];

const DEFAULT_DOING = [
  "Own the constraint solver — the part that decides what a board may contain.",
  "Sit in on two rollouts, at the yard, at six in the morning.",
  "Ship the change that lets one board carry more than one site's constraints.",
];

const DEFAULT_NOT_ASKING = [
  "A take-home exercise",
  "Ten years of anything",
  "A portfolio, a cover letter, or a reason you left your last job",
];

/**
 * A single role, written so the wrong applicant can rule themselves out in
 * ninety seconds: the pay stated, the interview loop described, what the
 * person will actually do in their first months, and a list of what is not
 * being asked for. The last list is the unusual one, and it is the reason
 * this page gets fewer, better applications.
 */
export function CareersRole({
  backLabel = "All open seats",
  backHref = "/careers",
  role = "Backend engineer — scheduling",
  forWhom = "For someone who thinks scheduling is a data problem and can prove it.",
  facts = DEFAULT_FACTS,
  doing = DEFAULT_DOING,
  notAsking = DEFAULT_NOT_ASKING,
  payLine = "€92,000–€118,000 depending on where you land in the band, plus equity. We will tell you the band before the first call, and we do not negotiate against other offers — the number is the number.",
  applyLabel = "Apply",
  applyHref = "#apply",
  onApply,
  className,
}: CareersRoleProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(facts.length);

  return (
    <main className={cn("bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {backLabel}
        </a>

        <h1
          id={headingId}
          className="mt-8 text-4xl font-semibold tracking-tight text-balance text-ink"
        >
          {role}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{forWhom}</p>

        <dl className="mt-10 grid gap-5 border-y border-hairline py-6 sm:grid-cols-2">
          {facts.map((fact, index) => (
            <motion.div
              key={fact.id}
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
              className="min-w-0"
            >
              <dt className="text-label text-ink-3">{fact.label}</dt>
              <dd className="mt-1 text-sm text-ink-2">{fact.value}</dd>
            </motion.div>
          ))}
        </dl>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            The first ninety days
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {doing.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 leading-relaxed text-ink-2"
              >
                <span
                  aria-hidden
                  className="mt-3 h-px w-3 shrink-0 bg-hairline-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-4 border border-hairline bg-surface-1 p-6">
          <h2 className="font-semibold tracking-tight text-ink">
            What we are not asking for
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {notAsking.map((item) => (
              <li
                key={item}
                className="font-mono text-[11px] tracking-[0.04em] text-ink-3 line-through"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Pay
            </h2>
            <StatusSeal variant="success">band published</StatusSeal>
          </div>
          <p className="mt-3 leading-relaxed text-ink-2">{payLine}</p>
        </section>
      </div>

      {/* The interview loop, in the library's plainest how-it-works shape. */}
      <HowPlainSteps
        eyebrow="Waylight · how hiring goes"
        headline="Three conversations, then a decision."
        steps={[
          {
            id: "h1",
            title: "Half an hour with Tobias",
            copy: "What you have built and what you would want to change here. No whiteboard.",
          },
          {
            id: "h2",
            title: "Two hours on real code",
            copy: "Our repository, a real open issue, paired with whoever would sit next to you.",
          },
          {
            id: "h3",
            title: "A decision inside a week",
            copy: "Yes or no, with the reason either way. We do not keep people warm.",
          },
        ]}
        footnote="Paid for the two-hour session at your day rate, whether or not we make an offer."
      />

      <div className="mx-auto w-full max-w-3xl px-6 pb-20 sm:pb-24">
        <PressureButton
          size="lg"
          onClick={onApply}
          className="w-full sm:w-auto"
        >
          {applyLabel}
        </PressureButton>
        <p className="mt-3 text-sm text-ink-3">
          Or write to careers at waylight — a person reads it, and you will hear
          back either way.{" "}
          <a
            href={applyHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            Application form
          </a>
          .
        </p>
      </div>
    </main>
  );
}
