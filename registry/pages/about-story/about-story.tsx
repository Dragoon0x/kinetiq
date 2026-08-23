"use client";

import * as React from "react";

import { ContentMarginNotes } from "@/registry/blocks/content-margin-notes/content-margin-notes";
import { StatsImpactReport } from "@/registry/blocks/stats-impact-report/stats-impact-report";
import { TeamFoundersNote } from "@/registry/blocks/team-founders-note/team-founders-note";
import { TrustIncidentLog } from "@/registry/blocks/trust-incident-log/trust-incident-log";
import { CtaPostscript } from "@/registry/blocks/cta-postscript/cta-postscript";
import { cn } from "@/registry/lib/utils";

export type AboutStoryProps = {
  className?: string;
};

/**
 * The about page as an argument rather than a brochure: why the product
 * exists, who answers for it, the numbers behind the claim, and — unusually
 * for an about page — the incidents. A company willing to put its failures on
 * the same page as its origin story is making a claim its competitors mostly
 * cannot copy.
 *
 * Every section here is a shipped block. If this page needed markup a section
 * could have owned, that would be a missing section rather than page-local
 * styling.
 */
export function AboutStory({ className }: AboutStoryProps) {
  return (
    <main className={cn("bg-surface-0", className)}>
      <ContentMarginNotes />
      <TeamFoundersNote />
      <StatsImpactReport />
      <TrustIncidentLog />
      <CtaPostscript />
    </main>
  );
}
