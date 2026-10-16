"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultNumberMatchRequest,
  NumberMatch,
  type NumberMatchRequest,
  type NumberMatchStatus,
} from "@/registry/ui/number-match";

export const tweaks = defineTweaks({
  layout: {
    kind: "choice",
    label: "Layout",
    default: "split",
    options: ["split", "overlap", "mirror"],
    names: { split: "Split", overlap: "Overlap", mirror: "Mirror" },
  },
  numberSize: {
    kind: "range",
    label: "Number",
    default: 56,
    min: 40,
    max: 88,
    step: 8,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Signal",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** The numbers each new request shows, in turn. */
const NUMBERS = [47, 63, 28, 91];

const requestFor = (round: number): NumberMatchRequest =>
  round === 0
    ? defaultNumberMatchRequest
    : {
        ...defaultNumberMatchRequest,
        number: NUMBERS[round % NUMBERS.length] ?? 47,
        choices: undefined,
        time: defaultNumberMatchRequest.time + round * 60_000,
      };

const NOTE: Record<NumberMatchStatus, string> = {
  waiting: "waiting",
  approved: "approved · line drawn",
  blocked: "blocked",
  denied: "denied by you",
  expired: "expired",
};

/**
 * A Fieldline sign-in from a laptop near Porto, approved on Rae's phone. Try
 * the right number, a wrong one, or "No, it's not me"; each new request
 * shows a different number. In the gallery the scene starts over a few
 * seconds after an outcome.
 */
export function NumberMatchDemo({
  chrome = true,
  // The approval is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState(
    `waiting · tap ${defaultNumberMatchRequest.number}`,
  );
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const request = requestFor(round);

  const next = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const r = round + 1;
    setRound(r);
    setNote(`waiting · tap ${requestFor(r).number}`);
  };

  const surface = (
    <NumberMatch
      request={request}
      expiresIn={45_000}
      onStatusChange={(status) => {
        if (status === "waiting") return;
        setNote(NOTE[status]);
        if (!chrome) {
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(next, 4000);
        }
      }}
      onDeny={(_, reason) => {
        if (reason === "mismatch") setNote("blocked · wrong number");
      }}
      onRetry={next}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={next}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          New request
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span> · Fieldline sign-in
      </p>
    </div>
  );
}
