"use client";

import * as React from "react";

import { CalendarPlus, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPatinaCards,
  defaultPatinaColumns,
  defaultPatinaNow,
  PatinaBoard,
  type PatinaCard,
} from "@/registry/ui/patina-board";

export const tweaks = defineTweaks({
  patinaRate: {
    kind: "range",
    label: "Rate",
    default: 0.08,
    min: 0.02,
    max: 0.2,
    step: 0.02,
    unit: "/day",
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "plain",
    options: ["plain", "raised", "outline"],
    names: { plain: "Plain", raised: "Raised", outline: "Outline" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "copper",
    options: ["copper", "rust", "dust", "ink"],
    names: { copper: "Copper", rust: "Rust", dust: "Dust", ink: "Ink" },
  },
});

const DAY = 86_400_000;
const STALE = 7;

type Note =
  | { kind: "board" }
  | { kind: "moved"; card: string; column: string }
  | { kind: "renamed"; card: string }
  | { kind: "nudged"; owner: string }
  | { kind: "filter"; on: boolean }
  | { kind: "week" };

const titleOf = (id: string) =>
  defaultPatinaColumns.find((c) => c.id === id)?.title ?? id;

/**
 * Basinworks' facilities requests on a Friday morning: some arrived this
 * week, some have sat for three. "A week passes" moves the clock on, and every
 * card that nobody touched weathers.
 */
export function PatinaBoardDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [now, setNow] = React.useState(defaultPatinaNow);
  const [cards, setCards] = React.useState<PatinaCard[]>(defaultPatinaCards);
  const [note, setNote] = React.useState<Note>({ kind: "board" });

  const surface = (
    <PatinaBoard
      key={run}
      now={now}
      staleAfter={STALE}
      onCardsChange={setCards}
      onMove={(move) => {
        const card = move.cards.find((c) => c.id === move.cardId);
        setNote({
          kind: "moved",
          card: card?.key ?? move.cardId,
          column: titleOf(move.to.columnId),
        });
      }}
      onEdit={(cardId) =>
        setNote({
          kind: "renamed",
          card: cards.find((c) => c.id === cardId)?.key ?? cardId,
        })
      }
      onNudgeOwner={(card) =>
        setNote({ kind: "nudged", owner: card.owner ?? "the owner" })
      }
      onFilterStale={(on) => setNote({ kind: "filter", on })}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const stale = cards.filter(
    (c) => Math.floor((now - c.still) / DAY) >= STALE,
  ).length;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const line = (() => {
    switch (note.kind) {
      case "moved":
        return (
          <>
            <span className="text-signal">polished {note.card}</span> · moved to{" "}
            {note.column} · {stale} stale
          </>
        );
      case "renamed":
        return (
          <>
            <span className="text-signal">polished {note.card}</span> · renamed
            · {stale} stale
          </>
        );
      case "nudged":
        return (
          <>
            <span className="text-signal">nudged {note.owner}</span> · patina
            stays until it moves
          </>
        );
      case "filter":
        return (
          <>
            <span className="text-signal">
              {note.on ? "stale first" : "board order"}
            </span>{" "}
            · {stale} stale
          </>
        );
      case "week":
        return (
          <>
            <span className="text-signal">a week later</span> · {cards.length}{" "}
            requests · {stale} stale
          </>
        );
      default:
        return (
          <>
            <span className="text-signal">{cards.length} requests</span> ·{" "}
            {stale} stale
          </>
        );
    }
  })();

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setNow((t) => t + 7 * DAY);
            setNote({ kind: "week" });
          }}
          className={button}
        >
          <CalendarPlus aria-hidden className="size-3.5" />A week passes
        </button>
        <button
          type="button"
          onClick={() => {
            setNow(defaultPatinaNow);
            setCards(defaultPatinaCards);
            setNote({ kind: "board" });
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
