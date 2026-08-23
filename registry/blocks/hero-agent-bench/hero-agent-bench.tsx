"use client";

import * as React from "react";

import { ArrowRight, Sparkles } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { PromptWell, type WellOption } from "@/registry/ui/prompt-well";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type HeroAgentBenchProps = {
  eyebrow?: string;
  headline?: [string, string];
  copy?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** The vignette composer's sources and commands. */
  sources?: WellOption[];
  commands?: WellOption[];
  vignetteTitle?: string;
  onAsk?: (prompt: string) => void;
  className?: string;
};

const DEFAULT_SOURCES: WellOption[] = [
  { id: "s1", label: "run-ledger", hint: "live" },
  { id: "s2", label: "crew-notes", hint: "214 files" },
  { id: "s3", label: "supplier-book", hint: "csv" },
];

const DEFAULT_COMMANDS: WellOption[] = [
  { id: "c1", label: "summarise", hint: "⌘1" },
  { id: "c2", label: "compare", hint: "⌘2" },
];

/**
 * A hero for agent products where the vignette is the composer itself: the
 * real prompt well, wired live — type `@` and the sources actually open,
 * `/` and the commands do — framed as a bench window with a working seal.
 * The reader's first act on the page is the product's core act, which is
 * the entire argument an agent product needs to make.
 */
export function HeroAgentBench({
  eyebrow = "Fernworks · the asking bench",
  headline = ["Ask the work", "anything."],
  copy = "Fernworks reads your ledgers, notes, and books, then answers like a colleague who has actually read them. Try the composer — the @ and / are live.",
  primaryCta = "Open your bench",
  secondaryCta = "See what it reads",
  onPrimary,
  onSecondary,
  sources = DEFAULT_SOURCES,
  commands = DEFAULT_COMMANDS,
  vignetteTitle = "bench-04 · asking",
  onAsk,
  className,
}: HeroAgentBenchProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
        <RevealStagger className="flex max-w-xl flex-col items-start gap-5">
          <p className="text-label text-ink-3 flex items-center gap-2">
            <Sparkles className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h1
            id={headingId}
            className="text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
          <p className="text-ink-2 max-w-md text-base leading-relaxed sm:text-lg">
            {copy}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PressureButton size="lg" onClick={onPrimary}>
              {primaryCta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton size="lg" variant="outline" onClick={onSecondary}>
              {secondaryCta}
            </PressureButton>
          </div>
        </RevealStagger>

        {/* The vignette: the composer itself, wired live. */}
        <div className="w-full justify-self-center lg:justify-self-end">
          <div className="border-hairline bg-surface-1 rounded-4 border p-4 shadow-raised sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span aria-hidden className="flex gap-1.5">
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                </span>
                <span className="text-label text-ink-3">{vignetteTitle}</span>
              </span>
              <StatusSeal variant="success" live className="text-[10px]">
                reading 3 sources
              </StatusSeal>
            </div>
            <PromptWell
              sources={sources}
              commands={commands}
              onSubmit={onAsk}
              placeholder="Try @ for a source, / for a command…"
              aria-label="Ask the bench"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
