"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StatCard } from "@/registry/ui/stat-card";

export const tweaks = defineTweaks({
  rarity: {
    kind: "choice",
    label: "Rarity",
    default: "rare",
    options: ["common", "rare", "epic"],
    names: { common: "Common", rare: "Rare", epic: "Epic" },
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 10,
    min: 0,
    max: 20,
    step: 1,
    unit: "°",
  },
  roll: { kind: "toggle", label: "Roll", default: true },
});

const STATS = [
  { label: "Reviews", value: 248, max: 400 },
  { label: "Deploys", value: 1204, max: 1500 },
  { label: "Streak, days", value: 36, max: 60 },
  { label: "Mentored", value: 9, max: 12 },
];

const FACTS = [
  { label: "Team", value: "Basinworks Infra" },
  { label: "Based in", value: "Coldbrook" },
  { label: "On call", value: "Tuesdays" },
];

/**
 * A card from the Basinworks team directory: who keeps the deploy pipeline
 * running, and what they have shipped.
 */
export function StatCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [level, setLevel] = React.useState(12);
  const [flipped, setFlipped] = React.useState(false);
  const [levelled, setLevelled] = React.useState(false);
  const rarity = values.rarity ?? tweaks.rarity.default;

  const card = (
    <StatCard
      name="Noor Haddad"
      role="Platform engineer"
      team="Basinworks Infra"
      level={level}
      stats={STATS}
      bio="Keeps the deploy pipeline honest. Wrote the rollback drill every team now runs on Fridays, and still answers the pager with a joke."
      facts={FACTS}
      number="042/300"
      since="2021"
      flipped={flipped}
      onFlippedChange={setFlipped}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return card;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex justify-center">{card}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">level {level}</span> · {rarity} ·{" "}
          {flipped ? "bio side" : levelled ? "levelled up" : "stats side"}
        </p>
        <button
          type="button"
          onClick={() => {
            setLevel((l) => Math.min(99, l + 1));
            setLevelled(true);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Level up
        </button>
      </div>
    </div>
  );
}
