"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQuestionTrailQuestions,
  QuestionTrail,
  type QuestionTrailAnswers,
} from "@/registry/ui/question-trail";

export const tweaks = defineTweaks({
  bubbleStyle: {
    kind: "choice",
    label: "Bubbles",
    default: "soft",
    options: ["soft", "outline", "plain"],
    names: { soft: "Soft", outline: "Outline", plain: "Plain" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
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

/** A leak through the kitchen ceiling, two answers in. */
const START: QuestionTrailAnswers = { trouble: "leak", source: "ceiling" };

const shortOf = (id: string) =>
  defaultQuestionTrailQuestions.find((q) => q.id === id)?.short ?? id;
const labelOf = (id: string, value: string) =>
  value === ""
    ? "skipped"
    : (defaultQuestionTrailQuestions
        .find((q) => q.id === id)
        ?.options?.find((o) => o.value === value)?.label ?? value);

type Event =
  | { kind: "start" }
  | { kind: "answer"; id: string; value: string; count: number }
  | { kind: "rewind"; id: string }
  | { kind: "saved"; count: number }
  | { kind: "complete"; count: number };

/**
 * A Basinworks call-out booked in conversation: a leak, coming through a
 * ceiling, and the next question waiting.
 */
export function QuestionTrailDemo({
  chrome = true,
  // The intake is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event>({ kind: "start" });

  const surface = (
    <QuestionTrail
      key={round}
      defaultValue={START}
      onAnswer={(id, value, answers) =>
        setEvent({
          kind: "answer",
          id,
          value,
          count: Object.keys(answers).length,
        })
      }
      onRewind={(id) => setEvent({ kind: "rewind", id })}
      onSave={(saved) =>
        setEvent({ kind: "saved", count: Object.keys(saved.answers).length })
      }
      onComplete={(answers) =>
        setEvent({ kind: "complete", count: Object.keys(answers).length })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setEvent({ kind: "start" });
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
        {event.kind === "start" ? (
          <>
            <span className="text-signal">2 answered</span> · leak branch ·
            waiting on how soon
          </>
        ) : event.kind === "answer" ? (
          <>
            <span className="text-signal">
              {shortOf(event.id)}: {labelOf(event.id, event.value)}
            </span>{" "}
            · {event.count} kept
          </>
        ) : event.kind === "rewind" ? (
          <>
            <span className="text-signal">rewound to {shortOf(event.id)}</span>{" "}
            · later answers kept
          </>
        ) : event.kind === "saved" ? (
          <>
            <span className="text-signal">saved for later</span> · {event.count}{" "}
            answers
          </>
        ) : (
          <>
            <span className="text-signal">complete</span> · {event.count}{" "}
            answers
          </>
        )}
      </p>
    </div>
  );
}
