"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSwimCards,
  defaultSwimColumns,
  defaultSwimPeople,
  SwimBoard,
  type SwimCard,
  type SwimMove,
} from "@/registry/ui/swim-board";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 6,
    min: 0,
    max: 12,
    step: 1,
    unit: "°",
  },
  limit: {
    kind: "choice",
    label: "WIP limit",
    default: "warn",
    options: ["warn", "block", "off"],
    names: { warn: "Warn", block: "Block", off: "Off" },
  },
  lanes: {
    kind: "choice",
    label: "Lanes",
    default: "priority",
    options: ["priority", "owner", "none"],
    names: { priority: "Priority", owner: "Owner", none: "None" },
  },
});

const columnTitle = (id: string) =>
  defaultSwimColumns.find((c) => c.id === id)?.title.toLowerCase() ?? id;

/**
 * Fernworks' field app team mid-sprint: twelve cards, In progress limited to
 * three and Review to two. Carry a card across and the board makes room.
 */
export function SwimBoardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [cards, setCards] = React.useState<SwimCard[]>(defaultSwimCards);
  const [note, setNote] = React.useState<string | null>(null);
  const lanes = values.lanes ?? "priority";

  const describe = (move: SwimMove, next: SwimCard[]) => {
    const card = next.find((c) => c.id === move.cardId);
    if (!card) return;
    const cell = next.filter(
      (c) =>
        c.column === move.to.column &&
        (lanes === "priority"
          ? c.priority === card.priority
          : lanes === "owner"
            ? c.owner === card.owner
            : true),
    ).length;
    const col = defaultSwimColumns.find((c) => c.id === move.to.column);
    const inCol = next.filter((c) => c.column === move.to.column).length;
    const lane =
      lanes === "priority"
        ? card.priority
        : lanes === "owner"
          ? (defaultSwimPeople
              .find((p) => p.id === card.owner)
              ?.name.toLowerCase() ?? card.owner)
          : null;
    const over =
      values.limit !== "off" && col?.limit !== undefined && inCol > col.limit
        ? ` · over its limit, ${inCol} of ${col.limit}`
        : "";
    setNote(
      `moved ${card.title.toLowerCase()}|to ${columnTitle(move.to.column)}${lane ? ` · ${lane}` : ""} · ${move.to.index + 1} of ${cell}${over}`,
    );
  };

  const board = (
    <SwimBoard
      cards={cards}
      onCardsChange={(next, move) => {
        setCards(next);
        describe(move, next);
      }}
      onCardOpen={(id) => {
        const card = cards.find((c) => c.id === id);
        if (card) setNote(`opened ${card.title.toLowerCase()}|card details`);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const [head, tail] = note ? note.split("|") : [null, null];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {board}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {head ? (
            <>
              <span className="text-signal">{head}</span> {tail}
            </>
          ) : (
            <>
              <span className="text-signal">sprint 14</span> · drag a card, or
              focus one and press space to pick it up
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setCards(defaultSwimCards);
            setNote(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
