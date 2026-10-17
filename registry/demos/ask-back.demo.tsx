"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AskBack,
  defaultAskBackQuestions,
  type AskBackAnswers,
} from "@/registry/ui/ask-back";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "pill",
    options: ["pill", "tile", "line"],
    names: { pill: "Pill", tile: "Tile", line: "Line" },
  },
  briefPlacement: {
    kind: "choice",
    label: "Brief",
    default: "dock",
    options: ["dock", "top", "side"],
    names: { dock: "Dock", top: "Top", side: "Side" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** The board already named as the audience; three questions still open. */
const START: AskBackAnswers = { audience: { value: "board", label: "Board" } };

const shortOf = (id: string) =>
  (defaultAskBackQuestions.find((q) => q.id === id)?.short ?? id).toLowerCase();
const nextOpen = (answers: AskBackAnswers) =>
  defaultAskBackQuestions.find((q) => !answers[q.id]);

type Event =
  | { kind: "answer"; id: string; label: string; count: number }
  | { kind: "skip"; id: string }
  | { kind: "all"; assumed: number }
  | { kind: "reopen"; id: string }
  | { kind: "complete" }
  | { kind: "sent" };

/**
 * A Basinworks analyst asks for the quarterly report; the assistant asks four
 * things first, and the board is already named as the audience.
 */
export function AskBackDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [answers, setAnswers] = React.useState<AskBackAnswers>(START);
  const [event, setEvent] = React.useState<Event | null>(null);

  const count = (a: AskBackAnswers) =>
    defaultAskBackQuestions.filter((q) => a[q.id]).length;

  const surface = (
    <AskBack
      key={round}
      defaultValue={START}
      onValueChange={setAnswers}
      onAnswer={(id, a, all) =>
        setEvent({ kind: "answer", id, label: a.label, count: count(all) })
      }
      onSkip={(id) => setEvent({ kind: "skip", id })}
      onSkipAll={(all) =>
        setEvent({
          kind: "all",
          assumed: defaultAskBackQuestions.filter((q) => all[q.id]?.assumed)
            .length,
        })
      }
      onBriefEdit={(id) => setEvent({ kind: "reopen", id })}
      onComplete={() => setEvent({ kind: "complete" })}
      onSend={() => setEvent({ kind: "sent" })}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const settled = count(answers);
  const open = nextOpen(answers);

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setAnswers(START);
            setEvent(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event?.kind === "answer" ? (
          <>
            <span className="text-signal">
              {shortOf(event.id)}: {event.label}
            </span>{" "}
            · {event.count} of {defaultAskBackQuestions.length}
          </>
        ) : event?.kind === "skip" ? (
          <>
            <span className="text-signal">skipped {shortOf(event.id)}</span> ·
            answered on its assumption
          </>
        ) : event?.kind === "all" ? (
          <>
            <span className="text-signal">wrote it now</span> · {event.assumed}{" "}
            assumed
          </>
        ) : event?.kind === "reopen" ? (
          <>
            <span className="text-signal">reopened {shortOf(event.id)}</span> ·{" "}
            {settled} of {defaultAskBackQuestions.length} settled
          </>
        ) : event?.kind === "complete" ? (
          <>
            <span className="text-signal">brief complete</span> · writing the
            report
          </>
        ) : event?.kind === "sent" ? (
          <>
            <span className="text-signal">follow-up sent</span> · brief complete
          </>
        ) : (
          <>
            <span className="text-signal">
              {settled} of {defaultAskBackQuestions.length} settled
            </span>
            {open ? ` · waiting on ${shortOf(open.id)}` : " · brief complete"}
          </>
        )}
      </p>
    </div>
  );
}
