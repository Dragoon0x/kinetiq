"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultStackCards,
  defaultStackColumns,
  StackCarry,
  type StackMoveResult,
} from "@/registry/ui/stack-carry";

export const tweaks = defineTweaks({
  fanAngle: {
    kind: "range",
    label: "Fan",
    default: 7,
    min: 0,
    max: 16,
    step: 1,
    unit: "°",
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

const START: string[] = ["CB-1047", "CB-1045"];
const titleOf = (id: string) =>
  defaultStackColumns.find((c) => c.id === id)?.title ?? id;

/**
 * Coldbrook Support's Tuesday queue. Two tickets start selected. The desk
 * will not close CB-1042 while its refund is pending, so moving it to Solved
 * comes back refused, after a short pause for the check.
 */
export function StackCarryDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [selected, setSelected] = React.useState<string[]>(START);
  const [note, setNote] = React.useState<string | null>(null);
  const [cards, setCards] = React.useState(defaultStackCards);
  const timers = React.useRef(new Set<number>());
  // A landed move reports the selection it leaves; that is not a new choice.
  const justMoved = React.useRef(false);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.clear();
    };
  }, []);

  const onMoveMany = (
    ids: string[],
    to: string,
  ): StackMoveResult | Promise<StackMoveResult> => {
    const failed =
      to === "solved" && ids.includes("CB-1042")
        ? [{ id: "CB-1042", reason: "Refund still pending" }]
        : [];
    const went = ids.length - failed.length;
    const summary = failed.length
      ? `${went} of ${ids.length} moved · CB-1042 stayed`
      : `moved ${ids.length} to ${titleOf(to)}`;
    if (to !== "solved") {
      setNote(summary);
      justMoved.current = true;
      return { failed };
    }
    // Closing a ticket checks billing first.
    setNote(
      `checking ${ids.length === 1 ? "1 ticket" : `${ids.length} tickets`}…`,
    );
    return new Promise((resolve) => {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setNote(summary);
        justMoved.current = true;
        resolve({ failed });
      }, 500);
      timers.current.add(t);
    });
  };

  const board = (
    <StackCarry
      key={round}
      defaultSelected={START}
      onSelect={(ids) => {
        setSelected(ids);
        if (justMoved.current) justMoved.current = false;
        else setNote(null);
      }}
      onCardsChange={setCards}
      onMoveMany={onMoveMany}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const from = Array.from(
    new Set(
      selected.map((id) =>
        titleOf(cards.find((c) => c.id === id)?.column ?? ""),
      ),
    ),
  );

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {board}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current.clear();
            setSelected(START);
            setCards(defaultStackCards);
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
        {note ? (
          <span className="text-signal">{note}</span>
        ) : selected.length ? (
          <>
            <span className="text-signal">{selected.length} selected</span> ·{" "}
            {from.join(", ")}
          </>
        ) : (
          <>no selection · {cards.length} tickets</>
        )}
      </p>
    </div>
  );
}
