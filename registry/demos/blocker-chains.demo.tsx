"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BlockerChains,
  defaultBlockerCards,
  summarizeBlockers,
  type BlockerCard,
} from "@/registry/ui/blocker-chains";

export const tweaks = defineTweaks({
  chainStyle: {
    kind: "choice",
    label: "Chain",
    default: "links",
    options: ["links", "thread", "beads"],
    names: { links: "Links", thread: "Thread", beads: "Beads" },
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "raised",
    options: ["raised", "flat", "outline"],
    names: { raised: "Raised", flat: "Flat", outline: "Outline" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 320)",
      "oklch(from var(--accent-bright) l c 200)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
      "oklch(from var(--accent-bright) l c 200)": "Teal",
    },
  },
});

/**
 * The Fieldline 4.2 release board. Schema migration 31 sits in Review and
 * holds up two cards; drag it to Done and both chains snap loose. Two backlog
 * cards wait on each other, so the board flags a loop.
 */
export function BlockerChainsDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [cards, setCards] = React.useState<BlockerCard[]>(defaultBlockerCards);
  const [all, setAll] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const finished = React.useRef({ id: "", freed: 0 });

  const board = (
    <BlockerChains
      key={round}
      onCardsChange={(next) => setCards(next)}
      onShowAllChange={setAll}
      onMove={(move) => {
        // Unlinks a finish causes are reported right after its move.
        finished.current = { id: move.cardId, freed: 0 };
        setNote(
          move.to === "done"
            ? `${move.cardId} done`
            : `${move.cardId} → ${move.to === "doing" ? "in progress" : move.to === "next" ? "up next" : move.to}`,
        );
      }}
      onUnlink={(blocked, blocker, reason) => {
        if (reason === "done" && finished.current.id === blocker) {
          finished.current.freed += 1;
          const n = finished.current.freed;
          setNote(`${blocker} done · ${n} unblocked`);
        } else setNote(`${blocked} no longer waits on ${blocker}`);
      }}
      onLink={(blocked, blocker, info) =>
        setNote(
          `${blocked} waits on ${blocker}${info.circular ? " · loop" : ""}`,
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const { blocked, loops } = summarizeBlockers(cards);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {board}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCards(defaultBlockerCards);
            setAll(false);
            setNote(null);
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
        {note ? <span className="text-signal">{note} · </span> : null}
        {blocked} blocked · {loops === 1 ? "1 loop" : `${loops} loops`} · chains{" "}
        {all ? "all" : "on focus"}
      </p>
    </div>
  );
}
