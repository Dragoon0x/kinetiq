"use client";

import * as React from "react";

import { SearchInline, type SearchMessage } from "@/registry/ui/search-inline";

const msg = (
  id: string,
  author: string,
  time: string,
  text: string,
  own = false,
): SearchMessage => ({ id, author, time, text, own });

const THREAD: SearchMessage[] = [
  msg("1", "Ines Moreau", "14:38", "Coldbrook depot closes Thursday at noon."),
  msg("2", "Marta Ferreira", "14:41", "Do the pallets go out before that?"),
  msg("3", "Ines Moreau", "14:44", "Two pallets, both labelled, on dock two."),
  msg("4", "Rui Baptista", "14:52", "Dock two is short a loader until nine."),
  msg("5", "Marta Ferreira", "14:55", "Then take dock three.", true),
  msg("6", "Rui Baptista", "15:02", "Dock three is free from nine, yes."),
  msg("7", "Ines Moreau", "15:11", "Waylight Pay reference is 4471-CB."),
  msg(
    "8",
    "Marta Ferreira",
    "15:18",
    "On the sheet. Pallets are stacked.",
    true,
  ),
  msg(
    "9",
    "Rui Baptista",
    "15:24",
    "Loader is booked at the dock until half past.",
  ),
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function SearchInlineDemo() {
  const [query, setQuery] = React.useState("dock");
  const [match, setMatch] = React.useState({ at: 0, total: 0 });

  const onMatchChange = React.useCallback(
    (at: number, total: number) => setMatch({ at, total }),
    [],
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SearchInline
        threadLabel="Coldbrook yard"
        messages={THREAD}
        query={query}
        onQueryChange={setQuery}
        onMatchChange={onMatchChange}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQuery("pallets")}
          disabled={query === "pallets"}
          className={chip}
        >
          Search for pallets
        </button>
        <button
          type="button"
          onClick={() => setQuery("")}
          disabled={query === ""}
          className={chip}
        >
          Clear the search
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{query === "" ? "no term" : query}</span>
        {match.total === 0
          ? " · no matches"
          : ` · match ${match.at} of ${match.total}`}
      </p>
    </div>
  );
}
