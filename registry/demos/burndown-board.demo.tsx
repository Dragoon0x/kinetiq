"use client";

import * as React from "react";

import { Plus, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BurndownBoard,
  defaultBurndownCards,
  type BurndownCard,
  type BurndownStats,
} from "@/registry/ui/burndown-board";

export const tweaks = defineTweaks({
  chartHeight: {
    kind: "range",
    label: "Chart",
    default: 136,
    min: 96,
    max: 192,
    step: 8,
    unit: "px",
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "raised",
    options: ["raised", "flat", "outline"],
    names: { raised: "Raised", flat: "Flat", outline: "Outline" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "moss", "ember", "mono"],
    names: { cobalt: "Cobalt", moss: "Moss", ember: "Ember", mono: "Mono" },
  },
});

/** Day 5 of Basinworks Sprint 14 (the board's default `now`). */
const TODAY = 4;
const EXTRA = [
  { title: "Tide alarm snooze", points: 2 },
  { title: "Harbour webcam embed", points: 3 },
  { title: "Offline tide cache", points: 5 },
];

const pointsLeft = (cards: BurndownCard[]) =>
  cards
    .filter((c) => c.column !== "done")
    .reduce((sum, c) => sum + c.points, 0);

/**
 * Basinworks Sprint 14, "Tide tables", on its fifth day. Export tide CSV
 * waits in Review: drag it to Done and its three points drop into the line.
 * Add scope appends a card added today, raising a marked step.
 */
export function BurndownBoardDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [cards, setCards] =
    React.useState<BurndownCard[]>(defaultBurndownCards);
  const [stats, setStats] = React.useState<BurndownStats | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const [added, setAdded] = React.useState(0);

  const addScope = () => {
    const extra = EXTRA[added % EXTRA.length] ?? EXTRA[0];
    if (!extra) return;
    const id = `BSN-${311 + added}`;
    setAdded((n) => n + 1);
    setCards((list) => [
      {
        id,
        title: extra.title,
        column: "todo",
        points: extra.points,
        addedOn: TODAY,
      },
      ...list,
    ]);
    setNote(`+${extra.points} pts scope · ${id}`);
  };

  const board = (
    <BurndownBoard
      key={round}
      cards={cards}
      onCardsChange={setCards}
      onAddCard={addScope}
      onMove={(move) => {
        if (move.to === "done") setNote(`${move.cardId} done`);
        else if (move.from === "done") setNote(`${move.cardId} reopened`);
        else setNote(null);
      }}
      onSprintChange={setStats}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const left = stats?.remaining ?? pointsLeft(cards);
  const ideal = stats?.ideal ?? 18;
  const gap = Math.round((left - ideal) * 10) / 10;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {board}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Add scope", icon: Plus, run: addScope },
          {
            label: "Reset",
            icon: RotateCcw,
            run: () => {
              setCards(defaultBurndownCards);
              setAdded(0);
              setStats(null);
              setNote(null);
              setRound((r) => r + 1);
            },
          },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.run}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <b.icon aria-hidden className="size-3.5" />
            {b.label}
          </button>
        ))}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? <span className="text-signal">{note} · </span> : null}
        {left} pts left · day {TODAY + 1} of 10 ·{" "}
        {Math.abs(gap) < 0.5
          ? "on track"
          : gap > 0
            ? `behind by ${gap}`
            : `ahead by ${-gap}`}
      </p>
    </div>
  );
}
