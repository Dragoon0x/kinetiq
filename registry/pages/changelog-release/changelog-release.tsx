"use client";

import * as React from "react";

import { ArrowLeft } from "lucide-react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ReleaseNote = {
  id: string;
  title: string;
  /** The paragraphs for this note. */
  body: string[];
};

export type BreakingChange = {
  id: string;
  what: string;
  /** What a consumer has to do about it, and by when. */
  action: string;
};

export type ChangelogReleaseProps = {
  backLabel?: string;
  backHref?: string;
  version?: string;
  date?: string;
  headline?: string;
  standfirst?: string;
  notes?: ReleaseNote[];
  /** Breaking changes, given their own block at the top rather than a footnote. */
  breaking?: BreakingChange[];
  /** The fixes, listed plainly and never hidden. */
  fixes?: string[];
  className?: string;
};

const DEFAULT_NOTES: ReleaseNote[] = [
  {
    id: "n1",
    title: "Signing from the gate",
    body: [
      "A yard lead can now sign a board from the gate view without opening the full plan. The signature carries the same weight and lands on the same record — the only thing that changed is how many taps it takes in the rain.",
      "This came from watching three rollouts where the lead signed from a desk an hour after the shift began, because the gate screen could not do it. The record was accurate and the timestamp was a fiction.",
    ],
  },
  {
    id: "n2",
    title: "Reshuffles name their cause",
    body: [
      "Every re-cut now carries the constraint that triggered it, not just the time it happened. A crew reading a changed board can see that crane 2 went on hold rather than inferring it.",
    ],
  },
];

const DEFAULT_BREAKING: BreakingChange[] = [
  {
    id: "b1",
    what: "The board.cut webhook payload now includes a `cause` object. Existing fields are unchanged.",
    action:
      "Nothing required — additive. If you validate payloads strictly against a schema, widen it before 3 April.",
  },
];

const DEFAULT_FIXES = [
  "Exports dropped the final row of a shift that closed after midnight.",
  "Crew rest was counted from shift start rather than shift end, shortening rest by up to an hour on back shifts.",
  "The gate view could show a stale board for up to ninety seconds after a reshuffle.",
];

/**
 * One release, at length — with breaking changes given their own block at the
 * top rather than a footnote at the bottom, and the fixes listed in full.
 * Release notes that lead with features and bury the migration note are how
 * integrations break quietly on a Tuesday.
 */
export function ChangelogRelease({
  backLabel = "All releases",
  backHref = "/changelog",
  version = "r2.14",
  date = "6 March",
  headline = "Signing from the gate",
  standfirst = "The shortest release note we have written, and the one that took longest to get right.",
  notes = DEFAULT_NOTES,
  breaking = DEFAULT_BREAKING,
  fixes = DEFAULT_FIXES,
  className,
}: ChangelogReleaseProps) {
  const headingId = React.useId();

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {backLabel}
        </a>

        <div className="mt-8 flex flex-wrap items-baseline gap-3">
          <StatusSeal>{version}</StatusSeal>
          <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
            {date}
          </span>
        </div>
        <h1
          id={headingId}
          className="mt-4 text-4xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{standfirst}</p>

        {/* Breaking changes go first. A migration note at the bottom of a
            release is a migration note nobody read. */}
        {breaking.length > 0 && (
          <section className="mt-10 rounded-4 border border-hairline-strong bg-surface-1 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold tracking-tight text-ink">
                If you integrate with us
              </h2>
              <StatusSeal variant="warn">read this first</StatusSeal>
            </div>
            <dl className="mt-4 flex flex-col gap-4">
              {breaking.map((item) => (
                <div key={item.id} className="min-w-0">
                  <dt className="text-sm leading-relaxed text-ink-2">
                    {item.what}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-ink-3">
                    <span className="text-label text-ink-3">What to do · </span>
                    {item.action}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="mt-12 flex flex-col gap-10">
          {notes.map((note) => (
            <section key={note.id} className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {note.title}
              </h2>
              {note.body.map((paragraph, index) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className={cn(
                    "leading-relaxed text-ink-2",
                    index === 0 ? "mt-3" : "mt-4",
                  )}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        {fixes.length > 0 && (
          <section className="mt-12 border-t border-hairline pt-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Fixed
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {fixes.map((fix) => (
                <li
                  key={fix}
                  className="flex items-start gap-3 text-sm leading-relaxed text-ink-2"
                >
                  <span
                    aria-hidden
                    className="mt-2.5 h-px w-3 shrink-0 bg-hairline-strong"
                  />
                  {fix}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
