"use client";

import * as React from "react";

import { DraftBadge, type DraftChannel } from "@/registry/ui/draft-badge";

const CHANNELS: DraftChannel[] = [
  { id: "dispatch", name: "dispatch", topic: "Morning run, gate B" },
  { id: "returns", name: "returns", topic: "Damaged crates from Basinworks" },
  { id: "pay", name: "waylight-pay", topic: "Payouts for week 36" },
];

/** Two channels already hold something unsent when the desk opens. */
const SEEDED: Record<string, string> = {
  returns:
    "Marta, the two crates from Basinworks came back split along the base. Photos attached once",
  pay: "Rui, week 36 payouts are queued for",
};

type Last =
  | { kind: "kept" | "restored" | "opened"; id: string }
  | { kind: "sent"; id: string }
  | null;

export function DraftBadgeDemo() {
  const [drafts, setDrafts] = React.useState(SEEDED);
  const [active, setActive] = React.useState("dispatch");
  const [last, setLast] = React.useState<Last>(null);
  const [sent, setSent] = React.useState(0);

  const nameOf = (id: string) =>
    `#${CHANNELS.find((channel) => channel.id === id)?.name ?? id}`;
  const draftCount = Object.values(drafts).filter(
    (text) => text.trim().length > 0,
  ).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DraftBadge
        label="Coldbrook depot channels"
        channels={CHANNELS}
        drafts={drafts}
        onDraftsChange={setDrafts}
        active={active}
        onActiveChange={(id) => {
          const restored = (drafts[id] ?? "").trim().length > 0;
          const kept = (drafts[active] ?? "").trim().length > 0;
          setLast(
            restored
              ? { kind: "restored", id }
              : kept
                ? { kind: "kept", id: active }
                : { kind: "opened", id },
          );
          setActive(id);
        }}
        onSend={(id) => {
          setSent((count) => count + 1);
          setLast({ kind: "sent", id });
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {nameOf(active)} open · {draftCount}{" "}
        {draftCount === 1 ? "draft" : "drafts"}
        {last ? (
          <>
            {" · "}
            <span className="text-signal">
              {last.kind === "sent"
                ? `sent → ${nameOf(last.id)}`
                : `${last.kind} ${nameOf(last.id)}`}
            </span>
          </>
        ) : sent === 0 ? (
          " · open a badged row"
        ) : null}
      </p>
    </div>
  );
}
