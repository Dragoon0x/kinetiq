"use client";

import * as React from "react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type SupportedBrowser = { id: string; name: string; from: string };

export type ErrorBrowserUnsupportedProps = {
  headline?: string;
  copy?: string;
  /** The specific capability missing, not a browser name. */
  missing?: string;
  supported?: SupportedBrowser[];
  /** What still works in an old browser, because something usually does. */
  fallbackLine?: string;
  fallbackHref?: string;
  className?: string;
};

const DEFAULT_SUPPORTED: SupportedBrowser[] = [
  { id: "b1", name: "Chrome / Edge", from: "111 and later" },
  { id: "b2", name: "Safari", from: "16.4 and later" },
  { id: "b3", name: "Firefox", from: "113 and later" },
];

/**
 * The unsupported-browser page, which names the missing capability rather
 * than the browser. Gate screens that sniff user agents are wrong within a
 * year and insult anyone on a browser they did not choose — a yard PC is
 * usually locked by an IT policy the reader cannot change. So this page
 * states what is missing, what would work, and where to go meanwhile.
 */
export function ErrorBrowserUnsupported({
  headline = "This browser cannot run the board.",
  copy = "Not a judgement — the board needs one capability your browser does not have, and there is no way to work around it safely.",
  missing = "CSS container queries, used by every gate-screen layout.",
  supported = DEFAULT_SUPPORTED,
  fallbackLine = "The printable plan works everywhere, including here. If the yard PC is locked to an old browser, that is the one to use.",
  fallbackHref = "/board/print",
  className,
}: ErrorBrowserUnsupportedProps) {
  const headingId = React.useId();

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusSeal variant="warn">unsupported</StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-6 border-y border-hairline py-4">
          <p className="text-label text-ink-3">What is missing</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{missing}</p>
        </div>

        <div className="mt-6">
          <p className="text-label text-ink-3">Known to work</p>
          <ul className="mt-3 flex flex-col gap-2">
            {supported.map((browser) => (
              <li
                key={browser.id}
                className="flex min-w-0 items-baseline justify-between gap-4"
              >
                <span className="min-w-0 text-sm text-ink">{browser.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">
                  {browser.from}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {fallbackLine && (
          <p className="mt-6 border-t border-hairline pt-5 text-sm leading-relaxed text-ink-3">
            {fallbackLine}{" "}
            <a
              href={fallbackHref}
              className="underline underline-offset-4 transition-colors hover:text-ink"
            >
              Open the printable plan
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
