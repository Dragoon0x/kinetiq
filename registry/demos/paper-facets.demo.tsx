"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PaperFacets, type PaperFacetsLight } from "@/registry/ui/paper-facets";

export const tweaks = defineTweaks({
  facets: {
    kind: "range",
    label: "Facets",
    default: 72,
    min: 20,
    max: 120,
    step: 4,
  },
  relief: {
    kind: "range",
    label: "Relief",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "white",
    options: ["white", "kraft", "ink"],
    names: { white: "White", kraft: "Kraft", ink: "Ink" },
  },
});

const STOCK_NAMES = { white: "white card", kraft: "kraft", ink: "ink card" };

/** A ninth of the sheet, in words: coarse, so the status speaks rarely. */
const ninth = ({ x, y }: PaperFacetsLight) => {
  const col = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "";
  const row = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "";
  return [row, col].filter(Boolean).join(" ") || "centre";
};

/**
 * Fieldline Press's autumn samples page: the hero sits on the card stock
 * itself, folded, and the visitor's pointer is the lamp over it.
 */
export function PaperFacetsDemo({
  chrome = true,
  // The card is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seed, setSeed] = React.useState(1);
  const [place, setPlace] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState(false);
  const stock = values.paper ?? tweaks.paper.default;
  const count = values.facets ?? tweaks.facets.default;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <PaperFacets
        seed={seed}
        onLightChange={(light) => {
          setFresh(false);
          setPlace(light ? ninth(light) : null);
        }}
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        {...values}
      >
        <div className="flex h-full flex-col justify-end gap-1 p-5 sm:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase opacity-70">
            Fieldline Press
          </p>
          <p className="text-2xl leading-tight font-medium">Folded by hand</p>
          <p className="max-w-72 text-sm text-balance opacity-80">
            Autumn card samples, cut and scored in small runs
          </p>
        </div>
      </PaperFacets>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={() => {
              setSeed((s) => s + 1);
              setFresh(true);
            }}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Refold
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">
              {fresh
                ? "refolded"
                : place
                  ? `light from ${place}`
                  : "light at rest"}
            </span>{" "}
            · {STOCK_NAMES[stock]} · {count} facets
          </p>
        </>
      ) : null}
    </div>
  );
}
