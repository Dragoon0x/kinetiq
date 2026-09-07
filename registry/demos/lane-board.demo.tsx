"use client";

import * as React from "react";

import { LaneBoard, type BoardLane } from "@/registry/ui/lane-board";

const SPRINT: BoardLane[] = [
  {
    id: "todo",
    title: "Todo",
    cards: [
      { id: "seal", title: "Seal the intake port", tag: "M" },
      { id: "gauge", title: "Recalibrate gauges", tag: "S" },
      { id: "vent", title: "Vent trim", tag: "S" },
    ],
  },
  {
    id: "doing",
    title: "Doing",
    cards: [
      { id: "loader", title: "Refit the loader arm", tag: "L" },
      { id: "belt", title: "Belt tension pass", tag: "M" },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: "coupler", title: "Coupler swap", tag: "S" },
      { id: "audit", title: "Line audit", tag: "M" },
    ],
  },
];

const CARDS = new Map(
  SPRINT.flatMap((lane) => lane.cards.map((card) => [card.id, card.title])),
);
const LANE_NAMES = new Map(SPRINT.map((lane) => [lane.id, lane.title]));

export function LaneBoardDemo() {
  const [move, setMove] = React.useState<{
    card: string;
    lane: string;
    index: number;
  } | null>(null);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <LaneBoard
        label="Fernworks sprint"
        lanes={SPRINT}
        onMove={(cardId, toLane, index) =>
          setMove({
            card: CARDS.get(cardId) ?? cardId,
            lane: LANE_NAMES.get(toLane) ?? toLane,
            index,
          })
        }
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {move ? (
          <>
            {move.card} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {move.lane} {move.index + 1}
            </span>
          </>
        ) : (
          "Drag a card, or open one for its moves"
        )}
      </p>
    </div>
  );
}
