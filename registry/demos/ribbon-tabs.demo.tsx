"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RibbonTabs, type RibbonTab } from "@/registry/ui/ribbon-tabs";

export const tweaks = defineTweaks({
  sway: {
    kind: "range",
    label: "Sway",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  fabric: {
    kind: "choice",
    label: "Fabric",
    default: "satin",
    options: ["satin", "linen", "velvet"],
    names: { satin: "Satin", linen: "Linen", velvet: "Velvet" },
  },
  length: {
    kind: "range",
    label: "Length",
    default: 40,
    min: 24,
    max: 64,
    step: 4,
    unit: "px",
  },
});

type Sheet = {
  id: string;
  label: string;
  figure: string;
  word: string;
  detail: string;
  /** Four weeks, as shares of the busiest. */
  weeks: number[];
};

const SHEETS: Sheet[] = [
  {
    id: "spend",
    label: "Spend",
    figure: "$2,418.60",
    word: "out",
    detail: "Groceries and transit lead.",
    weeks: [62, 48, 100, 41],
  },
  {
    id: "income",
    label: "Income",
    figure: "$5,200.00",
    word: "in",
    detail: "Two salary deposits, one refund.",
    weeks: [100, 4, 96, 10],
  },
  {
    id: "bills",
    label: "Bills",
    figure: "$1,136.25",
    word: "paid",
    detail: "Rent, power and broadband.",
    weeks: [100, 22, 18, 30],
  },
  {
    id: "saved",
    label: "Saved",
    figure: "$1,645.15",
    word: "saved",
    detail: "Round-ups added $38.40.",
    weeks: [40, 55, 70, 100],
  },
];

function Statement({ sheet }: { sheet: Sheet }) {
  return (
    <div className="flex items-end justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="font-mono text-lg leading-7 text-foreground tabular-nums">
          {sheet.figure}
          <span className="ml-1.5 font-sans text-xs text-ink-3">
            {sheet.word}
          </span>
        </p>
        <p className="text-xs leading-4 text-ink-2">{sheet.detail}</p>
      </div>
      <div aria-hidden className="flex h-10 shrink-0 items-end gap-1">
        {sheet.weeks.map((w, i) => (
          <span
            key={i}
            className="w-2 rounded-t-1 bg-cobalt-bright/60"
            style={{ height: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const TABS: RibbonTab[] = SHEETS.map((sheet) => ({
  id: sheet.id,
  label: sheet.label,
  content: <Statement sheet={sheet} />,
}));

/**
 * A month's statement in Waylight Pay: four ribbons on a rail, one for each
 * way the money moved.
 */
export function RibbonTabsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tab, setTab] = React.useState("spend");
  const at = Math.max(
    0,
    SHEETS.findIndex((s) => s.id === tab),
  );
  const sheet = SHEETS[at] ?? SHEETS[0];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <RibbonTabs
        label="Statement for April"
        tabs={TABS}
        value={tab}
        onValueChange={setTab}
        sound={sound}
        {...values}
      />
      {chrome && sheet ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{sheet.label}</span> · {at + 1} of{" "}
          {SHEETS.length} · {sheet.figure} {sheet.word}
        </p>
      ) : null}
    </div>
  );
}
