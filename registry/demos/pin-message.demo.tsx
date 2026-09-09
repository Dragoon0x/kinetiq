"use client";

import * as React from "react";

import { PinMessage, type PinnedMessage } from "@/registry/ui/pin-message";

const THREAD: PinnedMessage[] = [
  {
    id: "closure",
    author: "Ines Moreau",
    text: "Coldbrook depot closes Thursday from noon. Nothing leaves the yard after eleven.",
    time: "14:38",
  },
  {
    id: "run",
    author: "Marta Ferreira",
    text: "Morning run can take the Basinworks pallets instead. Two, both labelled.",
    time: "14:52",
  },
  {
    id: "dock",
    author: "Rui Baptista",
    text: "Dock three is free from nine, and the loader is booked until half past.",
    time: "15:11",
  },
  {
    id: "reference",
    author: "Ines Moreau",
    text: "Waylight Pay reference for the yard fee is 4471-CB. Put it on the sheet.",
    time: "15:24",
  },
];

const MAX = 3;
const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PinMessageDemo() {
  const [pinned, setPinned] = React.useState<string[]>(["closure"]);

  const last = THREAD.find((message) => message.id === pinned[0]);
  const status =
    pinned.length === 0
      ? "bar empty"
      : pinned.length >= MAX
        ? "bar full · unpin one to add"
        : `${pinned.length} of ${MAX} pinned`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PinMessage
        label="Coldbrook operations"
        barLabel="Pinned"
        messages={THREAD}
        value={pinned}
        onValueChange={setPinned}
        maxPinned={MAX}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pinned.includes("dock") || pinned.length >= MAX}
          onClick={() => setPinned((prev) => ["dock", ...prev])}
          className={chip}
        >
          Pin the dock note
        </button>
        <button
          type="button"
          disabled={pinned.length === 0}
          onClick={() => setPinned([])}
          className={chip}
        >
          Clear the bar
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
        {last ? ` · last pinned ${last.author.split(" ")[0]} ${last.time}` : ""}
      </p>
    </div>
  );
}
