"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ViewMorph,
  type ViewMorphColumn,
  type ViewMorphEntry,
  type ViewMorphView,
} from "@/registry/ui/view-morph";

export const tweaks = defineTweaks({
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  items: {
    kind: "range",
    label: "Items",
    default: 6,
    min: 4,
    max: 9,
    step: 1,
  },
  views: {
    kind: "choice",
    label: "Views",
    default: "3",
    options: ["2", "3"],
    names: { "2": "Grid, list", "3": "Grid, list, board" },
  },
});

const COLUMNS: ViewMorphColumn[] = [
  { id: "planned", label: "Planned" },
  { id: "surveying", label: "Surveying" },
  { id: "filed", label: "Filed" },
];

const SITES: ViewMorphEntry[] = [
  {
    id: "harbour-wall",
    title: "Harbour wall",
    meta: "32 photos · Mon",
    status: "filed",
    tone: "accent",
  },
  {
    id: "north-weir",
    title: "North weir",
    meta: "18 photos · Tue",
    status: "surveying",
    tone: "signal",
  },
  {
    id: "salt-marsh",
    title: "Salt marsh",
    meta: "44 photos · Tue",
    status: "planned",
    tone: "success",
  },
  {
    id: "lock-gates",
    title: "Lock gates",
    meta: "9 photos · Wed",
    status: "surveying",
    tone: "warn",
  },
  {
    id: "tidal-pool",
    title: "Tidal pool",
    meta: "27 photos · Wed",
    status: "filed",
    tone: "accent",
  },
  {
    id: "pump-house",
    title: "Pump house",
    meta: "12 photos · Thu",
    status: "planned",
    tone: "danger",
  },
  {
    id: "reed-beds",
    title: "Reed beds",
    meta: "51 photos · Thu",
    status: "filed",
    tone: "success",
  },
  {
    id: "sluice-4",
    title: "Sluice 4",
    meta: "6 photos · Fri",
    status: "surveying",
    tone: "ink",
  },
  {
    id: "estuary",
    title: "Estuary mouth",
    meta: "38 photos · Fri",
    status: "planned",
    tone: "signal",
  },
];

/**
 * Basinworks field sites: this week's survey sites, seen as tiles, as a
 * list, or as a board by where each survey has got to.
 */
export function ViewMorphDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [view, setView] = React.useState<ViewMorphView>("grid");
  const [opened, setOpened] = React.useState<string | null>(null);
  const items = values.items ?? tweaks.items.default;
  const shown = SITES.slice(0, items);
  const counts = COLUMNS.map(
    (c) => `${shown.filter((s) => s.status === c.id).length} ${c.label}`,
  ).join(" · ");
  const site = SITES.find((s) => s.id === opened);
  // With two views on offer, a board falls back to the grid.
  const showing = values.views === "2" && view === "board" ? "grid" : view;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <ViewMorph
        label="Basinworks field sites"
        collection={SITES}
        columns={COLUMNS}
        value={view}
        onValueChange={(next) => {
          setView(next);
          setOpened(null);
        }}
        onOpen={setOpened}
        maxHeight={chrome ? 300 : 176}
        sound={sound}
        {...values}
        items={items}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {site ? (
            <>
              <span className="text-signal">opened {site.title}</span> ·{" "}
              {site.meta}
            </>
          ) : (
            <>
              <span className="text-signal">{showing}</span> · {shown.length} of{" "}
              {SITES.length} sites · {counts}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
