"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroPriceForward } from "@/registry/blocks/hero-price-forward/hero-price-forward";
import { PricingWhereItGoes } from "@/registry/blocks/pricing-where-it-goes/pricing-where-it-goes";
import { UsecaseNotForYou } from "@/registry/blocks/usecase-not-for-you/usecase-not-for-you";
import { FeaturesQuietGrid } from "@/registry/blocks/features-quiet-grid/features-quiet-grid";
import { ContentPrinciplesList } from "@/registry/blocks/content-principles-list/content-principles-list";
import { TrustIncidentLog } from "@/registry/blocks/trust-incident-log/trust-incident-log";
import { ProofUnprompted } from "@/registry/blocks/proof-unprompted/proof-unprompted";
import { CtaPostscript } from "@/registry/blocks/cta-postscript/cta-postscript";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type TemplateFieldProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * The honest play, assembled: the price in the first screen, where that money
 * goes in the second, who the product is not for in the third, and the
 * failures published before anyone asks. Every section here gives something
 * away, and the argument is cumulative — a page that has already told you the
 * price, the margins, and the outages has spent nothing on persuasion and
 * arrives at the close having earned it.
 */
export function TemplateField({
  brand = "Fieldline",
  className,
}: TemplateFieldProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroPriceForward />
        <PricingWhereItGoes eyebrow={`${brand} · the arithmetic`} />
        <UsecaseNotForYou
          eyebrow={`${brand} · fit`}
          goodFits={[
            {
              id: "g1",
              who: "Teams who want the price before the call",
              why: "It is on the first screen, and the second screen shows where it goes. Nothing below contradicts either.",
            },
            {
              id: "g2",
              who: "Anyone who has been burned by a quote",
              why: "One number, no seats-versus-usage arithmetic, and no discount that expires if you think about it.",
            },
            {
              id: "g3",
              who: "Buyers who read the incident log first",
              why: "Ours is published in full, including the fortnight we would rather forget.",
            },
          ]}
          badFits={[
            {
              id: "b1",
              who: "Anyone needing a bespoke contract",
              why: "We have one agreement and we do not redline it. That is what keeps the price the price.",
              instead: "You want a vendor with a legal team, and that is fine.",
            },
            {
              id: "b2",
              who: "Procurement that requires three quotes",
              why: "We will not pad a number so yours looks competitive against it.",
              instead: "Put us in as the fixed-price option.",
            },
            {
              id: "b3",
              who: "Teams who want the roadmap in writing",
              why: "We publish what shipped, not what might. A roadmap we could promise is one we would break.",
              instead: "Read the changelog and judge the pace.",
            },
          ]}
        />
        <FeaturesQuietGrid eyebrow={`${brand} · what it does`} />
        <ContentPrinciplesList eyebrow={`${brand} · how we decide`} />
        <TrustIncidentLog eyebrow={`${brand} · what went wrong`} />
        <ProofUnprompted eyebrow={`${brand} · said elsewhere`} />
        <CtaPostscript
          postscript={`P.S. — Everything above gives something away: the price, where it goes, who we are wrong for, and every outage of the last year. We do it because the alternative is asking you to take all of it on trust, and we would not.`}
          signature="M. Aldana"
          signatureRole={`Founder, ${brand}`}
          cta="Start at nineteen"
          altLabel="or read the incident log again"
          altHref="#incidents"
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        fineprint="© 2026 Fieldline Instruments"
      />
    </div>
  );
}
