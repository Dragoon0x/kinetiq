"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRangeDiff,
  defaultRangeThreads,
  RangeRemarks,
  type RangeSelection,
  type RangeThread,
} from "@/registry/ui/range-remarks";

export const tweaks = defineTweaks({
  bracketStyle: {
    kind: "choice",
    label: "Bracket",
    default: "bracket",
    options: ["bracket", "bar", "brace"],
    names: { bracket: "Bracket", bar: "Bar", brace: "Brace" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  editorTheme: {
    kind: "choice",
    label: "Editor",
    default: "plain",
    options: ["plain", "paper", "night"],
    names: { plain: "Plain", paper: "Paper", night: "Night" },
  },
});

/** The visible line number of a diff line, the way the gutter counts it. */
const lineNumber = (index: number) => {
  let n = 0;
  defaultRangeDiff.lines.forEach((l, i) => {
    if (i <= index && l.kind !== "del") n += 1;
  });
  return n;
};
const label = (r: RangeSelection) => {
  const a = lineNumber(r.start);
  const b = lineNumber(r.end);
  return a === b ? `line ${a}` : `lines ${a}–${b}`;
};

/**
 * Pull request #418 on Fieldline's uploader: the retry helper gains a capped,
 * jittered backoff. Three threads: one open with a suggested change, one
 * resolved, one outdated. Drag down the gutter to comment on a span.
 */
export function RangeRemarksDemo({
  chrome = true,
  // The review is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [threads, setThreads] =
    React.useState<RangeThread[]>(defaultRangeThreads);
  const [selection, setSelection] = React.useState<RangeSelection | null>(null);
  const [event, setEvent] = React.useState<string | null>(null);

  const reset = () => {
    setThreads(defaultRangeThreads);
    setSelection(null);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <RangeRemarks
      key={round}
      threads={threads}
      onThreadsChange={setThreads}
      selection={selection}
      onSelectionChange={(next) => {
        setSelection(next);
        setEvent(null);
      }}
      onComment={(range, _text, threadId) =>
        setEvent(
          threadId
            ? `reply on ${label(range)}`
            : `comment on ${label(range)} posted`,
        )
      }
      onSuggest={(range) => setEvent(`suggestion on ${label(range)} posted`)}
      onResolve={(id, resolved) => {
        const t = threads.find((x) => x.id === id);
        setEvent(
          `${t ? label(t) : "thread"} ${resolved ? "resolved" : "reopened"}`,
        );
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const open = threads.filter((t) => !t.resolved).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (selection ? `${label(selection)} selected` : "no lines selected")}
        </span>{" "}
        · {open} open {open === 1 ? "thread" : "threads"}
      </p>
    </div>
  );
}
