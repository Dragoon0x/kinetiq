"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WordHunt, type WordHuntFinder } from "@/registry/ui/word-hunt";

export const tweaks = defineTweaks({
  gridSize: {
    kind: "range",
    label: "Grid",
    default: 14,
    min: 8,
    max: 18,
    step: 1,
  },
  marker: {
    kind: "choice",
    label: "Marker",
    default: "cobalt",
    options: ["cobalt", "amber", "rose", "sage"],
    names: { cobalt: "Cobalt", amber: "Amber", rose: "Rose", sage: "Sage" },
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
});

const WORDS = ["Harbour", "Lantern", "Tide", "Basin", "Kelp", "Gull"];
const COUNT = ["none", "one", "two", "three", "four", "five", "six"];

/**
 * The puzzle corner of an invented weekly, Basinworks Weekly: this week's
 * word search is all things harbour.
 */
export function WordHuntDemo({
  chrome = true,
  // The pen is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [found, setFound] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<{
    word: string;
    by: WordHuntFinder;
  } | null>(null);

  const hunt = (
    <WordHunt
      words={WORDS}
      value={found}
      onValueChange={setFound}
      onFind={(word, by) => setLast({ word, by })}
      label="Basinworks Weekly word search"
      className={chrome ? "h-56 w-full" : "h-52 w-full"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{hunt}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Harbour words, puzzle 41
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks Weekly
        </p>
      </div>
      {hunt}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {found.length === WORDS.length ? (
          <>
            <span className="text-signal">all six found</span> · starting over
          </>
        ) : last && found.includes(last.word) && last.by === "visitor" ? (
          <>
            <span className="text-signal">
              you found {last.word.toLowerCase()}
            </span>{" "}
            · {found.length} of {WORDS.length}
          </>
        ) : (
          <>
            <span className="text-signal">
              found {COUNT[found.length] ?? found.length} of six
            </span>
            {last && found.includes(last.word)
              ? ` · last: ${last.word.toLowerCase()}`
              : " · drag across the letters"}
          </>
        )}
      </p>
    </div>
  );
}
