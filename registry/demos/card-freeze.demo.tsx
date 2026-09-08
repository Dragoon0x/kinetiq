"use client";

import * as React from "react";

import { CardFreeze } from "@/registry/ui/card-freeze";

export function CardFreezeDemo() {
  const [frozen, setFrozen] = React.useState(false);
  const [thrown, setThrown] = React.useState(0);

  const midThrow = thrown > 0 && thrown < 100;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CardFreeze
        label="Freeze Coldbrook card"
        frozen={frozen}
        onFrozenChange={setFrozen}
        onProgressChange={setThrown}
      />

      <div className="flex items-center justify-between gap-3 rounded-2 border border-hairline px-3 py-2">
        <span
          className={
            frozen
              ? "min-w-0 truncate text-xs text-ink-3 line-through"
              : "min-w-0 truncate text-xs text-ink"
          }
        >
          Tap to pay · contactless
        </span>
        <span
          aria-hidden
          className={
            frozen
              ? "size-1.5 shrink-0 rounded-full bg-ink-3"
              : "size-1.5 shrink-0 rounded-full bg-success"
          }
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook card{" "}
        <span className="text-cobalt-bright">
          {frozen ? "frozen" : "active"}
        </span>
        {midThrow ? (
          <span className="tabular-nums"> · throwing {thrown}%</span>
        ) : null}
      </p>
    </div>
  );
}
