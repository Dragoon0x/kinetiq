"use client";

import * as React from "react";

import {
  DrawerAccordion,
  DrawerAccordionContent,
  DrawerAccordionItem,
  DrawerAccordionTrigger,
} from "@/registry/ui/drawer-accordion";
import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type DeskQuestion = {
  id: string;
  question: string;
  answer: string;
  /** Extra match terms the visible text does not carry. */
  keywords?: string[];
};

export type FaqCounterDeskProps = {
  eyebrow?: string;
  headline?: string;
  questions?: DeskQuestion[];
  /** Where the unanswered go. */
  contactLabel?: string;
  onContact?: (query: string) => void;
  className?: string;
};

const DEFAULT_QUESTIONS: DeskQuestion[] = [
  {
    id: "q1",
    question: "Does Keeper need an agent on every host?",
    answer:
      "One lightweight agent per host, installed by the same line as the CLI. It holds no policy of its own — it asks the fleet plane on every check, so rules change everywhere at once.",
    keywords: ["install", "daemon"],
  },
  {
    id: "q2",
    question: "What happens when a host is offline at enforcement time?",
    answer:
      "It enforces on reconnect before anything else runs, and the gap is logged as a gap — the audit never pretends an offline hour was a compliant one.",
    keywords: ["disconnected", "airgap"],
  },
  {
    id: "q3",
    question: "Can a policy be tested before it applies?",
    answer:
      "Every policy runs in rehearsal first: same hosts, same checks, effects logged but not applied. Promotion to enforcing is a one-line change with the rehearsal report attached.",
    keywords: ["dry run", "staging"],
  },
  {
    id: "q4",
    question: "Who can change a rule?",
    answer:
      "Only signers on the policy's owning team, and every change lands with author, review, and the diff. There is no console toggle that skips the record.",
    keywords: ["permissions", "rbac", "approval"],
  },
];

/**
 * A FAQ with a counter desk: ask first, browse second. The filter is the
 * library's own traced field, narrowing the drawers live as you type —
 * matching question, answer, and hidden keywords — and when nothing matches,
 * the desk says so plainly and offers a person, carrying your words along.
 */
export function FaqCounterDesk({
  eyebrow = "Keeper · questions",
  headline = "Ask it — someone already has.",
  questions = DEFAULT_QUESTIONS,
  contactLabel = "Ask a person instead",
  onContact,
  className,
}: FaqCounterDeskProps) {
  const headingId = React.useId();
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? questions.filter((q) =>
        [q.question, q.answer, ...(q.keywords ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : questions;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
        </div>

        <div className="mt-8">
          <TraceInput
            label="Search the questions"
            labelHidden
            placeholder="Type to filter — offline, rehearsal, who can change…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>

        <p role="status" className="text-label text-ink-3 mt-3">
          {needle
            ? `${matches.length} of ${questions.length} match`
            : `${questions.length} questions`}
        </p>

        <div className="mt-4">
          {matches.length > 0 ? (
            <DrawerAccordion>
              {matches.map((entry) => (
                <DrawerAccordionItem key={entry.id} value={entry.id}>
                  <DrawerAccordionTrigger>{entry.question}</DrawerAccordionTrigger>
                  <DrawerAccordionContent className="text-ink-2">
                    {entry.answer}
                  </DrawerAccordionContent>
                </DrawerAccordionItem>
              ))}
            </DrawerAccordion>
          ) : (
            <div className="border-hairline rounded-3 flex flex-col items-center gap-4 border border-dashed px-6 py-12 text-center">
              <p className="text-ink font-medium">
                Nobody has asked that yet.
              </p>
              <p className="text-ink-3 max-w-sm text-sm">
                Which usually means it is a good question. Send it over and the
                answer will end up on this page.
              </p>
              <PressureButton onClick={() => onContact?.(query)}>
                {contactLabel}
              </PressureButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
