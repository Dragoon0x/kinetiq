"use client";

import * as React from "react";

import { PresenceRow } from "@/registry/ui/presence-row";

const POOL = [
  { id: "ana", name: "Ana Reyes", tint: "var(--signal)" },
  { id: "bo", name: "Bo Fenwick", tint: "var(--accent-bright)" },
  { id: "iris", name: "Iris Kane", tint: "var(--warn)" },
  { id: "milo", name: "Milo Trant", tint: "var(--success)" },
  { id: "nell", name: "Nell Okoro", tint: "var(--accent)" },
  { id: "raf", name: "Raf Dial", tint: "var(--ink-2)" },
];

const MAX = 4;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PresenceRowDemo() {
  const [count, setCount] = React.useState(3);
  const [note, setNote] = React.useState<string | null>(null);

  const people = POOL.slice(0, count);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <PresenceRow
        people={people}
        max={MAX}
        context="the Fernworks brief"
        onOverflowClick={() =>
          setNote(
            POOL.slice(MAX, count)
              .map((person) => person.name)
              .join(", "),
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={count >= POOL.length}
          onClick={() => {
            setNote(null);
            setCount((current) => Math.min(POOL.length, current + 1));
          }}
        >
          Someone joins
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={count <= 1}
          onClick={() => {
            setNote(null);
            setCount((current) => Math.max(1, current - 1));
          }}
        >
          Someone leaves
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{people.length}</span> on the
        brief{note ? ` · also ${note}` : ""}
      </p>
    </div>
  );
}
