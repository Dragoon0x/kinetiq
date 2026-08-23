"use client";

import * as React from "react";

import { ContentPrinciplesList } from "@/registry/blocks/content-principles-list/content-principles-list";
import { TeamOpenBench } from "@/registry/blocks/team-open-bench/team-open-bench";
import { TeamWhereWeAre } from "@/registry/blocks/team-where-we-are/team-where-we-are";
import { UsecaseNotForYou } from "@/registry/blocks/usecase-not-for-you/usecase-not-for-you";
import { CtaLastObjection } from "@/registry/blocks/cta-last-objection/cta-last-objection";
import { cn } from "@/registry/lib/utils";

export type CareersIndexProps = {
  className?: string;
};

/**
 * Careers written to help the wrong people leave. The bench and its empty
 * seats, where the team actually is and the hours nobody covers, the rules
 * and what they cost, and a fit section that names who this is not for —
 * because a careers page optimised for volume produces a hiring funnel full
 * of people who will resign in a year.
 *
 * The fit and objection sections carry marketing copy by default. Replace
 * their content with the hiring equivalents; the shapes are the point, and
 * both take typed props.
 */
export function CareersIndex({ className }: CareersIndexProps) {
  return (
    <main className={cn("bg-surface-0", className)}>
      <TeamOpenBench />
      <TeamWhereWeAre />
      <ContentPrinciplesList />
      <UsecaseNotForYou />
      <CtaLastObjection />
    </main>
  );
}
