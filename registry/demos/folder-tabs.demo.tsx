"use client";

import * as React from "react";

import {
  FolderTabs,
  type FolderChannel,
  type FolderId,
} from "@/registry/ui/folder-tabs";

const seed = (
  id: string,
  name: string,
  preview: string,
  unread = 0,
  mentions = 0,
  muted = false,
): FolderChannel => ({ id, name, preview, unread, mentions, muted });

const SEED: FolderChannel[] = [
  seed("dispatch", "dispatch", "Ines: Gate B is loaded", 2, 1),
  seed("returns", "returns", "Marta: Two crates came back split", 1),
  seed("pay", "waylight-pay", "Rui: Week 36 payouts queued"),
  seed("basinworks", "basinworks", "Contract copy for the yard"),
  seed("night", "night-shift", "Rota for the week", 0, 0, true),
  seed("gate", "gate-b", "Scale calibrated"),
];

/** A seeded script, so an arrival is a press rather than a clock. */
const SCRIPT = [
  { id: "pay", preview: "Rui: Waylight Pay cleared week 36", mention: false },
  { id: "gate", preview: "Ines: Scale reads 40kg light", mention: true },
  { id: "returns", preview: "Marta: Basinworks want photos", mention: false },
  { id: "night", preview: "Ines: Two on tonight, not three", mention: false },
];

export function FolderTabsDemo() {
  const [channels, setChannels] = React.useState(SEED);
  const [folder, setFolder] = React.useState<FolderId>("all");
  const [open, setOpen] = React.useState("dispatch");
  const [step, setStep] = React.useState(0);

  const line = SCRIPT[step];
  const counts = {
    all: channels.length,
    unread: channels.filter((channel) => channel.unread > 0).length,
    mentions: channels.filter((channel) => channel.mentions > 0).length,
  };
  const openName = channels.find((channel) => channel.id === open)?.name ?? "";

  const deliver = () => {
    if (!line) return;
    setChannels((prev) => {
      const hit = prev.find((channel) => channel.id === line.id);
      if (!hit) return prev;
      const next: FolderChannel = {
        ...hit,
        preview: line.preview,
        unread: hit.unread + 1,
        mentions: hit.mentions + (line.mention ? 1 : 0),
      };
      // The delivered channel jumps to the top, so the FLIP has work to do.
      return [next, ...prev.filter((channel) => channel.id !== line.id)];
    });
    setStep((value) => value + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FolderTabs
        label="Coldbrook depot channels"
        channels={channels}
        value={folder}
        onValueChange={setFolder}
        activeChannel={open}
        onChannelSelect={setOpen}
      />

      <button
        type="button"
        onClick={deliver}
        disabled={!line}
        className="flex h-8 items-center justify-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {line ? "Deliver a message" : "Script played out"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        All {counts.all} · Unread {counts.unread} · Mentions {counts.mentions} ·{" "}
        <span className="text-signal">#{openName} open</span>
      </p>
    </div>
  );
}
