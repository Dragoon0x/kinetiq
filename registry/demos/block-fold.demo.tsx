"use client";

import * as React from "react";

import {
  BlockFold,
  type BlockMember,
  type BlockMessage,
} from "@/registry/ui/block-fold";

const MEMBERS: BlockMember[] = [
  { id: "ines", name: "Ines Moreau" },
  { id: "rui", name: "Rui Baptista" },
  { id: "marta", name: "Marta Ferreira" },
];

const say = (
  id: string,
  authorId: string,
  time: string,
  text: string,
): BlockMessage => ({ id, authorId, time, text });

const THREAD: BlockMessage[] = [
  say("a", "ines", "07:52", "Dock two is loaded. Pallet 4471 still held."),
  say("b", "rui", "08:12", "Whoever packed 4471 cannot count. Useless."),
  say("c", "rui", "08:13", "Same thing happened on the Basinworks run."),
  say("d", "rui", "08:14", "Someone should own up to it."),
  say(
    "e",
    "marta",
    "08:31",
    "Waylight Pay cleared it. Paperwork is on the desk.",
  ),
  say("f", "ines", "08:40", "Good. Rui, take dock three from nine."),
  say("g", "marta", "08:44", "Coldbrook closes Thursday from noon."),
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BlockFoldDemo() {
  const [blocked, setBlocked] = React.useState<string[]>([]);
  const [peeks, setPeeks] = React.useState<string[]>([]);

  const ruiBlocked = blocked.includes("rui");
  const folded = THREAD.filter((message) =>
    blocked.includes(message.authorId),
  ).length;
  const showing = THREAD.length - folded;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BlockFold
        label="Coldbrook dispatch"
        members={MEMBERS}
        messages={THREAD}
        blocked={blocked}
        onBlockedChange={setBlocked}
        onPeekChange={(runId, open) =>
          setPeeks((prev) =>
            open ? [...prev, runId] : prev.filter((id) => id !== runId),
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBlocked(ruiBlocked ? [] : ["rui"]);
            setPeeks([]);
          }}
          className={chip}
        >
          {ruiBlocked ? "Unblock Rui" : "Block Rui"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBlocked([]);
            setPeeks([]);
          }}
          disabled={blocked.length === 0}
          className={chip}
        >
          Unblock everyone
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {blocked.length === 0
            ? "nobody blocked"
            : `${blocked.length} blocked`}
        </span>
        {` · ${showing} showing`}
        {folded > 0 ? ` · ${folded} folded` : ""}
        {peeks.length > 0
          ? ` · ${peeks.length} ${peeks.length === 1 ? "peek" : "peeks"}`
          : ""}
      </p>
    </div>
  );
}
