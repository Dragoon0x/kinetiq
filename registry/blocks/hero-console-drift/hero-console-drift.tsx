"use client";

import * as React from "react";

import { ArrowRight, TerminalSquare } from "lucide-react";

import { AuroraRibbon } from "@/registry/ui/aurora-ribbon";
import { CodeLathe } from "@/registry/ui/code-lathe";
import { PressureButton } from "@/registry/ui/pressure-button";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type HeroConsoleDriftProps = {
  eyebrow?: string;
  headline?: [string, string];
  copy?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** The console vignette. Defaults to a worked example. */
  code?: string;
  filename?: string;
  /** Chips across the console's title rail. */
  checks?: string[];
  className?: string;
};

const DEFAULT_CODE = `// One rule, applied fleet-wide.
export const policy = rule("rotate-keys", {
  every: "30d",
  scope: fleet.filter((s) => s.exposed),
  onApply: (s) => s.rotate({ grace: "24h" }),
});

await enforce(policy);   // 214 services, 0 drift`;

const DEFAULT_CHECKS = ["fleet: 214", "drift: 0", "audit: clean"];

/**
 * A console hero for tools that live in the terminal. Copy holds the left
 * edge; the vignette is a framed console whose listing turns out line by
 * line — the product demonstrating itself in its own medium. Aurora ribbons
 * rise from the page floor behind everything, faded low so the listing stays
 * the brightest thing on the stage.
 *
 * Reduced motion presents the listing whole and stills the ribbons; the
 * composed instruments carry their own fallbacks.
 */
export function HeroConsoleDrift({
  eyebrow = "Keeper · fleet policy",
  headline = ["Policy that", "enforces itself."],
  copy = "Keeper turns security policy into running code — applied across the fleet, verified on every change, and audited without a spreadsheet.",
  primaryCta = "Install the CLI",
  secondaryCta = "Browse policies",
  onPrimary,
  onSecondary,
  code = DEFAULT_CODE,
  filename = "rotate-keys.policy.ts",
  checks = DEFAULT_CHECKS,
  className,
}: HeroConsoleDriftProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <AuroraRibbon
        aria-hidden
        bands={3}
        className="pointer-events-none absolute inset-x-0 bottom-0 !h-full opacity-30"
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
        <RevealStagger className="flex max-w-xl flex-col items-start gap-5">
          <p className="text-label text-ink-3 flex items-center gap-2">
            <TerminalSquare className="size-3.5" aria-hidden />
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

        <div className="w-full justify-self-center lg:justify-self-end">
          <div className="border-hairline bg-surface-1 rounded-4 overflow-hidden border shadow-raised">
            <div className="border-hairline flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="flex items-center gap-2">
                <span aria-hidden className="flex gap-1.5">
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                  <i className="bg-hairline-strong block size-2 rounded-full" />
                </span>
                <span className="text-label text-ink-3">{filename}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {checks.map((check) => (
                  <StatusSeal key={check} variant="success" className="text-[10px]">
                    {check}
                  </StatusSeal>
                ))}
              </span>
            </div>
            {/* The frame's rail is the header — the lathe renders bare. */}
            <CodeLathe
              code={code}
              stream
              perLine={0.09}
              copyable={false}
              className="rounded-none border-0"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
