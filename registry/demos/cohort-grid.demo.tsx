"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CohortGrid,
  defaultCohorts,
  type CohortMetric,
} from "@/registry/ui/cohort-grid";

export const tweaks = defineTweaks({
  cascade: {
    kind: "choice",
    label: "Cascade",
    default: "diagonal",
    options: ["diagonal", "rows", "columns"],
    names: { diagonal: "Diagonal", rows: "Rows", columns: "Columns" },
  },
  metric: {
    kind: "choice",
    label: "Metric",
    default: "users",
    options: ["users", "revenue"],
    names: { users: "Users", revenue: "Revenue" },
  },
  curve: {
    kind: "choice",
    label: "Curve",
    default: "area",
    options: ["area", "line", "off"],
    names: { area: "Area", line: "Line", off: "Off" },
  },
});

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const label = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const grouped = new Intl.NumberFormat("en-US");

const valueAt = (cohortId: string, week: number, metric: CohortMetric) => {
  const c = defaultCohorts.find((x) => x.id === cohortId);
  if (!c) return null;
  if (metric === "users") {
    const v = c.users[week];
    return v === undefined ? null : { share: v / c.size, abs: v, c };
  }
  const v = c.revenue[week];
  const base = c.revenue[0] ?? 0;
  return v === undefined || !base ? null : { share: v / base, abs: v, c };
};

/** Size-weighted week-1 retention over the cohorts that have finished it. */
const week1 = (() => {
  let num = 0;
  let den = 0;
  for (const c of defaultCohorts.slice(0, -1)) {
    num += c.users[1] ?? 0;
    den += c.size;
  }
  return den ? Math.round((num / den) * 100) : 0;
})();

/**
 * Fieldline's weekly sign-up cohorts from 20 July to 21 September, seen on
 * 30 September: the onboarding that shipped in mid-August shows up as
 * warmer rows below it.
 */
export function CohortGridDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The metric tweak sets where the switch starts; the switch is the visitor's.
  const [metric, setMetric] = React.useState<CohortMetric>(
    values.metric ?? "users",
  );
  const [seenMetric, setSeenMetric] = React.useState(values.metric);
  if (seenMetric !== values.metric) {
    setSeenMetric(values.metric);
    if (values.metric !== undefined) setMetric(values.metric);
  }
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [cell, setCell] = React.useState<{
    cohortId: string;
    week: number;
  } | null>(null);

  const grid = (
    <CohortGrid
      title="Fieldline retention"
      sound={sound}
      {...values}
      metric={metric}
      onMetricChange={setMetric}
      selected={pinned}
      onSelectedChange={setPinned}
      onCrosshairChange={setCell}
    />
  );

  if (!chrome) return <div className="w-full">{grid}</div>;

  const at = cell ? valueAt(cell.cohortId, cell.week, metric) : null;
  const pin = defaultCohorts.find((c) => c.id === pinned);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {grid}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {cell && at ? (
          <>
            <span className="text-signal">
              {label(at.c.start)} · week {cell.week} ·{" "}
              {Math.round(at.share * 100)}%
            </span>{" "}
            ·{" "}
            {metric === "users"
              ? `${grouped.format(at.abs)} of ${grouped.format(at.c.size)} users`
              : `$${grouped.format(Math.round(at.abs))} that week`}
          </>
        ) : (
          <>
            <span className="text-signal">week 1 avg {week1}%</span> ·{" "}
            {pin ? `pinned ${label(pin.start)}` : "nothing pinned"} ·{" "}
            {metric === "users" ? "users retained" : "revenue retained"}
          </>
        )}
      </p>
    </div>
  );
}
