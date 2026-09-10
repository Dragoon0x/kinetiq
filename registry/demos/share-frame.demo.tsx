"use client";

import * as React from "react";

import { ShareFrame, type ShareSource } from "@/registry/ui/share-frame";

const SOURCES: ShareSource[] = [
  { id: "whole-screen", name: "Whole screen", kind: "screen" },
  { id: "dispatch-board", name: "Dispatch board", kind: "board" },
  { id: "order-4471", name: "Order 4471", kind: "window" },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ShareFrameDemo() {
  const [source, setSource] = React.useState("dispatch-board");
  const [sharing, setSharing] = React.useState(false);
  const [viewers, setViewers] = React.useState(2);

  const name =
    SOURCES.find((entry) => entry.id === source)?.name ?? "Whole screen";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ShareFrame
        label="Share your screen to the Coldbrook dispatch call"
        sources={SOURCES}
        sourceId={source}
        onSourceChange={setSource}
        sharing={sharing}
        onSharingChange={setSharing}
        viewers={viewers}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setViewers((n) => n + 1)}
          disabled={viewers >= 6}
          className={chip}
        >
          Someone else watches
        </button>
        <button
          type="button"
          onClick={() => setViewers((n) => Math.max(0, n - 1))}
          disabled={viewers === 0}
          className={chip}
        >
          One drops off
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {sharing ? `Sharing ${name}` : `Not sharing · ${name}`}
        </span>
        {sharing ? ` · ${viewers} watching` : ""}
      </p>
    </div>
  );
}
