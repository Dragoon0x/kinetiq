"use client";

import * as React from "react";

import { AnnounceLaunchRail } from "@/registry/blocks/announce-launch-rail/announce-launch-rail";
import { NavDockPill } from "@/registry/blocks/nav-dock-pill/nav-dock-pill";
import { HeroLaunchBeacon } from "@/registry/blocks/hero-launch-beacon/hero-launch-beacon";
import { FeaturesProofStrip } from "@/registry/blocks/features-proof-strip/features-proof-strip";
import { HowPlainSteps } from "@/registry/blocks/how-plain-steps/how-plain-steps";
import { ProofLiveFloor } from "@/registry/blocks/proof-live-floor/proof-live-floor";
import { NewsletterPressroom } from "@/registry/blocks/newsletter-pressroom/newsletter-pressroom";
import { CtaLaunchWindow } from "@/registry/blocks/cta-launch-window/cta-launch-window";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type TemplateLaunchProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * The launch site: one announcement, one ask, and as little else as the page
 * can survive on. It is deliberately short — for the weeks when there is not
 * much to show, a long page mostly advertises how little there is, and the
 * only conversion that matters is the address.
 */
export function TemplateLaunch({
  brand = "Basinworks",
  className,
}: TemplateLaunchProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <AnnounceLaunchRail
        updates={[
          "Basinworks 1.0 is live — the first yard is free, indefinitely.",
          "What a crane hold actually costs, measured across nine yards.",
          "Signing from the gate shipped this week.",
        ]}
      />
      <NavDockPill
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroLaunchBeacon
          notice={`${brand} 1.0 — now open`}
          headline={["The morning, settled", "before the gate opens."]}
          copy={`${brand} turns a yard's worth of moving work into one legible day. The first yard is free and stays free.`}
        />
        <FeaturesProofStrip eyebrow={`${brand} · felt, not claimed`} />
        <HowPlainSteps eyebrow={`${brand} · how it works`} />
        <ProofLiveFloor eyebrow={`${brand} · the floor, now`} />
        <NewsletterPressroom eyebrow={`${brand} · the letter`} />
        <CtaLaunchWindow />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        fineprint="© 2026 Basinworks Field Systems"
      />
    </div>
  );
}
