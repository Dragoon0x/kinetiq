"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HelpEntry = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export type FaqHelpDeskProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  entries?: HelpEntry[];
  searchLabel?: string;
  /** Where to go when nothing matches. */
  fallbackLine?: string;
  fallbackHref?: string;
  className?: string;
};

const DEFAULT_ENTRIES: HelpEntry[] = [
  { id: "h1", category: "Getting started", question: "How long does setup take?", answer: "One yard is an afternoon: name it, correct the first board, let it cut tomorrow's. Multi-site rollouts run two to three days with our field team." },
  { id: "h2", category: "Getting started", question: "Do I need to migrate anything?", answer: "No. Start from nothing or paste last week's plan — a spreadsheet or a photo of the whiteboard both work." },
  { id: "h3", category: "Billing", question: "What does the free tier actually include?", answer: "One yard, every instrument, full history, exports. No card and no clock — the paid tiers exist for people running several yards." },
  { id: "h4", category: "Billing", question: "How does cancelling work?", answer: "A settings page, not a phone call. Exports keep working after you leave and your history stays yours." },
  { id: "h5", category: "The record", question: "Can anyone edit the history?", answer: "No one, including us. Changes produce new rows; the record is append-only and every export carries its provenance." },
  { id: "h6", category: "The record", question: "How do audits work?", answer: "From exports. Files carry their own provenance, so a review quotes rows instead of memory." },
];

/** Wraps each case-insensitive match so the hit is visible in place. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index} className="bg-primary/20 text-ink rounded-[2px]">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * The FAQ as a help desk: a search field over categorised questions, matches
 * narrowing live with the hit highlighted in place, and every question open —
 * because someone searching has a problem, and a drawer between them and the
 * answer is friction at the worst moment. When nothing matches, the empty
 * state routes to a person rather than shrugging.
 *
 * Reduced motion: rows swap without travel.
 */
export function FaqHelpDesk({
  eyebrow = "Waylight · help desk",
  headline = "Search the questions.",
  copy = "Everything is open — no drawers between you and an answer. Type what is wrong.",
  entries = DEFAULT_ENTRIES,
  searchLabel = "Search the help desk",
  fallbackLine = "Nothing matched. Write to us — a person answers, usually within a shift.",
  fallbackHref = "#contact",
  className,
}: FaqHelpDeskProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [query, setQuery] = React.useState("");

  const trimmed = query.trim();
  const shown = React.useMemo(() => {
    if (!trimmed) return entries;
    const needle = trimmed.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.question.toLowerCase().includes(needle) ||
        entry.answer.toLowerCase().includes(needle) ||
        entry.category.toLowerCase().includes(needle),
    );
  }, [entries, trimmed]);

  const categories = React.useMemo(() => {
    const map = new Map<string, HelpEntry[]>();
    for (const entry of shown) {
      const bucket = map.get(entry.category);
      if (bucket) bucket.push(entry);
      else map.set(entry.category, [entry]);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="border-hairline bg-surface-1 mt-8 flex items-center gap-2.5 rounded-3 border px-4 py-3">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="text-ink-3 size-4 shrink-0 fill-none stroke-current"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m13.5 13.5-3-3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={searchLabel}
            placeholder="Try “cancel”, “audit”, “setup”…"
            className="text-ink placeholder:text-ink-3 w-full bg-transparent text-sm outline-none"
          />
          <span
            role="status"
            className="text-ink-3 flex shrink-0 items-baseline gap-1 font-mono text-[11px]"
          >
            <Readout value={shown.length} size="sm" />
            <span>{shown.length === 1 ? "answer" : "answers"}</span>
          </span>
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {categories.map(([category, members]) => (
            <section key={category} aria-label={category}>
              <h3 className="text-label text-ink-3">{category}</h3>
              <ul className="mt-2 flex flex-col gap-5">
                {members.map((entry) => (
                  <motion.li
                    key={entry.id}
                    layout={motionSafe}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    className="border-hairline min-w-0 border-t pt-4"
                  >
                    <h4 className="text-ink font-semibold tracking-tight">
                      {highlight(entry.question, trimmed)}
                    </h4>
                    <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                      {highlight(entry.answer, trimmed)}
                    </p>
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
          {shown.length === 0 && (
            <motion.p
              initial={{ opacity: motionSafe ? 0 : 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base }}
              className="text-ink-2 border-hairline border-t pt-5 text-sm leading-relaxed"
            >
              {fallbackLine}{" "}
              <a
                href={fallbackHref}
                className="text-ink underline underline-offset-4"
              >
                Contact
              </a>
              .
            </motion.p>
          )}
        </div>
      </div>
    </section>
  );
}
