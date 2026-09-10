"use client";

import * as React from "react";

import { WarnStrip, type WarnMessage } from "@/registry/ui/warn-strip";

const say = (
  id: string,
  author: string,
  time: string,
  text: string,
  caution?: string,
): WarnMessage => ({ id, author, time, text, caution });

const THREAD: WarnMessage[] = [
  say(
    "a",
    "Ines Moreau",
    "07:52",
    "Dock two is loaded. Pallet 4471 still held.",
  ),
  say(
    "b",
    "Rui Baptista",
    "08:12",
    "Whoever packed 4471 cannot count. Useless, the lot of them.",
    "strong words about a driver",
  ),
  say("c", "Ines Moreau", "08:20", "Keep it to the pallet, Rui. Room rule 3."),
  say(
    "d",
    "Marta Ferreira",
    "08:31",
    "Photo of the split corner, taken on the ramp before we moved it.",
    "photo of a damaged pallet",
  ),
  say(
    "e",
    "Ines Moreau",
    "08:40",
    "Waylight Pay cleared it. Dock three at nine.",
  ),
];

const WARNED = THREAD.filter((message) => message.caution).map(
  (message) => message.id,
);

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function WarnStripDemo() {
  const [down, setDown] = React.useState<string[]>([]);

  const showing = down.length;
  const first = THREAD.find((message) => down.includes(message.id));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <WarnStrip
        label="Coldbrook depot thread"
        messages={THREAD}
        shown={down}
        onShownChange={setDown}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDown(WARNED)}
          disabled={showing === WARNED.length}
          className={chip}
        >
          Lower both strips
        </button>
        <button
          type="button"
          onClick={() => setDown([])}
          disabled={showing === 0}
          className={chip}
        >
          Cover everything
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {showing === 0
            ? `${WARNED.length} cautions · nothing showing`
            : `${showing} showing`}
        </span>
        {showing === 1 && first?.caution ? ` · ${first.caution}` : ""}
      </p>
    </div>
  );
}
