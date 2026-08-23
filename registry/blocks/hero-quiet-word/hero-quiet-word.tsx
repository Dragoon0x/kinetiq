"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { HighlightSweep } from "@/registry/ui/highlight-sweep";
import { PressureButton } from "@/registry/ui/pressure-button";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { cn } from "@/registry/lib/utils";

export type HeroQuietWordProps = {
  eyebrow?: string;
  /** The manifesto, in three pieces: before, the swept phrase, after. */
  lead?: string;
  swept?: string;
  tail?: string;
  copy?: string;
  cta?: string;
  onCta?: () => void;
  /** The single line under the action. */
  footnote?: string;
  className?: string;
};

/**
 * A manifesto hero: no vignette, no backdrop, no product window — one
 * oversized sentence carrying the whole argument, with the phrase that
 * matters swept by the highlighter as it enters. For products whose best
 * pitch is a sentence the reader would underline themselves; everything else
 * on the stage stays out of the type's way.
 */
export function HeroQuietWord({
  eyebrow = "Ovenword · the letter",
  lead = "Most newsletters are written to be sent.",
  swept = "This one is written to be kept",
  tail = ".",
  copy = "One letter a week on baking as a practice — filed, indexed, and worth rereading in a year.",
  cta = "Read the current issue",
  onCta,
  footnote = "Free to read. The archive is the pitch.",
  className,
}: HeroQuietWordProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-24 sm:py-32">
        <RevealStagger className="flex flex-col items-start gap-7">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h1
            id={headingId}
            className="text-4xl leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {lead}{" "}
            <HighlightSweep>{swept}</HighlightSweep>
            {tail}
          </h1>
          <p className="text-ink-2 max-w-xl text-lg leading-relaxed">{copy}</p>
          <div className="mt-1 flex flex-col items-start gap-3">
            <PressureButton size="lg" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <p className="text-ink-3 font-mono text-[11px] tracking-[0.08em] uppercase">
              {footnote}
            </p>
          </div>
        </RevealStagger>
      </div>
    </section>
  );
}
