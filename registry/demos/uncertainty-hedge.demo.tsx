"use client";

import * as React from "react";

import {
  UncertaintyHedge,
  type HedgeSegment,
} from "@/registry/ui/uncertainty-hedge";

/** Fernworks Model 3 in Fieldline's dispatch tool, answering two drivers. */
const ANSWERS: { id: string; segments: HedgeSegment[] }[] = [
  {
    id: "van",
    segments: [
      "The Basinworks van should be back on the road ",
      {
        id: "when",
        phrase: "by Thursday",
        why: "The garage said two to three days, and I am counting from the drop-off on Monday.",
      },
      ", assuming the part is ",
      {
        id: "part",
        phrase: "the alternator",
        why: "The fault log only says charging failure, which is usually the alternator but not always.",
      },
      ". Cover for the Tuesday run is ",
      {
        id: "cover",
        phrase: "probably the pool car",
        why: "The pool car is free on Tuesday but nobody has confirmed it can take the crates.",
      },
      ".",
    ],
  },
  {
    id: "depot",
    segments: [
      "The Coldbrook depot ",
      {
        id: "sat",
        phrase: "seems to take Saturday deliveries",
        why: "Their page lists Saturday hours, but the last two Saturday drops were signed for by the neighbouring unit.",
      },
      " until noon, and the gate code is ",
      {
        id: "code",
        phrase: "likely unchanged",
        why: "It was last changed in spring and the driver notes have no newer entry.",
      },
      ".",
    ],
  },
];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function UncertaintyHedgeDemo() {
  const [index, setIndex] = React.useState(0);
  const [hover, setHover] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  const answer = ANSWERS[index] ?? ANSWERS[0];
  const phrases = (answer?.segments ?? []).filter(
    (segment) => typeof segment !== "string",
  );
  const find = (id: string | null) =>
    phrases.find((phrase) => phrase.id === id)?.phrase;
  const openPhrase = find(open);
  const hoverPhrase = find(hover);
  const status = openPhrase
    ? `Why · "${openPhrase}" · ${phrases.length} guesses`
    : hoverPhrase
      ? `Hovering · "${hoverPhrase}"`
      : `${phrases.length} guesses · hover or press one`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {answer ? (
        <UncertaintyHedge
          key={answer.id}
          label="Fernworks Model 3"
          segments={answer.segments}
          open={open}
          onOpenChange={setOpen}
          onHoverChange={setHover}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            setHover(null);
            setIndex((value) => (value + 1) % ANSWERS.length);
          }}
          className={button}
        >
          Next answer
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
