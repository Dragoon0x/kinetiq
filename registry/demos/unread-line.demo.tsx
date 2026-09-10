"use client";

import * as React from "react";

import { UnreadLine, type UnreadMessage } from "@/registry/ui/unread-line";

const line = (
  id: string,
  author: string,
  time: string,
  text: string,
): UnreadMessage => ({ id, author, time, text });

const THREAD: UnreadMessage[] = [
  line(
    "a",
    "Ines Moreau",
    "01:48",
    "Gate is locked. Everything is on dock two tonight.",
  ),
  line(
    "b",
    "Rui Baptista",
    "01:55",
    "Loader keys are back on the hook by the office.",
  ),
  line(
    "c",
    "Ines Moreau",
    "02:03",
    "Good. I am off at three, Marta takes the handover.",
  ),
  line(
    "d",
    "Marta Ferreira",
    "02:14",
    "Pallet 4471 is still held. Waylight Pay has not cleared it.",
  ),
  line(
    "e",
    "Marta Ferreira",
    "02:16",
    "I left the paperwork on the desk under the sheet.",
  ),
  line(
    "f",
    "Rui Baptista",
    "02:31",
    "Dock three is free from nine if the yard needs it.",
  ),
  line(
    "g",
    "Marta Ferreira",
    "02:40",
    "Coldbrook depot closes Thursday from noon. Nothing leaves after eleven.",
  ),
];

const UNREAD_AT_START = 3;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function UnreadLineDemo() {
  const [read, setRead] = React.useState(UNREAD_AT_START);

  const unread = THREAD.length - read;
  const first = THREAD[read];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <UnreadLine
        label="Coldbrook night shift"
        messages={THREAD}
        readCount={read}
        onReadCountChange={setRead}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRead(read + 1)}
          disabled={unread === 0}
          className={chip}
        >
          Read the next one
        </button>
        <button
          type="button"
          onClick={() => setRead(UNREAD_AT_START)}
          disabled={read === UNREAD_AT_START}
          className={chip}
        >
          Put four back
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {unread === 0 ? "up to date" : `${unread} unread`}
        </span>
        {first ? ` · first from ${first.author}` : ""}
      </p>
    </div>
  );
}
