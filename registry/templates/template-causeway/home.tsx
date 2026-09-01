"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroCompareWipe } from "@/registry/blocks/hero-compare-wipe/hero-compare-wipe";
import { FeaturesQuietGrid } from "@/registry/blocks/features-quiet-grid/features-quiet-grid";
import { ProofLiveFloor } from "@/registry/blocks/proof-live-floor/proof-live-floor";
import { CtaPostscript } from "@/registry/blocks/cta-postscript/cta-postscript";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type CausewayHomeProps = {
  brand?: string;
  className?: string;
};

/**
 * The front page of a three-page site. The template's argument is spread
 * across routes — the product here, the record of change at /changelog, the
 * price at /pricing — and the nav carries real hrefs between them, so the
 * three files install as one navigable site rather than three orphans.
 */
export function CausewayHome({
  brand = "Basinworks",
  className,
}: CausewayHomeProps) {
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
        activeHref="/"
        cta="Open the ledger"
      />
      <main>
        <HeroCompareWipe
          eyebrow={brand}
          headline="Drag the blade across the berth board."
          copy="Left is a tide on VHF and a clipboard. Right is the same tide on a shared ledger. Same berths, same crane, same water."
          cta="Run one tide"
          altLabel="Read what changed lately"
          altHref="/changelog"
          beforeLabel="On the radio"
          afterLabel="On the ledger"
          before={[
            { id: "b1", time: "04:50", text: "VHF: who holds berth 4?" },
            { id: "b2", time: "05:05", text: "VHF: say again, over" },
            { id: "b3", time: "05:30", text: "clipboard rewritten (2nd time)" },
            { id: "b4", time: "05:55", text: "linesmen idle, cause unknown" },
          ]}
          after={[
            {
              id: "a1",
              time: "04:50",
              text: "ledger r3 posted — berth 4 to Kestrel",
            },
            { id: "a2", time: "05:05", text: "linesmen ack, second slot" },
            { id: "a3", time: "05:30", text: "no change" },
            { id: "a4", time: "05:55", text: "no change" },
          ]}
        />
        <FeaturesQuietGrid
          eyebrow={`${brand} · what it does`}
          headline="Six things, stated plainly."
          copy="A berth ledger, not a platform. Each of these is one screen, and none of them needs a training day."
        />
        <ProofLiveFloor
          eyebrow={`${brand} · the water, now`}
          headline="Somewhere the tide is high."
          copy="Every line below is a real shape of event from a live harbour. Names never appear — the argument is the volume and the ordinariness of it."
        />
        <CtaPostscript
          postscript={`P.S. — We built ${brand} because our own tides were arguments. If yours are too, the first berth is free, and it takes an afternoon. Worst case, you go back to the radio and you have lost one tide.`}
          signature="J. Marsden"
          signatureRole={`Harbourmaster turned founder, ${brand}`}
          cta="Run one tide"
          altLabel="See the price first"
          altHref="/pricing"
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Changelog", href: "/changelog" },
          { label: "Pricing", href: "/pricing" },
          { label: "Contact", href: "#contact" },
        ]}
        fineprint={`© 2026 ${brand} Harbour Systems`}
      />
    </div>
  );
}
