"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SiftFilter, type SiftFilterItem } from "@/registry/ui/sift-filter";

export const tweaks = defineTweaks({
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 2750,
    min: 1000,
    max: 6000,
    step: 250,
    unit: "px/s²",
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 14,
    min: 0,
    max: 40,
    step: 2,
    unit: "°",
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 35,
    min: 0,
    max: 100,
    step: 5,
    unit: "ms",
  },
  highlight: { kind: "toggle", label: "Highlight", default: true },
});

const PLANTS: readonly SiftFilterItem[] = [
  { id: "maidenhair", title: "Maidenhair fern", meta: "Shade · humid" },
  { id: "boston", title: "Boston fern", meta: "Bright shade · humid" },
  { id: "birds-nest", title: "Bird's nest fern", meta: "Shade · easy" },
  {
    id: "snake",
    title: "Snake plant",
    meta: "Low light · dry",
    tags: ["hardy", "easy"],
  },
  { id: "jade", title: "Jade plant", meta: "Full sun · dry" },
  { id: "pearls", title: "String of pearls", meta: "Full sun · trailing" },
  {
    id: "pothos",
    title: "Golden pothos",
    meta: "Any light · trailing",
    tags: ["hardy", "easy"],
  },
  { id: "calathea", title: "Calathea", meta: "Shade · humid" },
  { id: "aloe", title: "Aloe", meta: "Full sun · dry", tags: ["succulent"] },
  { id: "fiddle", title: "Fiddle-leaf fig", meta: "Bright light · tall" },
];

/**
 * The Fernworks nursery, "Find a plant": ten plants with their light and
 * care. Type "fern" and the rest fall away; type "sun" for the sun lovers;
 * clear it and they all come back. Picking a card names it.
 */
export function SiftFilterDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string | null>(null);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const count = words.length
    ? PLANTS.filter((plant) => {
        const hay = [plant.title, plant.meta ?? "", ...(plant.tags ?? [])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      }).length
    : PLANTS.length;

  const line: [string, string] = picked
    ? ["picked", picked]
    : words.length
      ? [
          "fernworks nursery",
          `${count} of ${PLANTS.length} · “${query.trim()}”`,
        ]
      : ["fernworks nursery", `all ${PLANTS.length} plants`];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SiftFilter
        label="Find a plant"
        placeholder="Try fern, sun or easy"
        items={PLANTS}
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setPicked(null);
        }}
        onSelect={(plant) => setPicked(plant.title)}
        sound={sound}
        {...values}
      />
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
