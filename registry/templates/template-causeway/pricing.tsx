"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { PricingMeridianTiers } from "@/registry/blocks/pricing-meridian-tiers/pricing-meridian-tiers";
import { FaqLastWord } from "@/registry/blocks/faq-last-word/faq-last-word";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type CausewayPricingProps = {
  brand?: string;
  className?: string;
};

/**
 * The price, one route deep, with nothing else on the page to distract from
 * it: the tiers, then the four questions people actually ask before paying,
 * answered whole. A pricing page that needs a hero is hiding something.
 */
export function CausewayPricing({
  brand = "Basinworks",
  className,
}: CausewayPricingProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
        links={[
          { label: "Product", href: "/" },
          { label: "Changelog", href: "/changelog" },
          { label: "Pricing", href: "/pricing" },
        ]}
        activeHref="/pricing"
        cta="Open the ledger"
      />
      <main>
        <PricingMeridianTiers
          eyebrow={`${brand} · pricing`}
          headline="One berth free. Then pay by the basin."
          copy="No seats, no usage arithmetic. A basin is a basin whether four people read it or forty."
          unitLabel="/ basin / month"
          tiers={[
            {
              id: "berth",
              name: "Berth",
              blurb: "One berth, finding its water.",
              monthly: 0,
              annual: 0,
              cta: "Start free",
              features: [
                "One berth on the ledger",
                "14 tides of history",
                "Exports, always",
              ],
            },
            {
              id: "basin",
              name: "Basin",
              blurb: "For a working basin, every tide.",
              monthly: 89,
              annual: 74,
              sealed: "Most chosen",
              cta: "Run the basin",
              features: [
                "Every berth in the basin",
                "Full history, forever",
                "Crane and gear modelling",
                "Audit answers from exports",
              ],
            },
            {
              id: "harbour",
              name: "Harbour",
              blurb: "The whole harbour, with controls.",
              monthly: 240,
              annual: 199,
              cta: "Talk to us",
              features: [
                "Every basin under one record",
                "SSO and signed exports",
                "A field team that has run yards",
                "Support with a name",
              ],
            },
          ]}
        />
        <FaqLastWord
          eyebrow={`${brand} · before you pay`}
          headline="The last four questions, answered whole."
          entries={[
            {
              id: "q1",
              question: "What happens to the record if we leave?",
              answer:
                "It leaves with you. Exports keep working after cancellation, and the ledger's history is yours in open formats — the record was always the point, not the lock.",
            },
            {
              id: "q2",
              question: "Why is the first berth free, really?",
              answer:
                "Because one berth is how a harbourmaster finds out whether the ledger survives their water. The paid tiers exist for people running whole basins, and they pay for the field team.",
            },
            {
              id: "q3",
              question: "Is there a discount that expires?",
              answer:
                "No. A price that changes if you hesitate is a negotiation, not a price. This one holds whether you sign today or after the winter.",
            },
            {
              id: "q4",
              question: "What does rollout actually cost us in time?",
              answer:
                "One afternoon for the first berth, two or three days with our field team for a basin. Your side of it is naming things and correcting one board in front of us.",
            },
          ]}
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Product", href: "/" },
          { label: "Changelog", href: "/changelog" },
          { label: "Contact", href: "#contact" },
        ]}
        fineprint={`© 2026 ${brand} Harbour Systems`}
      />
    </div>
  );
}
