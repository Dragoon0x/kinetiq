"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BrushSelect, type BrushSelectItem } from "@/registry/ui/brush-select";

export const tweaks = defineTweaks({
  mode: {
    kind: "choice",
    label: "Brush",
    default: "set",
    options: ["set", "toggle"],
    names: { set: "Set", toggle: "Toggle" },
  },
  layout: {
    kind: "choice",
    label: "Layout",
    default: "wrap",
    options: ["wrap", "grid"],
    names: { wrap: "Wrap", grid: "Grid" },
  },
  check: { kind: "toggle", label: "Check", default: true },
});

const TOPICS: BrushSelectItem[] = [
  { id: "markets", label: "Markets" },
  { id: "climate", label: "Climate" },
  { id: "design", label: "Design" },
  { id: "science", label: "Science" },
  { id: "policy", label: "Policy" },
  { id: "health", label: "Health" },
  { id: "cities", label: "Cities" },
  { id: "food", label: "Food" },
  { id: "film", label: "Film" },
  { id: "music", label: "Music" },
  { id: "sport", label: "Sport" },
  { id: "books", label: "Books" },
];

/**
 * The Fieldline weekly digest's topic picker: tap a topic, or press on one
 * and paint across the rest to pick (or drop) a run of them in one stroke.
 */
export function BrushSelectDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [topics, setTopics] = React.useState<string[]>([
    "climate",
    "design",
    "cities",
  ]);
  const [last, setLast] = React.useState<{ added: number; dropped: number }>();

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <p className="min-w-0 truncate text-xs text-ink-3">
            Fieldline <span aria-hidden>·</span>{" "}
            <span className="text-foreground">Topics for your digest</span>
          </p>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
            {topics.length} / {TOPICS.length}
          </span>
        </div>
        <BrushSelect
          label="Digest topics"
          items={TOPICS}
          value={topics}
          onValueChange={(next) => {
            setLast({
              added: next.filter((id) => !topics.includes(id)).length,
              dropped: topics.filter((id) => !next.includes(id)).length,
            });
            setTopics(next);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {topics.length} of {TOPICS.length} topics
          </span>{" "}
          ·{" "}
          {last
            ? `last change ${[
                last.added ? `+${last.added}` : "",
                last.dropped ? `−${last.dropped}` : "",
              ]
                .filter(Boolean)
                .join(" ")}`
            : "tap a topic or paint across"}
        </p>
      ) : null}
    </div>
  );
}
