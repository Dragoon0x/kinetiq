"use client";

import * as React from "react";

import {
  DrawerAccordion,
  DrawerAccordionContent,
  DrawerAccordionItem,
  DrawerAccordionTrigger,
} from "@/registry/ui/drawer-accordion";
import { cn } from "@/registry/lib/utils";

export type RegistryEntry = {
  id: string;
  question: string;
  answer: string;
};

export type RegistryGroup = {
  id: string;
  heading: string;
  entries: RegistryEntry[];
};

export type FaqSplitRegistryProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  groups?: RegistryGroup[];
  className?: string;
};

const DEFAULT_GROUPS: RegistryGroup[] = [
  {
    id: "benches",
    heading: "Benches",
    entries: [
      {
        id: "b1",
        question: "What exactly is a bench?",
        answer:
          "One project's working surface: its recipes, runs, and journal in a single place. A team usually keeps one bench per product line and archives it whole when the line retires.",
      },
      {
        id: "b2",
        question: "Can a bench be moved between teams?",
        answer:
          "Yes — transfer keeps every run and its lineage. The receiving team gets the full history; the sending team keeps a read-only citation trail so old reports still resolve.",
      },
    ],
  },
  {
    id: "data",
    heading: "Data & history",
    entries: [
      {
        id: "d1",
        question: "What happens to history on the free tier?",
        answer:
          "Fourteen days, then runs roll off. Nothing is deleted early, and upgrading restores the window forward from that day — we never backfill gaps we did not keep.",
      },
      {
        id: "d2",
        question: "Can we export everything?",
        answer:
          "Always. Exports are plain files with lineage attached, and they work the same on every tier — leaving with your data is not a premium feature.",
      },
    ],
  },
  {
    id: "billing",
    heading: "Billing",
    entries: [
      {
        id: "p1",
        question: "How do seats work mid-cycle?",
        answer:
          "Seats prorate daily in both directions. Adding one on the 20th bills a third of the month; removing one credits the remainder. The invoice shows the arithmetic.",
      },
      {
        id: "p2",
        question: "Is there a nonprofit rate?",
        answer:
          "Yes — the Crew tier at half rate for registered nonprofits and public research groups. One note from a work address is enough to switch it on.",
      },
    ],
  },
];

/**
 * A FAQ set like a registry: the index down the left rail — sticky, one jump
 * link per group — and the questions themselves on the right, each group a
 * drawer accordion whose panels glide open on the library's own spring. The
 * split earns the section its place: the accordion answers one question, the
 * rail answers "where is my question".
 */
export function FaqSplitRegistry({
  eyebrow = "Fieldline · questions",
  headline = "Asked, answered, on the record.",
  copy = "The questions every team asks in the first week, grouped the way they come up.",
  groups = DEFAULT_GROUPS,
  className,
}: FaqSplitRegistryProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
            <nav aria-label="Question groups" className="mt-8">
              <ul className="flex flex-col gap-1">
                {groups.map((group) => (
                  <li key={group.id}>
                    <a
                      href={`#faq-${group.id}`}
                      className="text-ink-2 hover:text-ink hover:bg-surface-1 rounded-2 block px-3 py-2 text-sm transition-colors"
                    >
                      {group.heading}
                      <span className="text-ink-3 ml-2 font-mono text-[10px]">
                        {String(group.entries.length).padStart(2, "0")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex flex-col gap-10">
            {groups.map((group) => (
              <div key={group.id} id={`faq-${group.id}`} className="scroll-mt-24">
                <p className="text-label text-ink-3 mb-3">{group.heading}</p>
                <DrawerAccordion>
                  {group.entries.map((entry) => (
                    <DrawerAccordionItem key={entry.id} value={entry.id}>
                      <DrawerAccordionTrigger>
                        {entry.question}
                      </DrawerAccordionTrigger>
                      <DrawerAccordionContent className="text-ink-2">
                        {entry.answer}
                      </DrawerAccordionContent>
                    </DrawerAccordionItem>
                  ))}
                </DrawerAccordion>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
