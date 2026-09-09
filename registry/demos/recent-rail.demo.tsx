"use client";

import * as React from "react";

import { RecentRail, type RecentItem } from "@/registry/ui/recent-rail";

/** Fernworks Model 3's recent threads on the Waylight Pay support desk. */
const SEED: RecentItem[] = [
  { id: "c1", title: "Refund for a Waylight Pay order", age: "2h" },
  { id: "c2", title: "Coldbrook Bank statement import", age: "Yesterday" },
  { id: "c3", title: "Basinworks yard invoice", age: "Mon" },
  { id: "c4", title: "Fee schedule question", age: "Last week" },
];

/** New conversations arrive from this script, in order. */
const SCRIPT = [
  "Chargeback on a split payment",
  "Merchant payout timing",
  "Duplicate invoice check",
  "Card freeze after travel",
];

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function RecentRailDemo() {
  const [items, setItems] = React.useState(SEED);
  const [active, setActive] = React.useState("c1");
  const [count, setCount] = React.useState(0);
  const [renamed, setRenamed] = React.useState<string | null>(null);

  const open = () => {
    const title = SCRIPT[count % SCRIPT.length] ?? "";
    const id = `n${count + 1}`;
    setItems((list) => [{ id, title, age: "Now" }, ...list]);
    setActive(id);
    setCount((n) => n + 1);
    setRenamed(null);
  };

  const rename = (id: string, title: string) => {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, title } : item)),
    );
    setRenamed(title);
  };

  // The count keeps climbing across resets so every new id is unique and the
  // rail can tell a fresh conversation from one it has already seen.
  const reset = () => {
    setItems(SEED);
    setActive("c1");
    setRenamed(null);
  };

  const activeTitle = items.find((item) => item.id === active)?.title ?? "";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RecentRail
        label="Recent"
        items={items}
        max={5}
        value={active}
        onValueChange={(id) => {
          setActive(id);
          setRenamed(null);
        }}
        onRename={rename}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} className={button}>
          New conversation
        </button>
        <button type="button" onClick={reset} className={button}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {renamed ? `Renamed · ${renamed}` : `Active · ${activeTitle}`}
      </p>
    </div>
  );
}
