"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  MarginPencil,
  type MarginPencilMark,
} from "@/registry/ui/margin-pencil";

export const tweaks = defineTweaks({
  markStyle: {
    kind: "choice",
    label: "Style",
    default: "pencil",
    options: ["pencil", "ink", "marker"],
    names: { pencil: "Pencil", ink: "Ink", marker: "Marker" },
  },
  pencil: {
    kind: "choice",
    label: "Colour",
    default: "red",
    options: ["red", "blue", "graphite", "green"],
    names: { red: "Red", blue: "Blue", graphite: "Graphite", green: "Green" },
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
});

const DRAFT =
  "Our new sensors report every reading the moment it lands, so the whole team sees the same numbers. Setup takes about five minutes, and nothing else on the line needs to change.";

const MARKS: MarginPencilMark[] = [
  { phrase: "every reading", kind: "circle", note: "really every?" },
  { phrase: "whole", kind: "strike" },
  { phrase: "the same numbers", kind: "underline" },
  {
    phrase: "Setup takes about five minutes",
    kind: "bracket",
    note: "prove it",
  },
];

const NOTES = MARKS.filter((mark) => mark.note).length;

/**
 * Gaugeworks' launch note, second draft, back from the editor with her red
 * pencil all over it.
 */
export function MarginPencilDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [drawn, setDrawn] = React.useState(0);
  const [done, setDone] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · launch note · draft 2
      </p>
      <MarginPencil
        key={round}
        text={DRAFT}
        marks={MARKS}
        trigger={round === 0 ? "inView" : "manual"}
        play={round > 0}
        sound={sound}
        onMarkDrawn={() => setDrawn((n) => n + 1)}
        onComplete={() => setDone(true)}
        className="rounded-3 border border-hairline bg-card text-[13px] leading-[1.6] text-foreground @md:text-sm @md:leading-[1.65]"
        {...values}
      />
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {done ? (
              <>
                <span className="text-signal">marked up</span> · {NOTES} notes
              </>
            ) : (
              <>
                <span className="text-signal">
                  {Math.min(drawn, MARKS.length)} of {MARKS.length} marks
                </span>{" "}
                · reading
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setDrawn(0);
              setDone(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Replay
          </button>
        </div>
      ) : null}
    </div>
  );
}
