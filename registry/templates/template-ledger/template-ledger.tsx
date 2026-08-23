"use client";

import * as React from "react";

import { NavSplitDesk } from "@/registry/blocks/nav-split-desk/nav-split-desk";
import { HeroSignalRidge } from "@/registry/blocks/hero-signal-ridge/hero-signal-ridge";
import { LogoReceiptWall } from "@/registry/blocks/logo-receipt-wall/logo-receipt-wall";
import { DatatableOpsDesk } from "@/registry/blocks/datatable-ops-desk/datatable-ops-desk";
import { DatatableRunHistory } from "@/registry/blocks/datatable-run-history/datatable-run-history";
import { StatsRankRace } from "@/registry/blocks/stats-rank-race/stats-rank-race";
import { IntegrationsTwoWay } from "@/registry/blocks/integrations-two-way/integrations-two-way";
import { TrustDataResidency } from "@/registry/blocks/trust-data-residency/trust-data-residency";
import { PricingUsageDial } from "@/registry/blocks/pricing-usage-dial/pricing-usage-dial";
import { CtaLastObjection } from "@/registry/blocks/cta-last-objection/cta-last-objection";
import { FooterTerrace } from "@/registry/blocks/footer-terrace/footer-terrace";
import { cn } from "@/registry/lib/utils";

export type TemplateLedgerProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * For instruments rather than apps: the product is shown working — a real
 * sortable grid, a trend per row, standings that re-rank — before it is
 * described. Buyers of data tools have been shown too many screenshots, and
 * the fastest way past that is a page where the table on it actually sorts.
 */
export function TemplateLedger({
  brand = "Gaugeworks",
  className,
}: TemplateLedgerProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavSplitDesk
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroSignalRidge eyebrow={`${brand} · live telemetry`} />
        <LogoReceiptWall eyebrow={`${brand} · with receipts`} />
        <DatatableOpsDesk eyebrow={`${brand} · the run ledger`} />
        <DatatableRunHistory eyebrow={`${brand} · morning cut times`} />
        <StatsRankRace eyebrow={`${brand} · mornings cut, by trade`} />
        <IntegrationsTwoWay eyebrow={`${brand} · what actually moves`} />
        <TrustDataResidency eyebrow={`${brand} · where it sits`} />
        <PricingUsageDial eyebrow={`${brand} · pricing`} />
        <CtaLastObjection eyebrow={`${brand} · the part you are stuck on`} />
      </main>
      <FooterTerrace
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        fineprint="© 2026 Gaugeworks Instruments"
      />
    </div>
  );
}
