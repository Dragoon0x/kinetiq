"use client";

import * as React from "react";

import {
  MentionPop,
  type MentionMember,
  type MentionMessage,
} from "@/registry/ui/mention-pop";

const CREW: MentionMember[] = [
  { id: "marta", name: "Marta", handle: "marta.v", presence: "online" },
  { id: "rui", name: "Rui", handle: "rui.c", presence: "away" },
  { id: "teo", name: "Teo", handle: "teo.b", presence: "offline" },
  { id: "ines", name: "Ines", handle: "ines.d", presence: "online" },
];

const OPENING: MentionMessage[] = [
  {
    id: "m1",
    from: "Marta",
    text: "@Ines the pump on line two is back up. Who takes the night check?",
  },
  { id: "m2", from: "Rui", text: "I can, if the gate log is signed by six." },
];

export function MentionPopDemo() {
  const [messages, setMessages] = React.useState(OPENING);
  const [sent, setSent] = React.useState(0);
  const [pinged, setPinged] = React.useState<string[]>([]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MentionPop
        label="Basinworks crew room"
        members={CREW}
        messages={messages}
        placeholder="Message the crew. Type @ to mention."
        onSend={(text, mentioned) => {
          const n = sent + 1;
          setMessages((prev) => [...prev, { id: `s${n}`, from: "me", text }]);
          setSent(n);
          setPinged(
            mentioned.flatMap((id) => {
              const member = CREW.find((m) => m.id === id);
              return member ? [member.name] : [];
            }),
          );
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sent === 0 ? (
          "Type @ to mention · 0 sent"
        ) : (
          <>
            <span className="text-signal">
              {pinged.length > 0
                ? `pinged ${pinged.join(", ")}`
                : "nobody pinged"}
            </span>
            {` · ${sent} sent`}
          </>
        )}
      </p>
    </div>
  );
}
