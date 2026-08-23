"use client";

import * as React from "react";

import { StatusPip } from "@/registry/ui/status-pip";
import { cn } from "@/registry/lib/utils";

export type ErrorMaintenanceProps = {
  headline?: string;
  copy?: string;
  /** Pre-formatted window; the page never reads a clock. */
  window?: string;
  /** What still works while this is happening. */
  stillWorking?: string[];
  statusHref?: string;
  className?: string;
};

const DEFAULT_STILL_WORKING = [
  "The gate view, from its last cached board",
  "Anything already exported",
  "Read access to plans cut before the window",
];

/**
 * The maintenance page, which differs from an outage page in the one way that
 * matters: this was planned, so it can say when it ends and what still works.
 * No countdown — a ticking clock on a maintenance page turns a scheduled
 * ninety minutes into an emergency in the reader's head.
 */
export function ErrorMaintenance({
  headline = "Down on purpose, back by 03:30 UTC.",
  copy = "We are moving the planning tables to storage that can hold more than one yard's constraints on a single board. It is the last migration of this size we expect to need.",
  window = "Sunday 9 March, 02:00–03:30 UTC",
  stillWorking = DEFAULT_STILL_WORKING,
  statusHref = "/status",
  className,
}: ErrorMaintenanceProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-lg">
        <StatusPip status="away" label="Scheduled maintenance" />
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-ink-2">
          {window}
        </p>
        <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-8 border-t border-hairline pt-6">
          <p className="text-label text-[var(--success,var(--primary))]">
            Still working
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {stillWorking.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-ink-2">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-xs text-ink-3">
          <a
            href={statusHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            Status page, updated as it goes
          </a>
        </p>
      </div>
    </main>
  );
}
