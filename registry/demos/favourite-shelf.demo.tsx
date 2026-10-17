"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultShelfFavourites,
  defaultShelfItems,
  FavouriteShelf,
} from "@/registry/ui/favourite-shelf";

export const tweaks = defineTweaks({
  shelfStyle: {
    kind: "choice",
    label: "Shelf",
    default: "tray",
    options: ["tray", "ruled", "card"],
    names: { tray: "Tray", ruled: "Ruled", card: "Card" },
  },
  rowHeight: {
    kind: "range",
    label: "Rows",
    default: 32,
    min: 28,
    max: 40,
    step: 2,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/**
 * The Basinworks workspace with Roadmap and the Q4 launch already on the
 * shelf. Drag Weekly notes up between them, or focus a row and press Alt F.
 */
export function FavouriteShelfDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The sidebar is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [favourites, setFavourites] = React.useState(defaultShelfFavourites);
  const [current, setCurrent] = React.useState("roadmap");
  const [round, setRound] = React.useState(0);

  const surface = (
    <FavouriteShelf
      key={round}
      favourites={favourites}
      onFavouritesChange={setFavourites}
      current={current}
      onNavigate={setCurrent}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-80">{surface}</div>;

  const names = favourites
    .map((id) => defaultShelfItems.find((it) => it.id === id)?.label)
    .filter(Boolean)
    .join(", ");
  const page = defaultShelfItems.find((it) => it.id === current)?.label;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setFavourites(defaultShelfFavourites);
            setCurrent("roadmap");
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`shelf ${favourites.length} of 5`}</span>
        {` · ${names || "empty"} · on ${page ?? current}`}
      </p>
    </div>
  );
}
