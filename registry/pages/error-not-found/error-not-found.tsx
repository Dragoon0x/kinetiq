"use client";

import * as React from "react";

import { NotFound } from "@/registry/blocks/not-found/not-found";
import { cn } from "@/registry/lib/utils";

export type ErrorNotFoundProps = {
  /** Where the reader most likely meant to go. */
  suggestions?: { id: string; label: string; href: string }[];
  homeHref?: string;
  className?: string;
};

const DEFAULT_SUGGESTIONS = [
  { id: "s1", label: "Today's board", href: "/board" },
  { id: "s2", label: "The yard list", href: "/yards" },
  { id: "s3", label: "Search everything", href: "/search" },
];

/**
 * The 404, built on the library's own radar sweep, with somewhere to go
 * underneath it. A 404 that offers only "go home" sends people to the top of
 * a site they were already deep inside — the three most likely destinations
 * are worth more than the front door.
 */
export function ErrorNotFound({
  suggestions = DEFAULT_SUGGESTIONS,
  homeHref = "/",
  className,
}: ErrorNotFoundProps) {
  return (
    <main
      className={cn(
        "flex min-h-screen flex-col items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <NotFound />
      <nav aria-label="Where you might have meant" className="mt-10">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {suggestions.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                className="text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-6 text-xs text-ink-3">
        <a
          href={homeHref}
          className="underline underline-offset-4 transition-colors hover:text-ink"
        >
          Or start from the front
        </a>
      </p>
    </main>
  );
}
