"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BenchPerson = {
  id: string;
  name: string;
  role: string;
  /** Two or three words on what they came from. */
  from: string;
  initials?: string;
};

export type OpenSeat = {
  id: string;
  role: string;
  /** Who the seat is for, in one line. */
  forWhom: string;
  href: string;
};

export type TeamOpenBenchProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  people?: BenchPerson[];
  seats?: OpenSeat[];
  seatsTitle?: string;
  className?: string;
};

const DEFAULT_PEOPLE: BenchPerson[] = [
  {
    id: "p1",
    name: "Mara Aldana",
    role: "Founder",
    from: "twelve years of yards",
  },
  { id: "p2", name: "Tobias Brekke", role: "Systems", from: "port scheduling" },
  { id: "p3", name: "Sade Okonkwo", role: "Design", from: "instrument panels" },
  {
    id: "p4",
    name: "Ilya Renner",
    role: "Reliability",
    from: "rail signalling",
  },
  { id: "p5", name: "Nour Hadid", role: "Field", from: "the crews we sell to" },
];

const DEFAULT_SEATS: OpenSeat[] = [
  {
    id: "s1",
    role: "Backend engineer",
    forWhom:
      "For someone who thinks scheduling is a data problem and can prove it.",
    href: "#backend",
  },
  {
    id: "s2",
    role: "Support lead — first hire",
    forWhom:
      "For someone who has run a shift and can answer at six in the morning.",
    href: "#support",
  },
];

/**
 * The bench as it actually stands: the people on it, and — in the same grid,
 * in the same weight — the seats that are still empty. Most pages split these
 * into a team section and a careers page, which quietly implies the team is
 * finished. Showing both says the truer thing, and gives a small company one
 * section where it needed two.
 */
export function TeamOpenBench({
  eyebrow = "Waylight · the bench",
  headline = "Five of us, and two seats we mean to fill.",
  copy = "Everyone here has worked a yard or built the instruments for one. The empty seats are listed at the same size as the full ones, because they are the same decision.",
  people = DEFAULT_PEOPLE,
  seats = DEFAULT_SEATS,
  seatsTitle = "Open seats",
  className,
}: TeamOpenBenchProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(people.length + seats.length);

  const rise = (index: number) => ({
    initial: {
      opacity: motionSafe ? 0 : 1,
      y: motionSafe ? distances.shift : 0,
    },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 } as const,
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay: index * step }
      : { duration: 0 },
  });

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
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
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person, index) => (
            <motion.li
              key={person.id}
              {...rise(index)}
              className="flex min-w-0 items-center gap-4 rounded-4 border border-hairline bg-surface-1 p-4"
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-0 font-mono text-xs text-ink-3"
              >
                {person.initials ?? initialsOf(person.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {person.name}
                </span>
                <span className="block truncate text-sm text-ink-3">
                  {person.role} · {person.from}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>

        <div className="mt-12">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              {seatsTitle}
            </h3>
            <StatusSeal count={seats.length}>open</StatusSeal>
          </div>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {seats.map((seat, index) => (
              <motion.li key={seat.id} {...rise(people.length + index)}>
                <a
                  href={seat.href}
                  className="group flex h-full min-w-0 flex-col rounded-4 border border-dashed border-hairline-strong p-5 transition-colors hover:border-primary/50 hover:bg-surface-1"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium text-ink">{seat.role}</span>
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-primary"
                    />
                  </span>
                  <span className="mt-2 text-sm leading-relaxed text-ink-2">
                    {seat.forWhom}
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
