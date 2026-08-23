"use client";

import * as React from "react";

import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ErrorRateLimitedProps = {
  headline?: string;
  copy?: string;
  /** The limit that was hit, stated exactly. */
  limitLine?: string;
  /** Requests used and allowed, so the reader can see the ratio. */
  used?: number;
  allowed?: number;
  /** Pre-formatted reset moment — the page never reads a clock. */
  resetsAt?: string;
  /** How to stop hitting it, which is the only useful part. */
  remedies?: { id: string; title: string; copy: string }[];
  docsHref?: string;
  className?: string;
};

const DEFAULT_REMEDIES = [
  {
    id: "r1",
    title: "Read the Retry-After header",
    copy: "Every 429 we send carries it. Backing off on that value alone resolves almost every case we see.",
  },
  {
    id: "r2",
    title: "Ask for a page, not a loop",
    copy: "GET /v1/boards is paginated. Fetching each board by id in a loop costs a hundred requests where one would do.",
  },
  {
    id: "r3",
    title: "Subscribe instead of polling",
    copy: "The board.cut webhook fires on every cut. Polling for changes is the commonest cause of hitting this at all.",
  },
];

/**
 * The 429, written as a diagnosis: which limit was hit, how far over, when it
 * resets, and — the part that actually helps — the three things that stop it
 * happening again. A rate limit page that only says "too many requests" is a
 * page the same caller will see again in sixty seconds.
 */
export function ErrorRateLimited({
  headline = "Too many requests, briefly.",
  copy = "You are over the limit for this token. Nothing is blocked or penalised — it resumes on its own.",
  limitLine = "600 requests per minute per token, on the read API.",
  used = 918,
  allowed = 600,
  resetsAt = "resets at the top of the next minute",
  remedies = DEFAULT_REMEDIES,
  docsHref = "#rate-limits",
  className,
}: ErrorRateLimitedProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-lg">
        <StatusSeal variant="warn">429</StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-hairline py-5">
          <div className="min-w-0">
            <dd className="flex items-baseline gap-1">
              <Readout value={used} size="lg" />
              <span className="text-sm text-ink-3">/ {allowed}</span>
            </dd>
            <dt className="mt-1 text-label text-ink-3">requests this minute</dt>
          </div>
          <div className="min-w-0">
            <dd className="text-sm leading-relaxed text-ink">{resetsAt}</dd>
            <dt className="mt-1 text-label text-ink-3">when it clears</dt>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-3">{limitLine}</p>

        <div className="mt-8">
          <p className="text-label text-ink-3">How to stop seeing this</p>
          <ul className="mt-3 flex flex-col gap-4">
            {remedies.map((remedy) => (
              <li key={remedy.id} className="min-w-0">
                <p className="font-medium text-ink">{remedy.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  {remedy.copy}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-xs text-ink-3">
          <a
            href={docsHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            Rate limits, in full
          </a>
        </p>
      </div>
    </main>
  );
}
