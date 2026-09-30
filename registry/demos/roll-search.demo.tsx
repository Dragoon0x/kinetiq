"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RollSearch, type RollSearchItem } from "@/registry/ui/roll-search";

export const tweaks = defineTweaks({
  width: {
    kind: "range",
    label: "Width",
    default: 320,
    min: 200,
    max: 400,
    step: 20,
    unit: "px",
  },
  roll: { kind: "toggle", label: "Roll", default: true },
  results: {
    kind: "choice",
    label: "Results",
    default: "list",
    options: ["list", "cards"],
    names: { list: "List", cards: "Cards" },
  },
  highlight: { kind: "toggle", label: "Highlight", default: true },
});

const PAGES: readonly RollSearchItem[] = [
  { id: "pressure-gauges", label: "Pressure gauges", meta: "Guides" },
  {
    id: "calibrating",
    label: "Calibrating a gauge",
    meta: "Guides",
    keywords: ["calibration", "zero", "offset"],
  },
  { id: "flow-wiring", label: "Flow meter wiring", meta: "Hardware" },
  { id: "flow-classes", label: "Flow accuracy classes", meta: "Reference" },
  { id: "temperature", label: "Temperature probes", meta: "Guides" },
  { id: "cable", label: "Probe cable lengths", meta: "Reference" },
  { id: "thresholds", label: "Alarm thresholds", meta: "Setup" },
  { id: "routing", label: "Alarm routing", meta: "Setup" },
  { id: "firmware", label: "Firmware updates", meta: "Upkeep" },
  { id: "gauge-face", label: "Replacing a gauge face", meta: "Upkeep" },
  { id: "export", label: "Exporting readings", meta: "Data" },
  { id: "webhooks", label: "Reading webhooks", meta: "Data" },
  { id: "units", label: "Units and conversions", meta: "Reference" },
  {
    id: "drift",
    label: "Troubleshooting drift",
    meta: "Guides",
    keywords: ["calibration", "offset"],
  },
];

function GaugeGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-cobalt-bright"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M2.75 11.5a5.25 5.25 0 1 1 10.5 0" />
      <path d="M8 11.5l2.6-3.4" />
    </svg>
  );
}

/**
 * The Gaugeworks Docs header: the docs title on the left and the roll search
 * at the right end of the bar, over fourteen pages. Press the lens or type /
 * anywhere; pick a page with Enter or a click, or roll it back with Escape.
 */
export function RollSearchDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [opened, setOpened] = React.useState<string | null>(null);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const count = words.length
    ? PAGES.filter((page) => {
        const hay = [page.label, page.meta ?? "", ...(page.keywords ?? [])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      }).length
    : 0;

  const line: [string, string] = open
    ? query.trim()
      ? [
          "searching",
          `${count} ${count === 1 ? "result" : "results"} for “${query.trim()}”`,
        ]
      : ["searching", "type a page name"]
    : opened
      ? ["opened", opened]
      : ["docs", "press / to search"];

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {/* The search wraps under the title when there is no room for both:
          on a phone it unrolls across the whole bar. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-3 border border-hairline bg-card p-1.5 pl-3">
        <p className="flex h-9 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
          <GaugeGlyph />
          Gaugeworks Docs
        </p>
        <RollSearch
          className="ml-auto min-w-56 flex-1"
          label="Search docs"
          placeholder="Search pages"
          items={PAGES}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setOpened(null);
          }}
          onValueChange={setQuery}
          onSelect={(page) => setOpened(page.label)}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {` · ${line[1]}`}
        </p>
      ) : null}
    </div>
  );
}
