"use client";

import * as React from "react";

import { BadgeBump } from "@/registry/ui/badge-bump";

const CONTROL =
  "inline-flex h-8 items-center rounded-2 border border-input px-3 text-xs font-medium outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

export function BadgeBumpDemo() {
  const [count, setCount] = React.useState(3);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center gap-4">
        <BadgeBump count={count} tone="primary" label="held messages">
          <button
            type="button"
            aria-label="Waylight inbox"
            className="flex size-11 items-center justify-center rounded-2 border border-input outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-5 shrink-0 fill-none stroke-current"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 13.5h4l1.4 2.2h6.2l1.4-2.2h4" />
              <path d="M6.2 5h11.6l3.2 8.5v4a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 17.5v-4z" />
            </svg>
          </button>
        </BadgeBump>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Waylight inbox</p>
          <p className="text-xs text-muted-foreground">
            Messages held for review.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCount((n) => n + 1)}
          className={CONTROL}
        >
          Add one
        </button>
        <button
          type="button"
          onClick={() => setCount((n) => n + 25)}
          className={CONTROL}
        >
          Add 25
        </button>
        <button
          type="button"
          onClick={() => setCount(0)}
          disabled={count === 0}
          className={CONTROL}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Count <span className="text-signal tabular-nums">{count}</span>
      </p>
    </div>
  );
}
