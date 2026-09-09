"use client";

import * as React from "react";

import { MemoryCard, type MemoryItem } from "@/registry/ui/memory-card";

/** What Fernworks Model 3 learns about the Basinworks yard, one turn at a time. */
const SCRIPT: MemoryItem[] = [
  { id: "yard", fact: "Ships from the Basinworks yard", note: "Turn 2" },
  { id: "pdf", fact: "Prefers PDF invoices", note: "Turn 3" },
  { id: "terms", fact: "Pays through Waylight Pay, net 30", note: "Turn 5" },
  {
    id: "office",
    fact: "The yard office answers, not the front desk",
    note: "Turn 6",
  },
  { id: "friday", fact: "Closes at 17:00 on Fridays", note: "Turn 8" },
];

type Event = { verb: "saved" | "pinned" | "unpinned" | "forgot"; fact: string };

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-50 disabled:opacity-50";

export function MemoryCardDemo() {
  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [next, setNext] = React.useState(0);
  const [event, setEvent] = React.useState<Event | null>(null);

  const spent = next >= SCRIPT.length;

  const save = () => {
    const item = SCRIPT[next];
    if (!item) return;
    setItems((current) => [...current, item]);
    setNext(next + 1);
    setEvent({ verb: "saved", fact: item.fact });
  };

  const pin = (id: string, pinned: boolean) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setItems((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, pinned } : entry)),
    );
    setEvent({ verb: pinned ? "pinned" : "unpinned", fact: item.fact });
  };

  const forget = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setItems((current) => current.filter((entry) => entry.id !== id));
    setEvent({ verb: "forgot", fact: item.fact });
  };

  const reset = () => {
    setItems([]);
    setNext(0);
    setEvent(null);
  };

  const pinned = items.filter((item) => item.pinned).length;
  const status =
    items.length === 0
      ? "Nothing saved · press save next"
      : `${items.length} remembered · ${pinned} pinned${
          event ? ` · ${event.verb} ${event.fact}` : ""
        }`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MemoryCard
        label="Fernworks Model 3 · Waylight Pay desk"
        items={items}
        onPin={pin}
        onForget={forget}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={spent || undefined}
          onClick={() => {
            if (!spent) save();
          }}
          className={buttonClass}
        >
          Save next
        </button>
        <button
          type="button"
          disabled={next === 0}
          onClick={reset}
          className={buttonClass}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
