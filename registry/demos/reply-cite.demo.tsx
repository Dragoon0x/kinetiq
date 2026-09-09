"use client";

import * as React from "react";

import { ReplyCite, type ReplyMessage } from "@/registry/ui/reply-cite";

const OPENING: ReplyMessage[] = [
  {
    id: "m1",
    from: "Marta",
    time: "07:12",
    text: "Gate B is clear from eight. Two pallets for the Basinworks run and one loose crate that never got a label.",
  },
  {
    id: "m2",
    from: "Rui",
    time: "07:20",
    text: "I can label the loose one, but I need the weight off the docket first.",
  },
  {
    id: "m3",
    from: "me",
    time: "07:24",
    text: "Docket says 41 kilos.",
  },
  {
    id: "m4",
    from: "Marta",
    time: "07:31",
    text: "Then we are a driver short for the second pallet, and Waylight Pay wants it signed for by ten.",
  },
];

/** Seeded, so a sent line carries a time without anything reading a clock. */
const TIMES = ["07:36", "07:44", "07:51", "08:02"];

export function ReplyCiteDemo() {
  const [messages, setMessages] = React.useState(OPENING);
  // The desk opens replying to the message at the top, so pressing the cite
  // card glides the pinned-to-newest thread all the way back to it.
  const [replyTo, setReplyTo] = React.useState<string | null>("m1");
  const [sent, setSent] = React.useState(0);

  const target = messages.find((message) => message.id === replyTo);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReplyCite
        label="Coldbrook dispatch"
        messages={messages}
        replyTo={replyTo}
        onReplyToChange={setReplyTo}
        onSend={(text, to) => {
          const n = sent + 1;
          setMessages((prev) => [
            ...prev,
            {
              id: `s${n}`,
              from: "me",
              time: TIMES[sent] ?? "08:10",
              text,
              replyTo: to ?? undefined,
            },
          ]);
          setSent(n);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {target ? (
          <span className="text-signal">
            replying to {target.from === "me" ? "you" : target.from}
          </span>
        ) : (
          "no target"
        )}
        {` · ${messages.length} in thread`}
      </p>
    </div>
  );
}
