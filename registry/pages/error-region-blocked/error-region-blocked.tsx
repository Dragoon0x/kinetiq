"use client";

import * as React from "react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ErrorRegionBlockedProps = {
  headline?: string;
  copy?: string;
  /** The reason, stated as policy or law rather than left implied. */
  reason?: string;
  /** Where the request appeared to come from, so a false positive is obvious. */
  detectedAs?: string;
  /** What to do if the detection is wrong — the important half. */
  wrongLine?: string;
  contactHref?: string;
  contactLabel?: string;
  className?: string;
};

/**
 * Region-blocked, with the two things such pages almost always omit: what
 * region the request appeared to come from, and what to do when that is
 * wrong. Geolocation is routinely mistaken — a VPN, a satellite link, a ship
 * — and a page that offers no correction path strands the people most likely
 * to be misidentified.
 */
export function ErrorRegionBlocked({
  headline = "We cannot serve this region yet.",
  copy = "This is a licensing limit rather than a technical one, and it is one we are working to remove.",
  reason = "Waylight holds port-operations data under an EU processing agreement that does not yet cover this jurisdiction. Serving you here would breach it.",
  detectedAs = "Detected as: SG (Singapore), via 203.0.113.0/24",
  wrongLine = "If that is wrong — a VPN, a satellite link, a ship registered elsewhere — tell us where you actually are and we will unblock the account within a day. This detection is wrong more often than we would like.",
  contactHref = "/contact",
  contactLabel = "Tell us where you are",
  className,
}: ErrorRegionBlockedProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusSeal variant="warn">unavailable here</StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-6 border-y border-hairline py-5">
          <p className="text-label text-ink-3">Why</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{reason}</p>
        </div>

        <p className="mt-4 font-mono text-[11px] tracking-[0.04em] text-ink-3">
          {detectedAs}
        </p>

        {/* The correction path is the important half: geolocation is wrong
            often enough that a page without one strands real customers. */}
        <div className="mt-6 rounded-4 border border-hairline bg-surface-1 p-5">
          <p className="font-medium text-ink">If that is not where you are</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{wrongLine}</p>
          <a
            href={contactHref}
            className="mt-3 inline-block text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {contactLabel}
          </a>
        </div>
      </div>
    </main>
  );
}
