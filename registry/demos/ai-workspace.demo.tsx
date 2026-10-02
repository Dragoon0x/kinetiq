"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AiWorkspace,
  defaultAiConversations,
  type AiConversation,
} from "@/registry/ui/ai-workspace";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  pane: {
    kind: "choice",
    label: "Pane",
    default: "split",
    options: ["split", "overlay", "canvas"],
    names: { split: "Split", overlay: "Overlay", canvas: "Canvas" },
  },
  theme: {
    kind: "choice",
    label: "Theme",
    default: "page",
    options: ["page", "light", "dark"],
    names: { page: "Page", light: "Light", dark: "Dark" },
  },
});

/**
 * Rae Okafor's Fieldline assistant on a Friday morning: a payout cut-off
 * policy for Waylight Pay drafted as a document, a retry helper for the
 * Basin exports, and the week's other threads.
 */
export function AiWorkspaceDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [list, setList] = React.useState<AiConversation[]>(
    defaultAiConversations,
  );
  const [openId, setOpenId] = React.useState(defaultAiConversations[0]?.id);
  const [paneOpen, setPaneOpen] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  const reset = () => {
    setRun((r) => r + 1);
    setList(defaultAiConversations);
    setOpenId(defaultAiConversations[0]?.id);
    setPaneOpen(false);
    setNote(null);
  };

  const screen = (
    <AiWorkspace
      key={run}
      onConversationsChange={setList}
      onConversationChange={(id) => {
        setOpenId(id);
        setNote(null);
      }}
      onArtifactOpenChange={setPaneOpen}
      onSend={() => setNote("writing a reply")}
      onStop={() => setNote("reply stopped")}
      onCopy={(_, artifact) => setNote(`copied ${artifact.filename}`)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{screen}</div>;

  const open = list.find((c) => c.id === openId);
  const writing = open?.messages.some((m) => m.status === "streaming");
  const where = open?.title.toLowerCase() ?? "no conversation";
  const what = writing
    ? "writing a reply"
    : note
      ? note
      : paneOpen && open?.artifact
        ? "artifact open"
        : `${list.length} conversations`;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {screen}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{where}</span> · {what}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
