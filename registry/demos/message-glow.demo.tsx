"use client";

import * as React from "react";

import { MessageGlow, type GlowMessage } from "@/registry/ui/message-glow";

/** Waylight Pay, the payouts incident, as author|time|text|replyTo. */
const LINES = [
  "Rui|08:41|Payout batch 4471 is stuck at signing. 212 transfers, nothing has left.",
  "Ines|08:43|Looking. Is the signer pod up?",
  "Rui|08:44|Up, but its clock is forty seconds behind, so every signature fails validation.",
  "Marta|08:47|Same drift on the second signer. Both were rebooted at six.",
  "Ines|08:50|The time sync unit on rack B is down. Restarting it.",
  "Marta|08:52|Drift is closing. Twelve seconds now.",
  "Rui|08:55|Under a second. Retrying the batch.",
  "Rui|08:58|Batch 4471 is through. 212 of 212 signed.|m1",
  "Ines|09:01|Good. Anything queued behind it?",
  "Marta|09:03|Two smaller batches, both released on their own.",
  "Ines|09:10|For the write-up: the sync unit lost power with the six o'clock reboot.|m5",
  "Rui|09:12|Adding a drift alarm at five seconds so we hear it before the signer does.",
  "Marta|09:15|Coldbrook Bank confirms receipt on their side.|m8",
  "Ines|09:16|Closing the incident. Thanks both.",
];

const MESSAGES: GlowMessage[] = LINES.map((line, index) => {
  const [author = "", at = "", text = "", replyTo] = line.split("|");
  return {
    id: `m${index + 1}`,
    author,
    at,
    text,
    mine: author === "Ines",
    replyTo,
  };
});

type Last = { kind: "latest" | "jumped" | "back"; id?: string };

export function MessageGlowDemo() {
  const [last, setLast] = React.useState<Last>({ kind: "latest" });

  const target = MESSAGES.find((message) => message.id === last.id);
  const line =
    last.kind === "jumped" && target
      ? ["Jumped ·", `${target.author} ${target.at}`, ""]
      : last.kind === "back"
        ? ["Back ·", "where you were", ""]
        : ["Latest ·", `${MESSAGES.length} messages`, "· 3 quotes"];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MessageGlow
        label="Payouts incident"
        messages={MESSAGES}
        pinned="m1"
        onJump={(id) => setLast({ kind: "jumped", id })}
        onBack={() => setLast({ kind: "back" })}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
