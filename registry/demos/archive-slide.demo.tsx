"use client";

import * as React from "react";

import { ArchiveSlide, type ArchiveChannel } from "@/registry/ui/archive-slide";

const seed = (
  id: string,
  name: string,
  preview: string,
  unread = 0,
): ArchiveChannel => ({ id, name, preview, unread });

const CHANNELS: ArchiveChannel[] = [
  seed("dispatch", "dispatch", "Ines: Gate B is loaded", 2),
  seed("returns", "returns", "Marta: Two crates came back split", 1),
  seed("pay", "waylight-pay", "Rui: Week 36 payouts queued"),
  seed("basinworks", "basinworks", "Contract copy for the yard"),
  seed("night", "night-shift", "Rota for the week"),
];

export function ArchiveSlideDemo() {
  const [archived, setArchived] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState("dispatch");

  const showing = CHANNELS.length - archived.length;
  const nameOf = (id: string) =>
    CHANNELS.find((channel) => channel.id === id)?.name ?? id;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ArchiveSlide
        label="Coldbrook depot channels"
        channels={CHANNELS}
        archived={archived}
        onArchivedChange={setArchived}
        onArchive={setLast}
        onRestore={() => setLast(null)}
        activeChannel={open}
        onChannelSelect={setOpen}
      />

      <button
        type="button"
        disabled={archived.length === 0}
        onClick={() => {
          setArchived([]);
          setLast(null);
        }}
        className="flex h-8 items-center justify-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        Restore all
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {showing} showing · {archived.length} archived ·{" "}
        <span className="text-signal">
          {last ? `last #${nameOf(last)}` : "drag a row left"}
        </span>
      </p>
    </div>
  );
}
