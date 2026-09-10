"use client";

import * as React from "react";

import { FilterMask } from "@/registry/ui/filter-mask";

const MESSAGE =
  "The last two Waylight Pay boxes turned up soaked, the tape was rubbish, and the courier was clueless about all of it.";

const ROOM_TERMS = ["soaked", "rubbish", "clueless"];
const LIGHT_TERMS = ["clueless"];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function FilterMaskDemo() {
  const [strict, setStrict] = React.useState(true);
  const [revealed, setRevealed] = React.useState(false);
  const [count, setCount] = React.useState({ masked: 0, total: 0 });
  const [last, setLast] = React.useState<string | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FilterMask
        text={MESSAGE}
        terms={strict ? ROOM_TERMS : LIGHT_TERMS}
        author="Ines Rocha"
        time="14:02"
        filterName="Coldbrook filter"
        revealed={revealed}
        onRevealedChange={(next) => {
          setRevealed(next);
          setLast(null);
        }}
        onWordReveal={(word) => setLast(word)}
        onMaskedCountChange={(masked, total) => setCount({ masked, total })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setStrict(true);
            setRevealed(false);
            setLast(null);
          }}
          disabled={strict}
          className={chip}
        >
          Room filter
        </button>
        <button
          type="button"
          onClick={() => {
            setStrict(false);
            setRevealed(false);
            setLast(null);
          }}
          disabled={!strict}
          className={chip}
        >
          Light filter
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook filter · {count.masked} of {count.total} masked ·{" "}
        <span className="text-signal">
          {count.masked === 0
            ? "all shown"
            : last
              ? `showed ${last}`
              : "covered"}
        </span>
      </p>
    </div>
  );
}
