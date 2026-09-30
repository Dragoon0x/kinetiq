"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  alphabetSections,
  ThumbIndex,
  type ThumbIndexSection,
} from "@/registry/ui/thumb-index";

export const tweaks = defineTweaks({
  sections: {
    kind: "range",
    label: "Sections",
    default: 8,
    min: 4,
    max: 12,
    step: 1,
  },
  tabs: {
    kind: "choice",
    label: "Tabs",
    default: "round",
    options: ["round", "square"],
    names: { round: "Round", square: "Square" },
  },
  riffle: {
    kind: "range",
    label: "Riffle",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Seed = { name: string; sow: string; days: string };

/** The Fernworks seed catalogue, in alphabetical order. */
const SEEDS: Seed[] = [
  { name: "Alyssum", sow: "Mar–May", days: "5–10" },
  { name: "Amaranth", sow: "Apr–Jun", days: "7–14" },
  { name: "Aster", sow: "Mar–Apr", days: "10–21" },
  { name: "Basil", sow: "Apr–Jun", days: "5–10" },
  { name: "Beetroot", sow: "Mar–Jul", days: "7–14" },
  { name: "Borage", sow: "Mar–May", days: "7–10" },
  { name: "Calendula", sow: "Mar–May", days: "7–14" },
  { name: "Chard", sow: "Apr–Aug", days: "7–14" },
  { name: "Chervil", sow: "Mar–Sep", days: "10–14" },
  { name: "Coriander", sow: "Apr–Aug", days: "7–10" },
  { name: "Cosmos", sow: "Mar–May", days: "7–10" },
  { name: "Dill", sow: "Apr–Jul", days: "10–14" },
  { name: "Echinacea", sow: "Feb–Apr", days: "10–21" },
  { name: "Endive", sow: "May–Aug", days: "5–7" },
  { name: "Fennel", sow: "Apr–Jul", days: "7–14" },
  { name: "Foxglove", sow: "May–Jul", days: "14–21" },
  { name: "Garlic chives", sow: "Mar–May", days: "10–14" },
  { name: "Hyssop", sow: "Mar–May", days: "14–21" },
  { name: "Iceland poppy", sow: "Mar–Jun", days: "10–21" },
  { name: "Kale", sow: "Mar–Jul", days: "5–10" },
  { name: "Kohlrabi", sow: "Mar–Aug", days: "5–10" },
  { name: "Leek", sow: "Feb–Apr", days: "10–14" },
  { name: "Lettuce", sow: "Feb–Sep", days: "4–10" },
  { name: "Lovage", sow: "Mar–May", days: "10–20" },
  { name: "Marigold", sow: "Mar–May", days: "5–10" },
  { name: "Mizuna", sow: "Apr–Sep", days: "4–7" },
  { name: "Nasturtium", sow: "Apr–Jun", days: "7–14" },
  { name: "Nigella", sow: "Mar–May", days: "10–14" },
  { name: "Okra", sow: "Apr–May", days: "7–14" },
  { name: "Oregano", sow: "Mar–May", days: "7–14" },
  { name: "Parsley", sow: "Mar–Jul", days: "14–28" },
  { name: "Pea", sow: "Mar–Jun", days: "7–10" },
  { name: "Pumpkin", sow: "Apr–Jun", days: "5–10" },
  { name: "Quinoa", sow: "Apr–May", days: "3–5" },
  { name: "Radish", sow: "Mar–Sep", days: "3–7" },
  { name: "Rudbeckia", sow: "Feb–Apr", days: "7–21" },
  { name: "Sage", sow: "Mar–May", days: "10–21" },
  { name: "Sorrel", sow: "Mar–Jul", days: "7–14" },
  { name: "Spinach", sow: "Mar–Sep", days: "7–14" },
  { name: "Sunflower", sow: "Apr–Jun", days: "7–10" },
  { name: "Sweet pea", sow: "Oct–Apr", days: "10–14" },
  { name: "Thyme", sow: "Mar–May", days: "14–28" },
  { name: "Tomato", sow: "Feb–Apr", days: "6–10" },
  { name: "Turnip", sow: "Mar–Aug", days: "5–10" },
  { name: "Valerian", sow: "Mar–May", days: "14–21" },
  { name: "Viola", sow: "Feb–Jul", days: "10–21" },
  { name: "Watercress", sow: "Apr–Sep", days: "7–14" },
  { name: "Yarrow", sow: "Mar–May", days: "10–14" },
  { name: "Zinnia", sow: "Apr–Jun", days: "5–7" },
];

const seedsIn = (section: ThumbIndexSection) =>
  SEEDS.filter((s) =>
    (section.letters ?? section.label).includes(s.name.charAt(0)),
  );

const plural = (n: number) => (n === 1 ? "1 seed" : `${n} seeds`);

function SeedPage({ section }: { section: ThumbIndexSection }) {
  const seeds = seedsIn(section);
  if (seeds.length === 0) {
    return (
      <p className="text-xs text-ink-3">
        Nothing under {section.title ?? section.label} this season.
      </p>
    );
  }
  return (
    <ul role="list" className="flex flex-col">
      {seeds.map((s) => (
        <li
          key={s.name}
          className="flex items-baseline justify-between gap-3 border-b border-hairline py-2 last:border-b-0"
        >
          <span className="truncate text-sm text-foreground">{s.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {s.sow} · {s.days} d
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Fernworks seed catalogue: a page for each run of letters, reached by
 * the tabs cut into its edge.
 */
export function ThumbIndexDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [id, setId] = React.useState("a");
  const count = values.sections ?? tweaks.sections.default;
  const list = React.useMemo(() => alphabetSections(count), [count]);
  const current =
    list.find((s) => s.id === id) ??
    list.find((s) => s.letters?.includes(id.charAt(0).toUpperCase())) ??
    list[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <ThumbIndex
        label="Seed catalogue"
        value={id}
        onValueChange={setId}
        sound={sound}
        {...values}
      >
        {(section) => <SeedPage section={section} />}
      </ThumbIndex>
      {chrome && current ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">section {current.label}</span> ·{" "}
          {plural(seedsIn(current).length)} · type a letter to jump
        </p>
      ) : null}
    </div>
  );
}
