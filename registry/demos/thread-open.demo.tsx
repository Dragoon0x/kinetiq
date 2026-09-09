"use client";

import * as React from "react";

import { ThreadOpen, type ThreadMessage } from "@/registry/ui/thread-open";

const SEED: ThreadMessage[] = [
  {
    id: "m1",
    from: "Marta",
    time: "07:12",
    text: "Gate B is clear from eight. Two pallets for the Basinworks run and one loose crate that never got a label.",
    replies: [
      {
        id: "r1",
        from: "Rui",
        time: "07:15",
        text: "I can label the loose one if someone gives me the weight.",
      },
      {
        id: "r2",
        from: "me",
        time: "07:18",
        text: "Docket says 41 kilos. It is written on the back page.",
      },
      {
        id: "r3",
        from: "Ines",
        time: "07:21",
        text: "Then it goes on the second pallet, not the first.",
      },
    ],
  },
  {
    id: "m2",
    from: "Rui",
    time: "07:26",
    text: "Waylight Pay wants the run signed for by ten.",
  },
  {
    id: "m3",
    from: "me",
    time: "07:31",
    text: "I will take the signature at the gate.",
    replies: [
      {
        id: "r4",
        from: "Marta",
        time: "07:33",
        text: "Bring the second docket with you.",
      },
    ],
  },
];

/** Seeded times, so a sent reply is stamped without anything reading a clock. */
const TIMES = ["07:38", "07:45", "07:52", "08:04"];

export function ThreadOpenDemo() {
  const [messages, setMessages] = React.useState(SEED);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(0);

  const open = messages.find((message) => message.id === openId);
  const replies = messages.reduce(
    (total, message) => total + (message.replies?.length ?? 0),
    0,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ThreadOpen
        label="Coldbrook depot, gate B"
        messages={messages}
        openId={openId}
        onOpenIdChange={setOpenId}
        onReply={(parentId, text) => {
          const n = sent + 1;
          setSent(n);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === parentId
                ? {
                    ...message,
                    replies: [
                      ...(message.replies ?? []),
                      {
                        id: `s${n}`,
                        from: "me",
                        time: TIMES[sent] ?? "08:10",
                        text,
                      },
                    ],
                  }
                : message,
            ),
          );
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <span className="text-signal">
            thread {open.from === "me" ? "you" : open.from}
          </span>
        ) : (
          "thread closed"
        )}
        {` · ${messages.length} messages · ${replies} replies`}
      </p>
    </div>
  );
}
