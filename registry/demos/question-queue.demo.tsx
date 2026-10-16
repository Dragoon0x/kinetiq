"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQueueQuestions,
  QuestionQueue,
  type QueueQuestion,
} from "@/registry/ui/question-queue";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "soft",
    options: ["soft", "outline", "flat"],
    names: { soft: "Soft", outline: "Outline", flat: "Flat" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
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
      "oklch(from var(--accent-bright) l c 320)": "Iris",
    },
  },
});

/** The first few words of a question, for the status line. */
const gist = (text: string) => {
  const words = text.replace(/[?.!]+$/, "").split(/\s+/);
  return words.length > 5 ? `${words.slice(0, 5).join(" ")}…` : words.join(" ");
};

/**
 * The Coldbrook town hall, forty minutes in. Vote a question up and watch it
 * climb; switch on the host view to answer one and send it to Answered.
 */
export function QuestionQueueDemo({
  chrome = true,
  // The queue is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<QueueQuestion[]>(
    defaultQueueQuestions,
  );
  const [host, setHost] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const queue = (
    <QuestionQueue
      key={run}
      questions={list}
      onQuestionsChange={setList}
      canAnswer={host}
      onUpvote={(q, voted) =>
        setNote(
          `${voted ? "upvoted" : "vote withdrawn"} · ${q.votes} ${q.votes === 1 ? "vote" : "votes"} · ${gist(q.text)}`,
        )
      }
      onAsk={(text, { anonymous }) =>
        setNote(`${anonymous ? "asked anonymously" : "asked"} · ${gist(text)}`)
      }
      onAnswer={(q, answer) =>
        setNote(`${answer ? "answered" : "answered live"} · ${gist(q.text)}`)
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{queue}</div>;

  const open = list.filter((q) => !q.answer).length;
  const answered = list.length - open;
  const votes = list.reduce((sum, q) => sum + q.votes, 0);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {queue}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={host}
          onClick={() => setHost((h) => !h)}
          className={cn(
            button,
            host && "border-hairline-strong text-foreground",
          )}
        >
          {host ? "Host view on" : "Host view off"}
        </button>
        <button
          type="button"
          onClick={() => {
            setList(defaultQueueQuestions);
            setNote(null);
            setHost(true);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {open} open
          </>
        ) : (
          <>
            <span className="text-signal">{open} open</span> · {answered}{" "}
            answered · {votes} votes
          </>
        )}
      </p>
    </div>
  );
}
