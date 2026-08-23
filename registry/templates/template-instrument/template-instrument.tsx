"use client";

import * as React from "react";

import { NavSplitDesk } from "@/registry/blocks/nav-split-desk/nav-split-desk";
import { HeroSplitLedger } from "@/registry/blocks/hero-split-ledger/hero-split-ledger";
import { LogoSegmentShelf } from "@/registry/blocks/logo-segment-shelf/logo-segment-shelf";
import { FeaturesBentoField } from "@/registry/blocks/features-bento-field/features-bento-field";
import { HowDayClock } from "@/registry/blocks/how-day-clock/how-day-clock";
import { UsecaseTwoMornings } from "@/registry/blocks/usecase-two-mornings/usecase-two-mornings";
import { StatsSignalBand } from "@/registry/blocks/stats-signal-band/stats-signal-band";
import { TestimonialCaseColumn } from "@/registry/blocks/testimonial-case-column/testimonial-case-column";
import { PricingMeridianTiers } from "@/registry/blocks/pricing-meridian-tiers/pricing-meridian-tiers";
import { FaqLastWord } from "@/registry/blocks/faq-last-word/faq-last-word";
import { CtaSplitDoors } from "@/registry/blocks/cta-split-doors/cta-split-doors";
import { FooterTerrace } from "@/registry/blocks/footer-terrace/footer-terrace";
import { cn } from "@/registry/lib/utils";

export type TemplateInstrumentProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * The full argument, top to bottom, for a product that has to be believed
 * before it is bought: claim, proof of who runs it, what it does, how a day
 * goes, the same morning before and after, the numbers, one customer at
 * length, price, the four honest questions, and two doors out.
 *
 * Eleven shipped sections and no page-local markup. Every one takes typed
 * props — replace the narrative rather than the layout.
 */
export function TemplateInstrument({
  brand = "Waylight",
  className,
}: TemplateInstrumentProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavSplitDesk
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroSplitLedger eyebrow={`${brand} · crew planning`} />
        <LogoSegmentShelf eyebrow={`${brand} · who runs on it`} />
        <FeaturesBentoField eyebrow={`${brand} · build infrastructure`} />
        <HowDayClock eyebrow={`${brand} · one day, worked`} />
        <UsecaseTwoMornings eyebrow={`${brand} · the same morning`} />
        <StatsSignalBand />
        <TestimonialCaseColumn eyebrow={`${brand} · one yard, at length`} />
        <PricingMeridianTiers eyebrow={`${brand} · pricing`} />
        <FaqLastWord eyebrow={`${brand} · plainly`} />
        <CtaSplitDoors />
      </main>
      <FooterTerrace
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        fineprint="© 2026 Waylight Systems"
      />
    </div>
  );
}
