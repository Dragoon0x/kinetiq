"use client";

import * as React from "react";

import { SystemPrompt } from "@/registry/ui/system-prompt";

/** The rules the Waylight support desk hands Fernworks Model 3. */
const BASELINE = [
  "You are the Waylight support desk.",
  "Answer in two short paragraphs at most.",
  "Quote the order number back before any change.",
  "Hand off to a person when a refund is over 200.",
].join("\n");

const RULE = "Never promise a delivery date.";

const buttonClass =
  "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function SystemPromptDemo() {
  const [prompt, setPrompt] = React.useState(BASELINE);
  const [open, setOpen] = React.useState(true);
  const [wasReset, setWasReset] = React.useState(false);

  const modified = prompt !== BASELINE;
  const delta = prompt.length - BASELINE.length;
  const status = wasReset
    ? "Reset · baseline"
    : `${open ? "Open" : "Folded"}${
        modified
          ? ` · modified · ${delta >= 0 ? "+" : "−"}${Math.abs(delta)} chars`
          : ` · ${prompt.length} chars`
      }`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SystemPrompt
        value={prompt}
        baseline={BASELINE}
        onValueChange={(next) => {
          setPrompt(next);
          setWasReset(next === BASELINE && prompt !== BASELINE);
        }}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setPrompt(`${prompt}\n${RULE}`);
            setWasReset(false);
          }}
          disabled={prompt.endsWith(RULE)}
        >
          Append rule
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen(!open)}
        >
          {open ? "Fold" : "Unfold"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
