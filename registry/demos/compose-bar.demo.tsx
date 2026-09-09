"use client";

import * as React from "react";

import { ComposeBar } from "@/registry/ui/compose-bar";

const LINES = [
  "Order 4471 is still on hold at the depot.",
  "Marta, can the morning run take it on Friday?",
  "Two pallets, both shrink-wrapped and labelled.",
  "Dock door 3 is free after nine.",
];

const wordCount = (text: string) =>
  text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ComposeBarDemo() {
  const [draft, setDraft] = React.useState("");
  const [lines, setLines] = React.useState(1);
  const [focused, setFocused] = React.useState(false);
  const [added, setAdded] = React.useState(0);
  const [sent, setSent] = React.useState(0);
  const [attached, setAttached] = React.useState(0);

  const words = wordCount(draft);
  const kept = words > 0 && !focused;

  const addLine = () => {
    const line = LINES[added % LINES.length] ?? "";
    setDraft((prev) => (prev ? `${prev}\n${line}` : line));
    setAdded((n) => n + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ComposeBar
        label="Message Marta"
        value={draft}
        onValueChange={setDraft}
        onLinesChange={setLines}
        onFocusChange={setFocused}
        onSend={() => setSent((n) => n + 1)}
        onAttach={() => setAttached((n) => n + 1)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addLine} className={chip}>
          Add a line
        </button>
        <button
          type="button"
          onClick={() => setDraft("")}
          disabled={draft === ""}
          className={chip}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lines} {lines === 1 ? "line" : "lines"} ·{" "}
        <span className="text-signal">
          {words === 0 ? "empty" : kept ? "draft kept" : `draft ${words} words`}
        </span>{" "}
        · {sent} sent
        {attached > 0 ? ` · ${attached} attached` : ""}
      </p>
    </div>
  );
}
