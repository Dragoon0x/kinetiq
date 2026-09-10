"use client";

import * as React from "react";

import {
  ReplyThreadLine,
  type LineMessage,
} from "@/registry/ui/reply-thread-line";

const THREAD: LineMessage[] = [
  {
    id: "m1",
    from: "Marta",
    time: "07:12",
    text: "Gate B is clear from eight. Two pallets for the Basinworks run.",
  },
  {
    id: "m2",
    from: "Ines",
    time: "07:19",
    text: "The loose crate never got a label.",
  },
  {
    id: "m3",
    from: "me",
    time: "07:24",
    text: "Docket says 41 kilos.",
    replyTo: "m2",
  },
  {
    id: "m4",
    from: "Rui",
    time: "07:31",
    text: "Waylight Pay wants it signed for by ten.",
  },
  {
    id: "m5",
    from: "Rui",
    time: "07:44",
    text: "I can take the second pallet out at eight sharp.",
    replyTo: "m1",
  },
  {
    id: "m6",
    from: "Marta",
    time: "07:51",
    text: "Then Ines writes the label while you load.",
    replyTo: "m3",
  },
];

export function ReplyThreadLineDemo() {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [jumps, setJumps] = React.useState(0);

  const reply = THREAD.find((message) => message.id === activeId);
  const parent = THREAD.find((message) => message.id === reply?.replyTo);
  const replies = THREAD.filter((message) => message.replyTo).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="px-1 text-[11px] leading-4 text-ink-3">
        Point at a reply, or walk the thread with the arrow keys.
      </p>

      <ReplyThreadLine
        label="Coldbrook depot, gate B"
        messages={THREAD}
        activeId={activeId}
        onActiveChange={setActiveId}
        onJumpToParent={() => setJumps((count) => count + 1)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reply && parent ? (
          <span className="text-signal">
            {`${reply.from === "me" ? "you" : reply.from} ${reply.time} answers ${
              parent.from === "me" ? "you" : parent.from
            } ${parent.time}`}
          </span>
        ) : (
          "no line"
        )}
        {` · ${replies} replies · ${jumps} ${jumps === 1 ? "jump" : "jumps"}`}
      </p>
    </div>
  );
}
