"use client";

import * as React from "react";

import {
  CatchupScroll,
  type CatchupMessage,
} from "@/registry/ui/catchup-scroll";

const BACKLOG: CatchupMessage[] = (
  [
    ["Ines Moreau", "01:48", "Gate is locked, all of it is on dock two."],
    ["Rui Baptista", "01:55", "Loader keys are on the hook by the office."],
    ["Marta Ferreira", "02:03", "I am off at three, Rui takes the handover."],
    [
      "Ines Moreau",
      "02:14",
      "Pallet 4471 is held, the yard fee has not cleared.",
    ],
    ["Rui Baptista", "02:16", "Paperwork is on the desk under the sheet."],
    [
      "Marta Ferreira",
      "02:31",
      "Dock three is free from nine if the yard needs it.",
    ],
    [
      "Ines Moreau",
      "02:40",
      "Depot closes Thursday from noon, nothing after eleven.",
    ],
    [
      "Rui Baptista",
      "02:52",
      "Yard lights are back on, the north run is clear.",
    ],
  ] as [author: string, time: string, text: string][]
).map(([author, time, text], at) => ({ id: `c${at}`, author, time, text }));

const PACES = [140, 220, 320];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CatchupScrollDemo() {
  const [playing, setPlaying] = React.useState(false);
  const [read, setRead] = React.useState(0);
  const [step, setStep] = React.useState(1);
  const [round, setRound] = React.useState(0);

  const pace = PACES[step] ?? 220;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* Remounting is the reset: a fresh box starts at the top of the
          backlog, which no prop can ask an already-scrolled one to do. */}
      <CatchupScroll
        key={round}
        label="Catch up"
        messages={BACKLOG}
        wordsPerMinute={pace}
        playing={playing}
        onPlayingChange={setPlaying}
        onProgressChange={setRead}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className={chip}
        >
          Slower
        </button>
        <button
          type="button"
          onClick={() => setStep(Math.min(PACES.length - 1, step + 1))}
          disabled={step === PACES.length - 1}
          className={chip}
        >
          Faster
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setRead(0);
            setRound(round + 1);
          }}
          disabled={read === 0 && !playing && round === 0}
          className={chip}
        >
          Back to unread
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {playing ? `reading at ${pace} wpm` : "stopped"}
        </span>
        {` · ${read} of ${BACKLOG.length} read`}
      </p>
    </div>
  );
}
