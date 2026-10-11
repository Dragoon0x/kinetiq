"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTableSpreadCards,
  TableSpread,
  tableSpreadCardName,
} from "@/registry/ui/table-spread";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 0.4,
    min: 0.2,
    max: 0.6,
    step: 0.05,
  },
  turnSpeed: {
    kind: "range",
    label: "Turn speed",
    default: 22,
    min: 8,
    max: 40,
    step: 2,
    unit: "/s",
  },
  felt: {
    kind: "choice",
    label: "Felt",
    default: "green",
    options: ["green", "navy", "claret", "slate"],
    names: { green: "Green", navy: "Navy", claret: "Claret", slate: "Slate" },
  },
});

/**
 * The Fernworks card room: a deck on the felt, waiting to be swept out, and
 * one card to pick.
 */
export function TableSpreadDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [spread, setSpread] = React.useState(false);
  const [faceUp, setFaceUp] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);
  const card = defaultTableSpreadCards.find((c) => c.id === picked);
  const count = defaultTableSpreadCards.length;

  const table = (
    <TableSpread
      label="Fernworks card room table"
      spread={spread}
      onSpreadChange={setSpread}
      faceUp={faceUp}
      onFaceUpChange={setFaceUp}
      picked={picked}
      onPickedChange={setPicked}
      intro
      className={cn("w-full", chrome ? "h-56" : "h-52")}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{table}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks card room · pick a card
      </p>
      {table}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {!spread ? (
            <>
              <span className="text-signal">deck squared</span> · drag it across
              the felt
            </>
          ) : card ? (
            <>
              <span className="text-signal">picked</span> ·{" "}
              {tableSpreadCardName(card)}
            </>
          ) : (
            <>
              <span className="text-signal">
                spread · {count} cards {faceUp ? "face up" : "face down"}
              </span>{" "}
              · flick the first card to turn
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setSpread((s) => !s)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {spread ? "Gather" : "Spread"}
        </button>
      </div>
    </div>
  );
}
