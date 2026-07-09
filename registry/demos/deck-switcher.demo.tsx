"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { DeckSwitcher, type DeckView } from "@/registry/ui/deck-switcher";

/** Fixed console feeds — every line indexed and invented, never random. */
const TELEMETRY_STATS = [
  { label: "CORE TEMP", value: "291.4 K" },
  { label: "BUS LOAD", value: "27.6 V" },
] as const;

const LOG_LINES = [
  "T+014.2  relay handshake ok",
  "T+015.0  manifold trim +2",
  "T+017.6  cabin pressure steady",
  "T+019.1  beacon sweep clear",
] as const;

const ROUTES = [
  { from: "DOCK 2", to: "SPUR 9", leg: "14 MIN" },
  { from: "SPUR 9", to: "RELAY 4", leg: "22 MIN" },
  { from: "RELAY 4", to: "BASIN 1", leg: "09 MIN" },
] as const;

const CREW = [
  { name: "Idra Volen", designation: "HELM" },
  { name: "Cass Marrow", designation: "SIGNALS" },
  { name: "Petra Lune", designation: "LIFE SYSTEMS" },
] as const;

function TelemetryView() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      {TELEMETRY_STATS.map((stat) => (
        <div
          key={stat.label}
          className="flex items-baseline justify-between gap-3 rounded-3 border border-hairline bg-surface-0 px-3 py-2.5"
        >
          <span className="text-label text-ink-3">{stat.label}</span>
          <span className="font-mono text-sm text-signal tabular-nums">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LogView() {
  return (
    <ul className="m-0 flex h-full list-none flex-col justify-center gap-2 p-4">
      {LOG_LINES.map((line) => (
        <li
          key={line}
          className="truncate font-mono text-[11px] tracking-wide text-ink-2 tabular-nums"
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

function RoutesView() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {ROUTES.map((route) => (
        <div
          key={route.to}
          className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-0 px-3 py-2"
        >
          <span className="font-mono text-[11px] text-ink-2 tabular-nums">
            {route.from}
          </span>
          <span aria-hidden className="text-ink-3">
            &rarr;
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink tabular-nums">
            {route.to}
          </span>
          <span className="shrink-0 text-label text-ink-3 tabular-nums">
            {route.leg}
          </span>
        </div>
      ))}
    </div>
  );
}

function CrewView() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {CREW.map((member) => (
        <div
          key={member.name}
          className="flex items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-0 px-3 py-2"
        >
          <span className="min-w-0 truncate text-sm font-medium text-ink">
            {member.name}
          </span>
          <span className="shrink-0 text-label text-ink-3">
            {member.designation}
          </span>
        </div>
      ))}
    </div>
  );
}

const VIEWS: DeckView[] = [
  { id: "telemetry", title: "TELEMETRY", content: <TelemetryView /> },
  { id: "log", title: "LOG", content: <LogView /> },
  { id: "routes", title: "ROUTES", content: <RoutesView /> },
  { id: "crew", title: "CREW", content: <CrewView /> },
];

/**
 * DeckSwitcher as a bench console: four open views racked behind one stage,
 * framed by the KQ-117 bezel. The status line mirrors every committed switch.
 */
export function DeckSwitcherDemo() {
  const [activeTitle, setActiveTitle] = React.useState("TELEMETRY");

  const handleActiveChange = (id: string) => {
    const view = VIEWS.find((entry) => entry.id === id);
    if (view) setActiveTitle(view.title);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            CONSOLE VIEWS &middot; 04
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-117</span>
        </div>

        <DeckSwitcher
          views={VIEWS}
          defaultActiveId="telemetry"
          onActiveChange={handleActiveChange}
          height={280}
          aria-label="Console views"
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          VIEW &middot; <span className="text-signal">{activeTitle}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Open the deck, slide, and commit a view - Escape backs out.
      </p>
    </div>
  );
}
