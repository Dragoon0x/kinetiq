"use client";

import * as React from "react";

import { Gauge, ScrollText, Wrench } from "lucide-react";

import {
  GantryTabs,
  GantryTabsContent,
  GantryTabsList,
  GantryTabsTrigger,
} from "@/registry/ui/gantry-tabs";

const STATS = [
  { label: "UPTIME", value: "99.98%" },
  { label: "LAST CAL", value: "6d ago" },
] as const;

const CALIBRATION = [
  { label: "Offset drift", value: "+0.0021 mm" },
  { label: "Reference gain", value: "1.0004×" },
] as const;

const LOGS = [
  "09:14:02  CAL cycle complete",
  "08:57:41  TEMP stable 21.3°C",
  "08:31:09  CH-04 armed",
] as const;

const EXPAND_TABS = [
  { value: "monitor", label: "Monitor", icon: Gauge, line: "CH-01…04 nominal · 21.3°C" },
  { value: "service", label: "Service", icon: Wrench, line: "Next service window: 6d 4h" },
  { value: "logs", label: "Logs", icon: ScrollText, line: "09:14:02  CAL cycle complete" },
] as const;

export function GantryTabsDemo() {
  return (
    <div className="w-full max-w-sm space-y-8">
      <div>
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          Bay controls
        </p>
        <GantryTabs defaultValue="monitor" variant="expand">
          <GantryTabsList>
            {EXPAND_TABS.map((tab) => (
              <GantryTabsTrigger
                key={tab.value}
                value={tab.value}
                icon={<tab.icon className="size-4" />}
              >
                {tab.label}
              </GantryTabsTrigger>
            ))}
          </GantryTabsList>
          {EXPAND_TABS.map((tab) => (
            <GantryTabsContent key={tab.value} value={tab.value} className="pt-3">
              <p className="text-muted-foreground truncate font-mono text-xs">
                {tab.line}
              </p>
            </GantryTabsContent>
          ))}
        </GantryTabs>
      </div>

      <div>
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          Instrument settings
        </p>
      <GantryTabs defaultValue="overview" variant="segmented">
        <GantryTabsList>
          <GantryTabsTrigger value="overview">Overview</GantryTabsTrigger>
          <GantryTabsTrigger value="calibration">Calibration</GantryTabsTrigger>
          <GantryTabsTrigger value="logs">Logs</GantryTabsTrigger>
        </GantryTabsList>

        <GantryTabsContent value="overview" className="h-[140px] pt-4">
          <div className="space-y-2 font-mono text-xs">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="border-border flex items-baseline justify-between border-b pb-2"
              >
                <span className="text-muted-foreground">{stat.label}</span>
                <span className="tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>
        </GantryTabsContent>

        <GantryTabsContent value="calibration" className="h-[140px] pt-4">
          <div className="space-y-2">
            {CALIBRATION.map((row) => (
              <div
                key={row.label}
                className="border-border flex items-baseline justify-between border-b pb-2 text-sm"
              >
                <span className="text-muted-foreground text-xs">
                  {row.label}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </GantryTabsContent>

        <GantryTabsContent value="logs" className="h-[140px] pt-4">
          <div className="space-y-2 font-mono text-xs">
            {LOGS.map((line) => (
              <p key={line} className="text-muted-foreground truncate">
                {line}
              </p>
            ))}
          </div>
        </GantryTabsContent>
        </GantryTabs>
      </div>
    </div>
  );
}
