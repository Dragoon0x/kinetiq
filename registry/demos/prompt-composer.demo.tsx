"use client";

import * as React from "react";

import { PromptComposer } from "@/registry/ui/prompt-composer";

/** A three-line brief so the field's growth reads without typing. */
const DRAFT = [
  "Draft the release note for the Gaugeworks sync fix.",
  "Keep it under 120 words, lead with what changed for field crews,",
  "and close with the rollout date.",
].join("\n");

/** How long the simulated run streams before it settles. */
const RUN_MS = 2600;

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Phase =
  | { kind: "idle" }
  | { kind: "streaming"; tokens: number }
  | { kind: "done"; tokens: number }
  | { kind: "stopped" };

export function PromptComposerDemo() {
  const [draft, setDraft] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const live = phase.kind === "streaming";
  const tokens = Math.ceil(draft.trim().length / 4);

  // The run is a timer, not a clock: it settles after RUN_MS of visible time
  // and waits out any stretch where the tab is hidden.
  React.useEffect(() => {
    if (!live) return;
    let timer = 0;
    const settle = () =>
      setPhase((prev) =>
        prev.kind === "streaming"
          ? { kind: "done", tokens: prev.tokens }
          : prev,
      );
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, RUN_MS);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PromptComposer
        label="Ask Fernworks Model 3"
        model="Fernworks Model 3"
        value={draft}
        onValueChange={setDraft}
        live={live}
        onSend={(text) => {
          setPhase({ kind: "streaming", tokens: Math.ceil(text.length / 4) });
          setDraft("");
        }}
        onStop={() => setPhase({ kind: "stopped" })}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setDraft(DRAFT)}
        >
          Paste draft
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setDraft("");
            setPhase({ kind: "idle" });
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase.kind === "streaming"
          ? `Streaming · ${phase.tokens} tokens sent`
          : phase.kind === "done"
            ? `Done · ${phase.tokens} tokens sent`
            : phase.kind === "stopped"
              ? "Stopped · run halted"
              : `Idle · ≈ ${tokens} tokens`}
      </p>
    </div>
  );
}
