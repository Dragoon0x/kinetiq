"use client";

import * as React from "react";

import {
  PriorityFlagChat,
  type PriorityMessage,
} from "@/registry/ui/priority-flag-chat";

const OPENING: PriorityMessage[] = [
  { id: "m1", author: "Rui", text: "Dock three is free from nine." },
  {
    id: "m2",
    author: "Ines",
    text: "Pallet 4471 is held at the gate, no paperwork.",
    urgent: true,
  },
  { id: "m3", author: "Marta", text: "Loader booked until half past." },
];

/** Seeded scripts, walked by index — no clock, no randomness. */
const URGENT = [
  { author: "Ines", text: "Waylight Pay put a hold on the yard fee." },
  { author: "Rui", text: "Gate B is shut, the morning run needs a new bay." },
  { author: "Marta", text: "Cold store is down to four degrees, rising." },
];

const CALM = [
  { author: "Marta", text: "Two crates back on Friday, both labelled." },
  { author: "Rui", text: "Handover sheet is on the desk." },
  { author: "Ines", text: "Basinworks confirmed the eleven o'clock slot." },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PriorityFlagChatDemo() {
  const [messages, setMessages] = React.useState<PriorityMessage[]>(OPENING);
  const [step, setStep] = React.useState({ urgent: 0, calm: 0 });
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);

  const send = (urgent: boolean) => {
    const script = urgent ? URGENT : CALM;
    const index = urgent ? step.urgent : step.calm;
    const line = script[index % script.length];
    if (!line) return;
    setStep((prev) =>
      urgent
        ? { ...prev, urgent: prev.urgent + 1 }
        : { ...prev, calm: prev.calm + 1 },
    );
    setMessages((prev) => [
      ...prev,
      {
        id: `${urgent ? "u" : "c"}${index}-${prev.length}`,
        author: line.author,
        text: line.text,
        urgent,
      },
    ]);
  };

  const acknowledge = (id: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? { ...message, acknowledged: true, acknowledgedBy: "you" }
          : message,
      ),
    );
    setLastSeen(messages.find((message) => message.id === id)?.author ?? null);
  };

  const pending = messages.filter(
    (message) => message.urgent && !message.acknowledged,
  ).length;
  const seen = messages.filter((message) => message.acknowledged).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PriorityFlagChat
        label="Coldbrook yard dispatch"
        messages={messages}
        maxHeight={300}
        onAcknowledge={acknowledge}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => send(true)} className={chip}>
          Send an urgent ping
        </button>
        <button type="button" onClick={() => send(false)} className={chip}>
          Send an ordinary message
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className={pending > 0 ? "text-signal" : undefined}>
          {pending === 0
            ? "Nothing urgent waiting"
            : `${pending} urgent waiting`}
        </span>
        {lastSeen ? ` · last ack ${lastSeen}` : ` · ${seen} acknowledged`}
      </p>
    </div>
  );
}
