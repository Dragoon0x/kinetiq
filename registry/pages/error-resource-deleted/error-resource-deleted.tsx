"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ErrorResourceDeletedProps = {
  headline?: string;
  copy?: string;
  /** What was deleted, named exactly. */
  resource?: string;
  /** Who deleted it and when — pre-formatted, no clock is read. */
  deletedBy?: string;
  deletedAt?: string;
  /** Whether it can still be brought back, and until when. */
  restorableUntil?: string;
  onRestore?: () => void;
  parentLabel?: string;
  parentHref?: string;
  className?: string;
};

/**
 * Gone, but accounted for: what it was, who removed it, when, and whether it
 * can still come back. A deleted resource that 404s silently makes people
 * think the system lost it — naming the person and the moment turns a
 * suspected bug into a decision someone made, which is a far shorter
 * conversation.
 */
export function ErrorResourceDeleted({
  headline = "That board was deleted.",
  copy = "It is not missing and nothing failed — someone removed it deliberately, and the record of that is below.",
  resource = "North Basin · board r2 · 14 January",
  deletedBy = "M. Aldana (yard owner)",
  deletedAt = "15 January, 08:41",
  restorableUntil = "Restorable until 14 February — after that the row stays in the record but the board itself is gone.",
  onRestore,
  parentLabel = "All boards for this yard",
  parentHref = "/yards/north-basin/boards",
  className,
}: ErrorResourceDeletedProps) {
  const headingId = React.useId();
  const [restored, setRestored] = React.useState(false);

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusSeal variant={restored ? "success" : "warn"}>
          {restored ? "restored" : "deleted"}
        </StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <dl className="mt-6 flex flex-col gap-3 border-y border-hairline py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-label text-ink-3">What</dt>
            <dd className="min-w-0 font-mono text-xs text-ink">{resource}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-label text-ink-3">By</dt>
            <dd className="min-w-0 text-sm text-ink-2">{deletedBy}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-label text-ink-3">When</dt>
            <dd className="min-w-0 font-mono text-xs text-ink-2">
              {deletedAt}
            </dd>
          </div>
        </dl>

        {restorableUntil && (
          <p className="mt-4 text-sm leading-relaxed text-ink-3">
            {restorableUntil}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <PressureButton
            onClick={() => {
              setRestored(true);
              onRestore?.();
            }}
            disabled={restored}
          >
            {restored ? "Restored" : "Restore it"}
          </PressureButton>
          <a
            href={parentHref}
            className="text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {parentLabel}
          </a>
        </div>
      </div>
    </main>
  );
}
