"use client";

import * as React from "react";

import { StepformOneQuestion } from "@/registry/blocks/stepform-one-question/stepform-one-question";
import { cn } from "@/registry/lib/utils";

export type OnboardingFirstRunProps = {
  wordmark?: string;
  /** Where a returning user escapes to; onboarding must never be a trap. */
  skipLabel?: string;
  skipHref?: string;
  onDone?: (answers: Record<string, string>) => void;
  className?: string;
};

/**
 * The first session, asked one question at a time, with a way out at the top.
 * The escape hatch is the part that matters: onboarding that cannot be
 * skipped is a wall, and the people most likely to hit it are the ones
 * setting up their second yard who already know all the answers.
 */
export function OnboardingFirstRun({
  wordmark = "WAYLIGHT",
  skipLabel = "Skip — I have done this before",
  skipHref = "/",
  onDone,
  className,
}: OnboardingFirstRunProps) {
  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 pt-8">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
          {wordmark}
        </p>
        <a
          href={skipHref}
          className="text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
        >
          {skipLabel}
        </a>
      </header>

      <StepformOneQuestion onSubmit={onDone} />
    </main>
  );
}
