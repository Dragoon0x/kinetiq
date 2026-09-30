"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrosswordGuess } from "@/registry/ui/crossword-guess";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  guesses: {
    kind: "range",
    label: "Wrong guesses",
    default: 1,
    min: 0,
    max: 3,
    step: 1,
  },
  grid: {
    kind: "choice",
    label: "Grid",
    default: "news",
    options: ["news", "pastel", "ink"],
    names: { news: "Newsprint", pastel: "Pastel", ink: "Ink" },
  },
});

const PHRASES = [
  "Fetching the grid",
  "Setting the clues",
  "Sharpening pencils",
];

/**
 * Fieldline Daily loading today's crossword: the status line is solved into
 * the grid while the puzzle is fetched, and inks "Puzzle ready" when it is.
 */
export function CrosswordGuessDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(true);
  const [index, setIndex] = React.useState(0);

  const puzzle = (
    <div className="flex w-full flex-col gap-3">
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Daily · crossword No. 412
      </p>
      <CrosswordGuess
        phrases={PHRASES}
        active={active}
        doneText="Puzzle ready"
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{puzzle}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {puzzle}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {active ? (
            <>
              <span className="text-signal">solving</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · tap a wrong guess
              to rub it out
            </>
          ) : (
            <>
              <span className="text-signal">puzzle ready</span> · grid inked
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setActive((on) => !on)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {active ? "Finish" : "Solve again"}
        </button>
      </div>
    </div>
  );
}
