"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DichroicWall } from "@/registry/ui/dichroic-wall";

export const tweaks = defineTweaks({
  tiles: {
    kind: "range",
    label: "Tiles",
    default: 5,
    min: 3,
    max: 9,
    step: 1,
  },
  shift: {
    kind: "range",
    label: "Shift",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 3,
    min: 0,
    max: 10,
    step: 1,
    unit: "px",
  },
  film: {
    kind: "choice",
    label: "Film",
    default: "prism",
    options: ["prism", "lagoon", "orchid", "frost"],
    names: {
      prism: "Prism",
      lagoon: "Lagoon",
      orchid: "Orchid",
      frost: "Frost",
    },
  },
});

/**
 * Fernworks, a glass studio: the hero of its collection page is a wall of the
 * studio's own coated tiles, which turn colour as the visitor moves past.
 */
export function DichroicWallDemo({
  chrome = true,
  // The glass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [flashes, setFlashes] = React.useState(0);
  const rows = values.tiles ?? tweaks.tiles.default;
  const film = values.film ?? tweaks.film.default;

  const wall = (
    <DichroicWall
      label="Fernworks glass wall"
      onFlash={() => setFlashes((n) => n + 1)}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-54 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-56 rounded-3 border border-hairline bg-background/85 px-3.5 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks · glass
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, bent on purpose
          </p>
          {chrome ? (
            <a
              href="#collection"
              onClick={(event) => event.preventDefault()}
              className="mt-2 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              See the collection
            </a>
          ) : null}
        </div>
      </div>
    </DichroicWall>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {wall}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {flashes === 0
            ? "move across the glass"
            : `${flashes} ${flashes === 1 ? "flash" : "flashes"}`}
        </span>{" "}
        · {film} film · {rows} rows
      </p>
    </div>
  );
}
