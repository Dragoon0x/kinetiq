"use client";

import * as React from "react";

import { StatusPip } from "@/registry/ui/status-pip";
import { cn } from "@/registry/lib/utils";

export type AnnounceScheduledWindowProps = {
  /** Pre-formatted window — the strip never touches a clock. */
  window?: string;
  headline?: string;
  /** What will actually be unavailable, said specifically. */
  affected?: string[];
  /** What will keep working, which is the part that calms people. */
  unaffected?: string[];
  /** Why it is happening at all. */
  reason?: string;
  linkLabel?: string;
  href?: string;
  className?: string;
};

const DEFAULT_AFFECTED = ["Cutting new boards", "Signing and publishing plans"];

const DEFAULT_UNAFFECTED = [
  "The gate view, from its last cached board",
  "Exports already queued",
  "Reading any existing plan",
];

/**
 * The announcement nobody wants to make, made well: a scheduled window with
 * what will actually stop, what will keep working, and why it is happening —
 * in that order, because the second list is the one that decides whether
 * anyone has to change their morning. Deliberately no countdown: a ticking
 * clock turns a planned maintenance notice into an emergency.
 */
export function AnnounceScheduledWindow({
  window = "Sunday 9 March, 02:00–03:30 UTC",
  headline = "Planned maintenance, ninety minutes.",
  affected = DEFAULT_AFFECTED,
  unaffected = DEFAULT_UNAFFECTED,
  reason = "We are moving the planning tables to the new storage layer, which is what lets a board carry more than one yard's constraints. It is the last migration of this size we expect to need.",
  linkLabel = "Status page",
  href = "#status",
  className,
}: AnnounceScheduledWindowProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative border-y border-hairline bg-surface-0",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusPip status="away" label="Scheduled" />
          <h2
            id={headingId}
            className="text-lg font-semibold tracking-tight text-ink"
          >
            {headline}
          </h2>
          <span className="font-mono text-[11px] tracking-[0.06em] text-ink-2">
            {window}
          </span>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-10">
          <div className="min-w-0">
            <p className="text-label text-ink-3">Will stop</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {affected.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="text-label text-[var(--success,var(--primary))]">
              Keeps working
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {unaffected.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {reason && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-3">
            {reason}
          </p>
        )}

        <a
          href={href}
          className="mt-4 inline-block text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
        >
          {linkLabel}
        </a>
      </div>
    </section>
  );
}
