"use client";

import * as React from "react";

import {
  DraftPark,
  summariseDraft,
  type ParkedDraft,
} from "@/registry/ui/draft-park";

/** Two briefs the desk keeps swapping between. */
const DRAFT_A =
  "Draft the release note for the Gaugeworks sync fix. Keep it under 120 words and lead with what changed for field crews.";
const DRAFT_B = "List the retry backoff steps with their reasons.";

/** How long the simulated run holds Send before it settles. */
const RUN_MS = 2000;

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Phase = "idle" | "live" | "done";
type Last =
  | { kind: "parked"; text: string }
  | { kind: "restored" | "discarded" | "sent" }
  | null;

export function DraftParkDemo() {
  const [text, setText] = React.useState("");
  const [drafts, setDrafts] = React.useState<ParkedDraft[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [last, setLast] = React.useState<Last>(null);
  const live = phase === "live";

  // The run is a timer, not a clock: it settles after RUN_MS of visible time
  // and waits out any stretch where the tab is hidden.
  React.useEffect(() => {
    if (!live) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPhase("done"), RUN_MS);
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

  const parked = `${drafts.length} parked`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DraftPark
        label="Ask Fernworks Model 3"
        value={text}
        onValueChange={setText}
        drafts={drafts}
        onDraftsChange={setDrafts}
        live={live}
        onPark={(draft) => setLast({ kind: "parked", text: draft.text })}
        onRestore={() => setLast({ kind: "restored" })}
        onDiscard={() => setLast({ kind: "discarded" })}
        onSend={() => {
          setPhase("live");
          setLast({ kind: "sent" });
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setText(DRAFT_A)}
        >
          Paste draft
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setText(DRAFT_B)}
        >
          Paste another
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setText("");
            setDrafts([]);
            setPhase("idle");
            setLast(null);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {live
          ? `Run live · ${parked}`
          : phase === "done" && last?.kind === "sent"
            ? `Done · ${parked} · kept through the run`
            : last?.kind === "parked"
              ? `Parked ${drafts.length} · ${summariseDraft(last.text)}`
              : last?.kind === "restored"
                ? `Restored · ${parked}`
                : last?.kind === "discarded"
                  ? `Discarded · ${parked}`
                  : "No drafts · type, then park"}
      </p>
    </div>
  );
}
