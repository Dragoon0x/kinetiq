"use client";

import * as React from "react";

import { FoldSidebar, type FoldSidebarGroup } from "@/registry/ui/fold-sidebar";

const GROUPS: FoldSidebarGroup[] = [
  {
    label: "Monitor",
    items: [
      { id: "overview", label: "Overview", icon: "gauge" },
      { id: "dashboards", label: "Dashboards", icon: "grid" },
      { id: "alerts", label: "Alerts", icon: "bell" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "team", label: "Team", icon: "users" },
      { id: "billing", label: "Billing", icon: "card" },
      { id: "settings", label: "Settings", icon: "gear" },
    ],
  },
];

const PANES: Record<string, { title: string; note: string; stat: string }> = {
  overview: {
    title: "Overview",
    note: "Six rigs reporting. Bench two is still on the old firmware.",
    stat: "6 / 6 up",
  },
  dashboards: {
    title: "Dashboards",
    note: "Four saved views, two of them shared with the floor.",
    stat: "4 views",
  },
  alerts: {
    title: "Alerts",
    note: "One warning on the intake line, opened 40 minutes ago.",
    stat: "1 open",
  },
  team: {
    title: "Team",
    note: "Nine seats in use of the twelve on the plan.",
    stat: "9 seats",
  },
  billing: {
    title: "Billing",
    note: "Next invoice draws on the 4th, card ending 4417.",
    stat: "Due 4th",
  },
  settings: {
    title: "Settings",
    note: "Retention holds readings for 90 days, then rolls them up.",
    stat: "90 days",
  },
};

export function FoldSidebarDemo() {
  const [item, setItem] = React.useState("dashboards");
  const [rail, setRail] = React.useState(false);
  const pane = PANES[item];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex h-[260px] w-full overflow-hidden rounded-3 border border-hairline bg-surface-0">
        <FoldSidebar
          groups={GROUPS}
          value={item}
          onValueChange={setItem}
          collapsed={rail}
          onCollapsedChange={setRail}
          label="Gaugeworks console"
        />

        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          <p className="text-label text-ink-3">Gaugeworks</p>
          <h4 className="mt-1 text-sm font-semibold text-foreground">
            {pane?.title}
          </h4>
          <p className="mt-2 text-xs leading-5 text-ink-2">{pane?.note}</p>
          <p className="mt-3 border-t border-hairline pt-3 font-mono text-[11px] text-ink-3 tabular-nums">
            {pane?.stat}
          </p>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{rail ? "Rail" : "Open"}</span> ·{" "}
        <span className="text-signal">{pane?.title}</span>
      </p>
    </div>
  );
}
