"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroAgentBench } from "@/registry/blocks/hero-agent-bench/hero-agent-bench";
import { HowExchangeScript } from "@/registry/blocks/how-exchange-script/how-exchange-script";
import { FeaturesPersonaSwitch } from "@/registry/blocks/features-persona-switch/features-persona-switch";
import { UsecaseJobStories } from "@/registry/blocks/usecase-job-stories/usecase-job-stories";
import { TrustIncidentLog } from "@/registry/blocks/trust-incident-log/trust-incident-log";
import { PricingCreditPacks } from "@/registry/blocks/pricing-credit-packs/pricing-credit-packs";
import { FaqCounterDesk } from "@/registry/blocks/faq-counter-desk/faq-counter-desk";
import { CtaBookSlot } from "@/registry/blocks/cta-book-slot/cta-book-slot";
import { FooterDriftMark } from "@/registry/blocks/footer-drift-mark/footer-drift-mark";
import { cn } from "@/registry/lib/utils";

export type TemplateAgentProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * For products whose core act is a conversation: the hero is a live composer,
 * how-it-works is a transcript the reader advances, and pricing is metered in
 * work rather than seats. The incident log sits mid-page on purpose —
 * anything that acts on a customer's behalf has to answer for what happens
 * when it acts wrongly, and burying that answer is what makes buyers
 * suspicious of the whole category.
 */
export function TemplateAgent({
  brand = "Fernworks",
  className,
}: TemplateAgentProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroAgentBench eyebrow={`${brand} · the asking bench`} />
        <HowExchangeScript eyebrow={`${brand} · how it goes`} />
        <FeaturesPersonaSwitch eyebrow={`${brand} · depending who is asking`} />
        <UsecaseJobStories eyebrow={`${brand} · the jobs`} />
        <TrustIncidentLog eyebrow={`${brand} · what went wrong`} />
        <PricingCreditPacks eyebrow={`${brand} · credits`} />
        <FaqCounterDesk
          eyebrow={`${brand} · questions`}
          questions={[
            {
              id: "q1",
              question: "Does it act without asking me?",
              answer:
                "Only inside the bounds you set. Anything outside them is drafted and held for your sign-off, and the draft says which bound it would have crossed.",
            },
            {
              id: "q2",
              question: "What happens when it gets something wrong?",
              answer:
                "Every action is reversible and every one names its cause. The incident log above is the same record we publish when the fault is ours.",
            },
            {
              id: "q3",
              question: "Where does my data go?",
              answer:
                "Into your workspace and nowhere else. Nothing is used to train anything, and the subprocessor list is published in full.",
            },
            {
              id: "q4",
              question: "What does a credit actually buy?",
              answer:
                "One completed piece of work, including every revision that day. Credits never expire and unused ones refund on request.",
            },
          ]}
        />
        <CtaBookSlot eyebrow={`${brand} · talk to someone who ran a yard`} />
      </main>
      <FooterDriftMark
        mark={brand.toUpperCase()}
        fineprint="© 2026 Fernworks"
      />
    </div>
  );
}
