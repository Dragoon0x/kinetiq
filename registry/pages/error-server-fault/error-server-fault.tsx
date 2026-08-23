"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ErrorServerFaultProps = {
  headline?: string;
  copy?: string;
  /** The reference a support conversation can actually use. */
  reference?: string;
  /** What is already happening about it, without being asked. */
  weAreDoing?: string;
  statusHref?: string;
  statusLabel?: string;
  onRetry?: () => void;
  className?: string;
};

/**
 * The 500, written as a report rather than an apology: a reference code the
 * reader can quote, a plain statement that we already know, and a link to the
 * status page. "Something went wrong" tells the reader nothing they did not
 * already know and leaves them with nothing to say when they write in.
 */
export function ErrorServerFault({
  headline = "That failed on our side.",
  copy = "The request reached us and we could not answer it. Nothing you did caused this, and nothing you had entered has been lost.",
  reference = "err_9f2c41",
  weAreDoing = "This was reported to the on-call engineer the moment it happened — you do not need to tell us.",
  statusHref = "/status",
  statusLabel = "Status page",
  onRetry,
  className,
}: ErrorServerFaultProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusSeal variant="danger">500</StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>
        <p className="mt-4 text-sm leading-relaxed text-ink-3">{weAreDoing}</p>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-5">
          <span className="text-label text-ink-3">Reference</span>
          <code className="font-mono text-sm text-ink">{reference}</code>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <PressureButton onClick={onRetry}>Try again</PressureButton>
          <a
            href={statusHref}
            className="text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {statusLabel}
          </a>
        </div>
      </div>
    </main>
  );
}
