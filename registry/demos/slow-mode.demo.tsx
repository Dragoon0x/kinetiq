"use client";

import * as React from "react";

import { SlowMode } from "@/registry/ui/slow-mode";

const WINDOW = 8;

const LINES = [
  "Pallet 4471 is clear. Waylight Pay released it at eight.",
  "Dock three is free from nine if the yard needs it.",
  "Coldbrook closes Thursday from noon. Nothing leaves after eleven.",
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function SlowModeDemo() {
  const [draft, setDraft] = React.useState("");
  const [left, setLeft] = React.useState(0);
  const [sent, setSent] = React.useState(0);
  const [line, setLine] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SlowMode
        label="Message the Coldbrook depot room"
        interval={WINDOW}
        value={draft}
        onValueChange={setDraft}
        onRemainingChange={setLeft}
        onSend={() => setSent((count) => count + 1)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft(LINES[line % LINES.length] ?? "");
            setLine((index) => index + 1);
          }}
          className={chip}
        >
          Type a line
        </button>
        <button
          type="button"
          onClick={() => setDraft("")}
          disabled={draft === ""}
          className={chip}
        >
          Clear the draft
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {left > 0 ? `held ${left}s of ${WINDOW}s` : "awake"}
        </span>
        {` · draft ${draft.length} ${draft.length === 1 ? "char" : "chars"}`}
        {` · ${sent} sent`}
      </p>
    </div>
  );
}
