"use client";

import * as React from "react";

import {
  CarouselCard,
  type CarouselCardItem,
} from "@/registry/ui/carousel-card";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const ITEMS: CarouselCardItem[] = [
  {
    id: "lantern",
    title: "Basin Quay lantern",
    note: "Brass body, ten hours on one cell",
    price: 48,
    meta: "In stock",
  },
  {
    id: "tarp",
    title: "Fernworks tarp",
    note: "Three by four metres, taped seams",
    price: 34,
    meta: "In stock",
  },
  {
    id: "torch",
    title: "Waylight head torch",
    note: "Two beams, one dimmed for close work",
    price: 26,
    meta: "Two left",
  },
  {
    id: "flask",
    title: "Coldbrook flask",
    note: "Holds one litre, keeps it warm all day",
    price: 19,
    meta: "In stock",
  },
];

export function CarouselCardDemo() {
  const [index, setIndex] = React.useState(0);
  const [opened, setOpened] = React.useState<string | null>(null);

  const card = ITEMS[index];

  // Reported from the setter that moved the rail, so the line never lags a
  // card behind the deck.
  const move = (next: number) => {
    setIndex(next);
    setOpened(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ol role="list" className="flex flex-col gap-2">
        <li className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-3">
            Coldbrook Supply · 09:14
          </span>
          <span className="text-sm leading-snug">
            Four things that would suit the depot run.
          </span>
          <CarouselCard
            items={ITEMS}
            index={index}
            onIndexChange={move}
            onCardAction={(item) => setOpened(item.title)}
            label="Four goods from Coldbrook Supply"
          />
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => move(ITEMS.length - 1)}
          disabled={index === ITEMS.length - 1}
          className={chip}
        >
          Last card
        </button>
        <button
          type="button"
          onClick={() => {
            move(0);
          }}
          disabled={index === 0 && opened === null}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {opened ? "Opened · " : `Card ${index + 1} of ${ITEMS.length} · `}
        <span className="text-signal">
          {opened ?? card?.title ?? "no cards"}
        </span>
      </p>
    </div>
  );
}
