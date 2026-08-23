"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusPip } from "@/registry/ui/status-pip";
import { cn } from "@/registry/lib/utils";

export type ErrorOfflineProps = {
  headline?: string;
  copy?: string;
  /** What is readable from the cache while the connection is gone. */
  available?: { id: string; label: string; detail: string; href: string }[];
  /** What was held locally and will send when the signal returns. */
  queued?: string[];
  onRetry?: () => void;
  className?: string;
};

const DEFAULT_AVAILABLE = [
  {
    id: "a1",
    label: "This morning's board",
    detail: "Cached at 05:58",
    href: "/board",
  },
  { id: "a2", label: "Crew list", detail: "Cached yesterday", href: "/crews" },
];

const DEFAULT_QUEUED = ["Two slot acknowledgements", "One handover note"];

/**
 * Offline, told from the yard's point of view: a shed with no signal is a
 * normal Tuesday, not an error. So this page leads with what is still
 * readable from the cache and what is being held to send later, rather than
 * with an apology for physics.
 */
export function ErrorOffline({
  headline = "No signal. Here is what you still have.",
  copy = "Everything below was cached before you lost the connection. Anything you do now is held on this device and sends itself when the signal comes back.",
  available = DEFAULT_AVAILABLE,
  queued = DEFAULT_QUEUED,
  onRetry,
  className,
}: ErrorOfflineProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusPip status="offline" label="Offline" />
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-8 border-t border-hairline pt-6">
          <p className="text-label text-ink-3">Readable now</p>
          <ul className="mt-3 flex flex-col gap-2">
            {available.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className="flex min-w-0 items-baseline justify-between gap-3 rounded-2 border border-hairline px-3 py-2 transition-colors hover:border-hairline-strong"
                >
                  <span className="min-w-0 truncate text-sm text-ink">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    {item.detail}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {queued.length > 0 && (
          <div className="mt-6 border-t border-hairline pt-5">
            <p className="text-label text-ink-3">Waiting to send</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {queued.map((item) => (
                <li key={item} className="text-sm text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <PressureButton onClick={onRetry} className="mt-8">
          Check again
        </PressureButton>
      </div>
    </main>
  );
}
