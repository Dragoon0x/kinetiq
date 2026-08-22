"use client";

import { StatsImpactReport } from "@/registry/blocks/stats-impact-report/stats-impact-report";

/** The section at its own scale — full width, default narrative. */
export function StatsImpactReportDemo() {
  return (
    <div className="w-full">
      <StatsImpactReport />
    </div>
  );
}
