"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRatingDistribution,
  defaultReviews,
  RatingsSummary,
  type RatingsSort,
} from "@/registry/ui/ratings-summary";

export const tweaks = defineTweaks({
  bars: {
    kind: "choice",
    label: "Bars",
    default: "rows",
    options: ["rows", "columns"],
    names: { rows: "Rows", columns: "Columns" },
  },
  filter: {
    kind: "choice",
    label: "Filter",
    default: "single",
    options: ["single", "multi"],
    names: { single: "One star", multi: "Several" },
  },
  photos: {
    kind: "choice",
    label: "Photos",
    default: "strip",
    options: ["strip", "grid", "off"],
    names: { strip: "Strip", grid: "Grid", off: "Off" },
  },
});

const TOTAL = defaultRatingDistribution.reduce((s, n) => s + n, 0);
const AVERAGE = (
  defaultRatingDistribution.reduce((s, n, i) => s + n * (i + 1), 0) / TOTAL
).toFixed(1);
const SORT_WORD: Record<RatingsSort, string> = {
  helpful: "most helpful",
  newest: "newest",
  highest: "highest rated",
  lowest: "lowest rated",
};
const PHOTOS = defaultReviews.flatMap((r) =>
  (r.photos ?? []).map((p) => ({ id: p.id, author: r.author })),
);
const thousands = (n: number) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Waylight's Ridge trail runner: 1,284 ratings averaging 4.5, fourteen
 * written reviews and nine photos from the people who wrote them.
 */
export function RatingsSummaryDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stars, setStars] = React.useState<number[]>([]);
  const [sort, setSort] = React.useState<RatingsSort>("helpful");
  const [event, setEvent] = React.useState<string | null>(null);

  const summary = (
    <RatingsSummary
      productName="Waylight Ridge Trail Runner"
      stars={stars}
      onStarsChange={(next) => {
        setStars(next);
        setEvent(null);
      }}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        setEvent(null);
      }}
      onVote={(id, voted) => {
        const r = defaultReviews.find((x) => x.id === id);
        setEvent(
          `${voted ? "voted" : "unvoted"} ${r ? `“${r.title.toLowerCase()}”` : "review"} helpful`,
        );
      }}
      onPhotoOpen={(photoId) => {
        const at = PHOTOS.findIndex((p) => p.id === photoId);
        setEvent(
          `photo ${at + 1} of ${PHOTOS.length} · ${PHOTOS[at]?.author.toLowerCase() ?? ""}`,
        );
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{summary}</div>;

  const showing = defaultReviews.filter(
    (r) => stars.length === 0 || stars.includes(r.rating),
  ).length;
  const which = [...stars].sort((a, b) => b - a);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {summary}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (which.length
              ? `showing ${which.map((s) => `${s}★`).join(" and ")} · ${showing} ${showing === 1 ? "review" : "reviews"}`
              : `${AVERAGE} average · ${thousands(TOTAL)} ratings · all reviews`)}
        </span>{" "}
        · sorted by {SORT_WORD[sort]}
      </p>
    </div>
  );
}
