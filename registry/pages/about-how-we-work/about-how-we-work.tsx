"use client";

import * as React from "react";

import { ContentGlossary } from "@/registry/blocks/content-glossary/content-glossary";
import { ContentPrinciplesList } from "@/registry/blocks/content-principles-list/content-principles-list";
import { HowWhoDoesWhat } from "@/registry/blocks/how-who-does-what/how-who-does-what";
import { TeamWhereWeAre } from "@/registry/blocks/team-where-we-are/team-where-we-are";
import { TrustDataResidency } from "@/registry/blocks/trust-data-residency/trust-data-residency";
import { cn } from "@/registry/lib/utils";

export type AboutHowWeWorkProps = {
  className?: string;
};

/**
 * The operating manual, published: the rules and what they cost, the words
 * used carefully, where the team is and which hours that leaves uncovered,
 * who does what during a rollout, and where the data sits. It is the page a
 * careful buyer reads second — after they believe the product works and
 * before they believe the company will still be here.
 *
 * Every section is a shipped block; the page contributes the running order.
 */
export function AboutHowWeWork({ className }: AboutHowWeWorkProps) {
  return (
    <main className={cn("bg-surface-0", className)}>
      <ContentPrinciplesList />
      <ContentGlossary />
      <TeamWhereWeAre />
      <HowWhoDoesWhat />
      <TrustDataResidency />
    </main>
  );
}
