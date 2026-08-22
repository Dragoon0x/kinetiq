"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { TickerTape } from "@/registry/ui/ticker-tape";
import { cn } from "@/registry/lib/utils";

export type DriftLink = { label: string; href: string };

export type FooterDriftMarkProps = {
  /** The oversized wordmark that rides the tape. */
  mark?: string;
  headline?: string;
  cta?: string;
  onCta?: () => void;
  links?: DriftLink[];
  fineprint?: string;
  className?: string;
};

const DEFAULT_LINKS: DriftLink[] = [
  { label: "Journal", href: "#journal" },
  { label: "Docs", href: "#docs" },
  { label: "Status", href: "#status" },
  { label: "Privacy", href: "#privacy" },
];

/**
 * A closing footer built around the wordmark itself: the name rides a slow
 * ticker at display size behind a hairline, dragging under hover the way the
 * tape always has — the brand at rest, still moving. One closing ask sits
 * above it; a thin link line and the fine print sit below. Under reduced
 * motion the tape parks and the mark reads as a static repeat.
 */
export function FooterDriftMark({
  mark = "OVENWORD",
  headline = "Bake something worth writing down.",
  cta = "Start your first batch",
  onCta,
  links = DEFAULT_LINKS,
  fineprint = "© 2026 Ovenword Press",
  className,
}: FooterDriftMarkProps) {
  return (
    <footer className={cn("border-hairline bg-surface-0 overflow-hidden border-t", className)}>
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 px-6 pt-16 pb-10 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {headline}
        </h2>
        <PressureButton size="lg" onClick={onCta}>
          {cta}
          <ArrowRight className="size-4" aria-hidden />
        </PressureButton>
      </div>

      <div aria-hidden className="border-hairline border-y">
        <TickerTape speed={36} gap={64} className="py-3 select-none">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className="text-ink px-2 font-mono text-6xl font-semibold tracking-[0.12em] opacity-[0.08] sm:text-8xl"
            >
              {mark}
            </span>
          ))}
        </TickerTape>
      </div>

      <div className="text-ink-3 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="hover:text-ink transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="font-mono tracking-[0.08em] uppercase">{fineprint}</span>
      </div>
    </footer>
  );
}
