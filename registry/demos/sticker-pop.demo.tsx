"use client";

import * as React from "react";

import {
  StickerPop,
  type StickerArt,
  type StickerMessage,
} from "@/registry/ui/sticker-pop";

/** The ring the Send control walks, in order. */
const RING: StickerArt[] = ["star", "wave", "bolt", "cat"];

const OPENING: StickerMessage[] = [
  { id: "m1", from: "peer", text: "Dock four is clear.", time: "7:58" },
  { id: "m2", from: "peer", art: "cat", seed: 3, time: "7:59" },
];

export function StickerPopDemo() {
  const [messages, setMessages] = React.useState<StickerMessage[]>(OPENING);
  const [sent, setSent] = React.useState(0);
  const [note, setNote] = React.useState("cat landed");

  const send = () => {
    const art = RING[sent % RING.length];
    if (!art) return;
    const next = sent + 1;
    setSent(next);
    setNote(`${art} sent`);
    setMessages((current) =>
      [
        ...current,
        {
          id: `s${next}`,
          from: "me" as const,
          art,
          seed: next,
          time: `8:0${Math.min(9, next)}`,
        },
      ].slice(-3),
    );
  };
  const stickerCount = messages.filter((message) => message.art).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StickerPop
        label="Shift thread with Marta"
        peerName="Marta"
        messages={messages}
        onReplay={() => setNote("replayed")}
      />

      <button
        type="button"
        onClick={send}
        className="h-9 self-start rounded-3 border border-hairline-strong px-3 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash"
      >
        Send sticker
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stickerCount} {stickerCount === 1 ? "sticker" : "stickers"} ·{" "}
        <span className="text-signal">{note}</span>
      </p>
    </div>
  );
}
