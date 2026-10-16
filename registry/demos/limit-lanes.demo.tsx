"use client";

import * as React from "react";

import { Loader, RotateCcw, ShieldCheck } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLimitCards,
  defaultLimitColumns,
  LimitLanes,
  type LimitCard,
  type LimitColumn,
} from "@/registry/ui/limit-lanes";

export const tweaks = defineTweaks({
  gaugeStyle: {
    kind: "choice",
    label: "Gauge",
    default: "segments",
    options: ["segments", "bar", "ring"],
    names: { segments: "Pills", bar: "Bar", ring: "Ring" },
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "edge",
    options: ["plain", "edge", "raised"],
    names: { plain: "Plain", edge: "Edge", raised: "Raised" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const LOAD_MS = 1400;

type Note =
  | { kind: "board" }
  | { kind: "blocked"; card: string; column: string; home: string }
  | { kind: "moved"; card: string; column: string }
  | { kind: "limit"; column: string; limit: number }
  | { kind: "loading" }
  | { kind: "enforce"; on: boolean };

const titleOf = (id: string) =>
  defaultLimitColumns.find((c) => c.id === id)?.title ?? id;

/**
 * Fernworks' delivery team mid-sprint: Building and Review are at their
 * limits, so a card dragged into either comes straight home.
 */
export function LimitLanesDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [cards, setCards] = React.useState<LimitCard[]>(defaultLimitCards);
  const [columns, setColumns] =
    React.useState<LimitColumn[]>(defaultLimitColumns);
  const [enforce, setEnforce] = React.useState(true);
  const [note, setNote] = React.useState<Note>({ kind: "board" });
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const surface = (
    <LimitLanes
      key={run}
      columns={columns}
      defaultCards={defaultLimitCards}
      enforce={enforce}
      onCardsChange={setCards}
      onMove={(move) => {
        const card = move.cards.find((c) => c.id === move.cardId);
        setNote({
          kind: "moved",
          card: card?.key ?? move.cardId,
          column: titleOf(move.to.columnId),
        });
      }}
      onBlockedDrop={(blocked) => {
        const card = cards.find((c) => c.id === blocked.cardId);
        setNote({
          kind: "blocked",
          card: card?.key ?? blocked.cardId,
          column: titleOf(blocked.columnId),
          home: titleOf(card?.columnId ?? ""),
        });
      }}
      onLimitChange={(columnId, limit) => {
        setColumns((cols) =>
          cols.map((c) => (c.id === columnId ? { ...c, limit } : c)),
        );
        setNote({ kind: "limit", column: titleOf(columnId), limit });
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const tally = columns
    .filter((c) => c.limit !== null && c.limit !== undefined)
    .map(
      (c) =>
        `${c.title} ${cards.filter((card) => card.columnId === c.id).length}/${c.limit}`,
    )
    .join(" · ");

  const line = (() => {
    switch (note.kind) {
      case "blocked":
        return (
          <>
            <span className="text-signal">blocked</span> · {note.column} full ·{" "}
            {note.card} back to {note.home}
          </>
        );
      case "moved":
        return (
          <>
            <span className="text-signal">moved {note.card}</span> →{" "}
            {note.column} · {tally}
          </>
        );
      case "limit":
        return (
          <>
            <span className="text-signal">
              {note.column} limit {note.limit}
            </span>{" "}
            · {tally}
          </>
        );
      case "loading":
        return (
          <>
            <span className="text-signal">loading shipping</span> · no drops
            there yet
          </>
        );
      case "enforce":
        return (
          <>
            <span className="text-signal">
              limits {note.on ? "enforced" : "advisory"}
            </span>{" "}
            · {note.on ? "full columns refuse" : "overruns show in red"}
          </>
        );
      default:
        return (
          <>
            <span className="text-signal">{cards.length} cards</span> · {tally}
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
            window.clearTimeout(timer.current);
            setColumns((cols) =>
              cols.map((c) =>
                c.id === "shipping" ? { ...c, status: "loading" } : c,
              ),
            );
            setNote({ kind: "loading" });
            timer.current = window.setTimeout(() => {
              setColumns((cols) =>
                cols.map((c) =>
                  c.id === "shipping" ? { ...c, status: "ready" } : c,
                ),
              );
              setNote({ kind: "board" });
            }, LOAD_MS);
          }}
          className={button}
        >
          <Loader aria-hidden className="size-3.5" />
          Load Shipping
        </button>
        <button
          type="button"
          aria-pressed={enforce}
          onClick={() => {
            setEnforce((on) => !on);
            setNote({ kind: "enforce", on: !enforce });
          }}
          className={cn(
            button,
            !enforce && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          <ShieldCheck aria-hidden className="size-3.5" />
          Enforce limits
        </button>
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setCards(defaultLimitCards);
            setColumns(defaultLimitColumns);
            setEnforce(true);
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
