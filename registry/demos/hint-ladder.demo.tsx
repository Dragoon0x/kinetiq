"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultHintLadderHints, HintLadder } from "@/registry/ui/hint-ladder";

export const tweaks = defineTweaks({
  rungStyle: {
    kind: "choice",
    label: "Rungs",
    default: "card",
    options: ["card", "index", "tape"],
    names: { card: "Card", index: "Index", tape: "Tape" },
  },
  revealHold: {
    kind: "range",
    label: "Hold",
    default: 900,
    min: 400,
    max: 2000,
    step: 100,
    unit: "ms",
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

const total = defaultHintLadderHints.length;

type Event =
  | { kind: "hint"; index: number; teaser: string }
  | { kind: "checked"; right: number; counted: number }
  | { kind: "answer" };

/**
 * A Fieldline surveying student on a levelling exercise, one hint already
 * turned over and a first attempt in the working box.
 */
export function HintLadderDemo({
  chrome = true,
  // The tutor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [used, setUsed] = React.useState(1);
  const [event, setEvent] = React.useState<Event | null>(null);

  const surface = (
    <HintLadder
      key={round}
      defaultValue={1}
      onValueChange={setUsed}
      onRevealHint={(index, hint) =>
        setEvent({ kind: "hint", index, teaser: hint.teaser })
      }
      onAttempt={(_, marks) =>
        setEvent({
          kind: "checked",
          right: marks.filter((m) => m.kind === "right").length,
          counted: marks.filter((m) => m.kind !== "text").length,
        })
      }
      onRevealAnswer={() => setEvent({ kind: "answer" })}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setUsed(1);
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
        {event?.kind === "hint" ? (
          <>
            <span className="text-signal">hint {event.index + 1} turned</span> ·{" "}
            {event.teaser.toLowerCase()} · {used} of {total} used
          </>
        ) : event?.kind === "checked" ? (
          <>
            <span className="text-signal">checked</span> · {event.right} of{" "}
            {event.counted} {event.counted === 1 ? "line" : "lines"} right
          </>
        ) : event?.kind === "answer" ? (
          <>
            <span className="text-signal">answer shown</span> · {used} of{" "}
            {total} hints used first
          </>
        ) : (
          <>
            <span className="text-signal">
              {used} of {total} hints
            </span>{" "}
            · answer held back
          </>
        )}
      </p>
    </div>
  );
}
