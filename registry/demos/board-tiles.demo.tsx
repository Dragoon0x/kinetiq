"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BoardTiles } from "@/registry/ui/board-tiles";

export const tweaks = defineTweaks({
  tileSize: {
    kind: "range",
    label: "Tile size",
    default: 30,
    min: 20,
    max: 44,
    step: 2,
    unit: "px",
  },
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  grid: { kind: "toggle", label: "Grid", default: true },
});

const SENTENCE = "Small hands, big words";

/**
 * Fernworks Toy Co.'s maple letter set: the product card is a board you
 * spell on by moving across it.
 */
export function BoardTilesDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [laid, setLaid] = React.useState<{ n: number; letter: string }>({
    n: 0,
    letter: "",
  });
  const [times, setTimes] = React.useState(0);
  const [clearKey, setClearKey] = React.useState(0);

  const board = (
    <div className="relative w-full">
      <BoardTiles
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        sentence={SENTENCE}
        restText="Spell"
        clearKey={clearKey}
        sound={sound}
        onTile={(letter, n) => setLaid({ n, letter })}
        onSentence={setTimes}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Fernworks · Maple letters
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{board}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {board}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {times > 0 ? (
            <>
              <span className="text-signal">sentence spelled</span> ·{" "}
              {times === 1 ? "once" : `${times} times`}
            </>
          ) : laid.n > 0 ? (
            <>
              <span className="text-signal">
                {laid.n} {laid.n === 1 ? "tile" : "tiles"} laid
              </span>{" "}
              · last {laid.letter}
            </>
          ) : (
            <>
              <span className="text-signal">resting</span> · move across the
              board
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setClearKey((k) => k + 1)}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
