"use client";

import * as React from "react";

import { PinBoard, type PinnedFact } from "@/registry/ui/pin-board";

const ASSISTANT = "Fernworks Model 3";

/** What Fernworks Model 3 holds in view about the Basinworks yard. */
// prettier-ignore
const SCRIPT: PinnedFact[] = [
  { id: "gate", fact: "Gate code rotates on the 1st", source: { who: "user", turn: 2, quote: "The gate code changes on the first of every month." } },
  { id: "hours", fact: "Deliveries after 14:00 only", source: { who: "user", turn: 3, quote: "Nothing before two; the yard is closed for loading until then." } },
  { id: "office", fact: "Invoices to the yard office", source: { who: "user", turn: 4, quote: "Invoices go to the yard office, not the front desk." } },
  { id: "pay", fact: "Pays through Waylight Pay", source: { who: "assistant", turn: 5, quote: "I have set Waylight Pay as the payment route for the yard." } },
  { id: "forklift", fact: "Forklift is out until Thursday", source: { who: "user", turn: 7, quote: "The forklift is in for repair until Thursday." } },
];

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-50 disabled:opacity-50";

export function PinBoardDemo() {
  const [items, setItems] = React.useState<PinnedFact[]>([]);
  const [next, setNext] = React.useState(0);
  const [source, setSource] = React.useState<string | null>(null);

  const spent = next >= SCRIPT.length;

  const pin = () => {
    const item = SCRIPT[next];
    if (!item) return;
    setItems((current) => [...current, item]);
    setNext(next + 1);
  };

  const reset = () => {
    setItems([]);
    setNext(0);
    setSource(null);
  };

  const shown = items.find((item) => item.id === source);
  const status =
    items.length === 0
      ? "Nothing pinned · press pin next"
      : shown
        ? `${items.length} pinned · source turn ${shown.source.turn}, ${
            shown.source.who === "assistant" ? ASSISTANT : "you"
          }`
        : `${items.length} pinned · hover a fact for its source`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PinBoard
        label="Basinworks yard · in view"
        items={items}
        onUnpin={(id) =>
          setItems((current) => current.filter((item) => item.id !== id))
        }
        onSourceChange={setSource}
        assistantName={ASSISTANT}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={spent || undefined}
          onClick={() => {
            if (!spent) pin();
          }}
          className={buttonClass}
        >
          Pin next
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
