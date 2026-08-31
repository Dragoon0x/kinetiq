"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { GradientTitle } from "@/registry/ui/gradient-title";
import { HoverSwap } from "@/registry/ui/hover-swap";
import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SignatureWork = {
  id: string;
  title: string;
  role: string;
  year: string;
  /** The one line that earns the row — shown under hover or focus. */
  outcome: string;
  href?: string;
};

export type SignatureNote = {
  id: string;
  title: string;
  /** Pre-formatted, e.g. "Apr 2026". */
  date: string;
  href?: string;
};

export type TemplateSignatureProps = {
  name?: string;
  /** The one-line bio under the name. */
  bio?: string;
  /** The word in the bio that rolls, and what it rolls to. */
  statusLine?: string;
  available?: boolean;
  work?: SignatureWork[];
  notes?: SignatureNote[];
  email?: string;
  elsewhere?: { id: string; label: string; href: string }[];
  className?: string;
};

const DEFAULT_WORK: SignatureWork[] = [
  {
    id: "w1",
    title: "Waylight",
    role: "Design engineering",
    year: "2024 —",
    outcome: "The morning board that cuts itself; I own the instruments.",
  },
  {
    id: "w2",
    title: "Gaugeworks",
    role: "Product design",
    year: "2022 – 24",
    outcome: "Calibration UI for field meters — read at arm's length, in rain.",
  },
  {
    id: "w3",
    title: "Fernworks",
    role: "First designer",
    year: "2020 – 22",
    outcome: "From napkin to a nursery-floor system with four hands on it.",
  },
  {
    id: "w4",
    title: "Basinworks",
    role: "Contract",
    year: "2019",
    outcome: "A berth ledger the harbourmaster still opens every morning.",
  },
];

const DEFAULT_NOTES: SignatureNote[] = [
  {
    id: "n1",
    title: "Interfaces that survive gloves",
    date: "Jun 2026",
  },
  {
    id: "n2",
    title: "Why the whiteboard keeps winning",
    date: "Feb 2026",
  },
  {
    id: "n3",
    title: "Settle time is a design token",
    date: "Nov 2025",
  },
  {
    id: "n4",
    title: "Notes on honest empty states",
    date: "Jul 2025",
  },
];

const DEFAULT_ELSEWHERE = [
  { id: "e1", label: "GitHub", href: "#github" },
  { id: "e2", label: "Are.na", href: "#arena" },
  { id: "e3", label: "Reading list", href: "#reading" },
];

/**
 * The personal site as a signature: one column, monochrome, over in two
 * scrolls. The name takes the sheen, the bio takes one rolling word, and
 * everything else is rows — work that leads with the outcome instead of the
 * logo, writing as titles and dates, and a footer that is just an email and
 * three elsewheres. The restraint is the design: on a personal page the
 * person is the product, and rows read as confidence where cards read as
 * effort.
 */
export function TemplateSignature({
  name = "Rowan Vale",
  bio = "Design engineer for working software — boards, meters, and ledgers that people read before six in the morning.",
  statusLine = "Taking new work from October",
  available = true,
  work = DEFAULT_WORK,
  notes = DEFAULT_NOTES,
  email = "rowan@signature.example",
  elsewhere = DEFAULT_ELSEWHERE,
  className,
}: TemplateSignatureProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(6);

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

  return (
    <div className={cn("min-h-screen bg-surface-0", className)}>
      <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-16 sm:py-24">
        {/* The header is the hero. A personal page does not need a nav to
            find four headings on one column. */}
        <motion.header {...rise(0)}>
          <GradientTitle
            as="h1"
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            {name}
          </GradientTitle>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-2">
            {bio}
          </p>
          <p className="mt-4">
            <StatusPip
              status={available ? "online" : "busy"}
              label={statusLine}
              pulse={motionSafe && available}
            />
          </p>
        </motion.header>

        {/* Selected work: rows that lead with the outcome, not the logo. */}
        <motion.section {...rise(1)} aria-label="Selected work" className="mt-14">
          <h2 className="text-label text-ink-3">Selected work</h2>
          <ul className="mt-3 flex flex-col divide-y divide-hairline border-y border-hairline">
            {work.map((item, index) => (
              <li key={item.id}>
                <a
                  href={item.href ?? "#work"}
                  className={cn(
                    "group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 py-3.5",
                    "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                  )}
                >
                  <span className="font-mono text-[10px] text-ink-3">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold tracking-tight text-ink">
                      {item.title}
                      <span className="ml-2 text-sm font-normal text-ink-3">
                        {item.role}
                      </span>
                    </span>
                    {/* The outcome line unfolds where a card would have put
                        a thumbnail — the sentence is the portfolio. */}
                    <span
                      className={cn(
                        "grid grid-rows-[0fr] text-sm leading-relaxed text-ink-2",
                        "transition-[grid-template-rows] duration-300 ease-out",
                        "group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]",
                        !motionSafe && "grid-rows-[1fr]",
                      )}
                    >
                      <span className="overflow-hidden">
                        <span className="block pt-1">{item.outcome}</span>
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {item.year}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Writing: titles and dates. If a list needs imagery to be worth
            reading, the titles are the problem. */}
        <motion.section {...rise(2)} aria-label="Writing" className="mt-12">
          <h2 className="text-label text-ink-3">Writing</h2>
          <ul className="mt-3 flex flex-col">
            {notes.map((note) => (
              <li key={note.id}>
                <a
                  href={note.href ?? "#writing"}
                  className={cn(
                    "group flex items-baseline justify-between gap-4 py-2",
                    "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-ink underline-offset-4 group-hover:underline">
                    {note.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">
                    {note.date}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* The footer is the contact section. One address, three elsewheres,
            and the email link has something to add under the hand. */}
        <motion.footer {...rise(3)} className="mt-14 border-t border-hairline pt-8">
          <a
            href={`mailto:${email}`}
            className={cn(
              "inline-flex items-center gap-1.5 text-lg font-medium tracking-tight text-ink",
              "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
            )}
          >
            <HoverSwap alternate="Replies within a day">{email}</HoverSwap>
            <ArrowUpRight className="size-4 text-ink-3" aria-hidden />
          </a>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            {elsewhere.map((link) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  className={cn(
                    "text-sm text-ink-3 transition-colors hover:text-ink",
                    "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Set in one column · {name}
          </p>
        </motion.footer>
      </div>
    </div>
  );
}
