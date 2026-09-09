"use client";

import * as React from "react";

import { ConfidenceChip } from "@/registry/ui/confidence-chip";

/** Fernworks Model 3 in Waylight's help desk, on the Coldbrook ferry timetable. */
const ANSWERS = [
  {
    id: "sailing",
    confidence: 0.91,
    answer:
      "The first Coldbrook sailing leaves at 07:10 on weekdays and 08:40 at weekends.",
    reasoning:
      "The timetable page states both times directly and was updated this season.",
  },
  {
    id: "bikes",
    confidence: 0.67,
    answer:
      "Bikes are carried on the open deck, but only eight at a time on the smaller boat.",
    reasoning:
      "The limit comes from a forum reply that matches the operator's photo, not from the timetable.",
  },
  {
    id: "fare",
    confidence: 0.34,
    answer: "A Sunday return is about 6.50 for a foot passenger.",
    reasoning:
      "The only fare I found is two seasons old and does not say whether Sunday is priced differently.",
  },
];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const toneWord = (confidence: number) =>
  confidence >= 0.8 ? "confident" : confidence < 0.5 ? "low" : "unsure";

export function ConfidenceChipDemo() {
  const [round, setRound] = React.useState(0);
  const [reading, setReading] = React.useState<number | null>(null);
  const [pinned, setPinned] = React.useState<number | null>(null);

  const low = ANSWERS.filter((item) => item.confidence < 0.5).length;
  const read = reading === null ? undefined : ANSWERS[reading];
  const status = read
    ? `Reading answer ${(reading ?? 0) + 1} · ${Math.round(read.confidence * 100)}% · ${toneWord(read.confidence)}${pinned === reading ? " · pinned" : ""}`
    : `${ANSWERS.length} answers · ${low} low · hover a chip`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div key={round} className="flex flex-col gap-3">
        {ANSWERS.map((item, index) => (
          <ConfidenceChip
            key={item.id}
            label={`Answer ${index + 1} of ${ANSWERS.length}`}
            model="Fernworks Model 3"
            answer={item.answer}
            confidence={item.confidence}
            reasoning={item.reasoning}
            onReadChange={(next) =>
              setReading((current) =>
                next ? index : current === index ? null : current,
              )
            }
            onPinChange={(next) =>
              setPinned((current) =>
                next ? index : current === index ? null : current,
              )
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setReading(null);
            setPinned(null);
            setRound((value) => value + 1);
          }}
          className={button}
        >
          Replay
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
