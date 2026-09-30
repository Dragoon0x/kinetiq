"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LiquidTabbar, type LiquidTabItem } from "@/registry/ui/liquid-tabbar";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tabs: {
    kind: "range",
    label: "Tabs",
    default: 5,
    min: 3,
    max: 5,
    step: 1,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "accent",
    options: ["accent", "ink", "signal"],
    names: { accent: "Accent", ink: "Ink", signal: "Signal" },
  },
});

const TABS: LiquidTabItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "activity", label: "Activity", icon: "chart" },
  { id: "cards", label: "Cards", icon: "card" },
  { id: "alerts", label: "Alerts", icon: "bell" },
  { id: "profile", label: "Profile", icon: "person" },
];

const SCREENS: Record<string, { title: string; lines: [string, string] }> = {
  home: {
    title: "Good evening, Ana",
    lines: ["Balance 2,418.60", "Rent due in 4 days"],
  },
  activity: { title: "This week", lines: ["Groceries 64.20", "Coffee 9.80"] },
  cards: {
    title: "Waylight Pay card",
    lines: ["Ends 4021 · active", "Limit 1,500.00"],
  },
  alerts: {
    title: "2 new alerts",
    lines: ["Salary arrived", "Card used abroad"],
  },
  profile: {
    title: "Ana Brook",
    lines: ["Plan: Everyday", "Member since 2021"],
  },
};

/**
 * Waylight Pay on a phone-width screen: the bottom bar switches the screen
 * above it, and the drop shows where you are.
 */
export function LiquidTabbarDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const panelId = React.useId();
  const [tab, setTab] = React.useState("activity");
  const [trips, setTrips] = React.useState(0);
  const count = values.tabs ?? tweaks.tabs.default;
  const visible = TABS.slice(0, count);
  const at = Math.max(
    0,
    visible.findIndex((t) => t.id === tab),
  );
  const current = visible[at] ?? TABS[0];
  const screen = SCREENS[current?.id ?? "home"];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div
          id={panelId}
          role="tabpanel"
          aria-label={current?.label}
          className="flex h-[120px] flex-col justify-end gap-1 rounded-4 border border-hairline bg-surface-1 px-4 pb-3"
        >
          <p className="text-sm font-medium text-foreground">{screen?.title}</p>
          <p className="font-mono text-xs text-ink-2 tabular-nums">
            {screen?.lines[0]}
          </p>
          <p className="font-mono text-xs text-ink-3 tabular-nums">
            {screen?.lines[1]}
          </p>
        </div>
        <LiquidTabbar
          label="Waylight Pay"
          items={TABS}
          value={current?.id}
          onValueChange={(id) => {
            setTab(id);
            setTrips((n) => n + 1);
          }}
          panelId={panelId}
          sound={sound}
          {...values}
          tabs={count}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{current?.label}</span> · {at + 1} of{" "}
          {visible.length} · flowed {trips} {trips === 1 ? "time" : "times"}
        </p>
      ) : null}
    </div>
  );
}
