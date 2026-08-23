"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";

export type Founder = {
  id: string;
  name: string;
  role: string;
  /** The thing this person is answerable for, named plainly. */
  accountableFor: string;
  initials?: string;
};

export type TeamFoundersNoteProps = {
  eyebrow?: string;
  headline?: string;
  /** The note, as paragraphs. */
  note?: string[];
  founders?: Founder[];
  accountableLabel?: string;
  /** How to reach them, without a form. */
  contactLine?: string;
  contactHref?: string;
  className?: string;
};

const DEFAULT_NOTE = [
  "We started Waylight because we had both spent years watching good crews lose their mornings to an argument about what had happened overnight. Not to hard work, not to weather — to the absence of a shared record.",
  "We are two people and a small team, and we intend to stay small enough that you can find out who made a decision. That is why the list below says what each of us is answerable for rather than giving us titles.",
  "If something here is wrong, one of us wrote it, and one of us will answer for it.",
];

const DEFAULT_FOUNDERS: Founder[] = [
  {
    id: "f1",
    name: "Mara Aldana",
    role: "Founder",
    accountableFor:
      "What the scheduler decides, and every plan it refuses to explain.",
  },
  {
    id: "f2",
    name: "Tobias Brekke",
    role: "Founder",
    accountableFor:
      "Whether it stays up, and what we publish when it does not.",
  },
];

/**
 * The founders' note, signed, with each name attached to the thing it is
 * answerable for rather than to a title. A team section built from job titles
 * tells the reader nothing they can act on; a short list of who answers for
 * what tells them exactly who to write to when something breaks — which is
 * the only question a team section can usefully answer on a marketing page.
 */
export function TeamFoundersNote({
  eyebrow = "Waylight · who is behind it",
  headline = "Two of us, and what each of us answers for.",
  note = DEFAULT_NOTE,
  founders = DEFAULT_FOUNDERS,
  accountableLabel = "Answerable for",
  contactLine = "Both addresses are first name at waylight, and they reach us rather than a queue.",
  contactHref = "#contact",
  className,
}: TeamFoundersNoteProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>

        <div className="mt-8 max-w-prose">
          {note.map((paragraph, index) => (
            <p
              key={paragraph.slice(0, 24)}
              className={cn("leading-relaxed text-ink-2", index > 0 && "mt-4")}
            >
              {paragraph}
            </p>
          ))}
        </div>

        <ul className="mt-10 grid gap-6 border-t border-hairline pt-8 sm:grid-cols-2">
          {founders.map((founder) => (
            <li key={founder.id} className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-1 font-mono text-xs text-ink-3"
                >
                  {founder.initials ?? initialsOf(founder.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-base text-ink italic">
                    {founder.name}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {founder.role}
                  </span>
                </span>
              </div>
              <p className="mt-4 text-label text-ink-3">{accountableLabel}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {founder.accountableFor}
              </p>
            </li>
          ))}
        </ul>

        {contactLine && (
          <p className="mt-8 text-sm leading-relaxed text-ink-3">
            <a
              href={contactHref}
              className="underline underline-offset-4 transition-colors hover:text-ink"
            >
              {contactLine}
            </a>
          </p>
        )}
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
