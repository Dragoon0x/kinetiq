"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type VersionRow = {
  id: string;
  /** The thing being compared — a field, an endpoint, a behaviour. */
  subject: string;
  before: string;
  after: string;
  /** Marked when a consumer must act. */
  breaking?: boolean;
};

export type ChangelogCompareProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  versions?: string[];
  defaultFrom?: string;
  defaultTo?: string;
  rows?: VersionRow[];
  /** What to do about the breaking rows, and by when. */
  migrationLine?: string;
  className?: string;
};

const DEFAULT_VERSIONS = ["r2.11", "r2.12", "r2.13", "r2.14"];

const DEFAULT_ROWS: VersionRow[] = [
  {
    id: "v1",
    subject: "board.cut payload",
    before: "{ id, yard, cutAt }",
    after: "{ id, yard, cutAt, cause }",
  },
  {
    id: "v2",
    subject: "Unexplainable plans",
    before: "Published as best guess",
    after: "Withheld and flagged for a person",
    breaking: true,
  },
  {
    id: "v3",
    subject: "Crew rest window",
    before: "Counted from shift start",
    after: "Counted from shift end",
    breaking: true,
  },
  {
    id: "v4",
    subject: "Constraints per board",
    before: "One site",
    after: "Any number of sites",
  },
  {
    id: "v5",
    subject: "Signing surface",
    before: "Plan view only",
    after: "Plan view or gate view",
  },
];

/**
 * What changed between two versions, laid flat: the subject, what it was,
 * what it is, and whether you have to do anything about it. Anyone upgrading
 * across several releases has to read every release note in between and hold
 * the diff in their head; this page holds it for them, and counts the
 * breaking rows so the size of the job is visible before they start.
 */
export function ChangelogCompare({
  eyebrow = "Waylight · compare",
  headline = "What changed between two versions.",
  copy = "Pick where you are and where you are going. Rows that need action from you are marked, and counted above.",
  versions = DEFAULT_VERSIONS,
  defaultFrom = "r2.11",
  defaultTo = "r2.14",
  rows = DEFAULT_ROWS,
  migrationLine = "Breaking rows need a change on your side before the version you are moving to. Nothing is removed without a release carrying both shapes first.",
  className,
}: ChangelogCompareProps) {
  const headingId = React.useId();
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);

  const breakingCount = rows.filter((row) => row.breaking).length;
  const backwards = versions.indexOf(from) >= versions.indexOf(to);

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h1
          id={headingId}
          className="mt-3 text-4xl font-semibold tracking-tight text-balance"
        >
          {headline}
        </h1>
        <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-8 flex flex-wrap items-end gap-4 border-y border-hairline py-5">
          <label className="min-w-0">
            <span className="block text-label text-ink-3">From</span>
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1.5 rounded-2 border border-hairline bg-transparent px-3 py-1.5 font-mono text-sm text-ink"
            >
              {versions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="block text-label text-ink-3">To</span>
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1.5 rounded-2 border border-hairline bg-transparent px-3 py-1.5 font-mono text-sm text-ink"
            >
              {versions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <p className="ml-auto flex items-baseline gap-1.5">
            <Readout value={breakingCount} size="lg" />
            <span className="text-sm text-ink-3">
              {breakingCount === 1 ? "row needs you" : "rows need you"}
            </span>
          </p>
        </div>

        {/* Choosing a target at or behind the source is a real mistake, so it
            is answered rather than silently showing the same diff. */}
        <AnimatePresence initial={false}>
          {backwards && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-5 text-sm text-ink-3"
              role="status"
            >
              {to} is not ahead of {from}. Pick a later version to see a diff.
            </motion.p>
          )}
        </AnimatePresence>

        {!backwards && (
          <div className="mt-8 rounded-4 border border-hairline">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-hairline px-5 py-3 text-label text-ink-3 sm:grid">
              <span>Subject</span>
              <span>{from}</span>
              <span>{to}</span>
            </div>
            <ul>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid gap-x-4 gap-y-2 border-b border-hairline px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <p className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{row.subject}</span>
                    {row.breaking && (
                      <StatusSeal variant="warn">action</StatusSeal>
                    )}
                  </p>
                  <p className="min-w-0 font-mono text-xs leading-relaxed text-ink-3">
                    <span className="text-ink-3 sm:hidden">was · </span>
                    {row.before}
                  </p>
                  <p className="min-w-0 font-mono text-xs leading-relaxed text-ink">
                    <span className="text-ink-3 sm:hidden">now · </span>
                    {row.after}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {migrationLine && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-3">
            {migrationLine}
          </p>
        )}
      </div>
    </main>
  );
}
