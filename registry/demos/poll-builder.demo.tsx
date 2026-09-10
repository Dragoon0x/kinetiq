"use client";

import * as React from "react";

import { PollBuilder, type PollDraft } from "@/registry/ui/poll-builder";

const OPENING: PollDraft = {
  question: "Which slot should Friday's collection take?",
  options: [
    { id: "slot-early", label: "07:00, before the yard fills" },
    { id: "slot-mid", label: "12:30, after the morning run" },
  ],
  multiple: false,
};

/** The demo's own seeded option, so the add always brings the same row. */
const LAST_SLOT = { id: "slot-late", label: "16:45, last slot" };

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PollBuilderDemo() {
  const [draft, setDraft] = React.useState<PollDraft>(OPENING);
  const [posted, setPosted] = React.useState(false);
  const [sent, setSent] = React.useState<PollDraft | null>(null);

  const hasLate = draft.options.some((option) => option.id === LAST_SLOT.id);
  const filled = draft.options.filter(
    (option) => option.label.trim() !== "",
  ).length;
  const needsQuestion = draft.question.trim() === "";
  const ready = !needsQuestion && filled >= 2;

  const addLastSlot = () =>
    setDraft((prev) => ({ ...prev, options: [...prev.options, LAST_SLOT] }));

  const reset = () => {
    setDraft(OPENING);
    setPosted(false);
    setSent(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PollBuilder
        label="Coldbrook depot thread"
        time="14:08"
        value={draft}
        onValueChange={setDraft}
        posted={posted}
        onPostedChange={setPosted}
        onSend={setSent}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={hasLate || posted}
          onClick={addLastSlot}
        >
          Add the last slot
        </button>
        <button type="button" className={chip} onClick={reset}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {posted && sent ? (
          <>
            <span className="text-[var(--signal,var(--primary))]">posted</span>{" "}
            · {sent.options.length} options ·{" "}
            {sent.multiple ? "multiple answers" : "single answer"}
          </>
        ) : (
          <>
            {draft.options.length === 1
              ? "1 option"
              : `${draft.options.length} options`}{" "}
            · {draft.multiple ? "multiple on" : "multiple off"} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {ready
                ? "ready to post"
                : needsQuestion
                  ? "needs a question"
                  : "needs two options"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
