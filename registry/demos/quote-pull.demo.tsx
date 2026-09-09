"use client";

import * as React from "react";

import {
  QuotePull,
  type PullQuote,
  type PullSource,
} from "@/registry/ui/quote-pull";

/** Gaugeworks Reasoner quoting the Basinworks quarterly letter on the dip. */
const SOURCE: PullSource = {
  title: "Basinworks quarterly letter",
  site: "basinworks.example",
  excerpt:
    "North basin's second quarter was the weakest since the yard reopened. Two of the three cranes were down for the same fortnight in May, which the yard had not planned for, and the crews absorbed the gap as overrun rather than lost shifts. The board expects a full recovery in the second half.",
};

const Q1: PullQuote = {
  id: "q1",
  text: "two of the three cranes were down for the same fortnight",
};
const Q2: PullQuote = {
  id: "q2",
  text: "absorbed the gap as overrun rather than lost shifts",
};
const Q3: PullQuote = { id: "q3", text: "the dip will reverse by autumn" };

const ANSWER: (string | PullQuote)[] = [
  "The letter is direct about the cause: ",
  Q1,
  ", and about how the yard coped, since the crews ",
  Q2,
  ". It does not say ",
  Q3,
  "; that is the model's reading of the second-half forecast.",
];

const QUOTES = [Q1, Q2, Q3];
const FOUND = QUOTES.filter((quote) => SOURCE.excerpt.includes(quote.text));

const wordsOf = (id: string) =>
  QUOTES.find((quote) => quote.id === id)?.text.split(/\s+/).length ?? 0;
const readOf = (id: string) =>
  FOUND.some((quote) => quote.id === id)
    ? `${id} · ${wordsOf(id)} words`
    : `${id} · not in source`;

export function QuotePullDemo() {
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);

  const parts = [
    pinned ? `Pinned ${readOf(pinned)}` : null,
    active && active !== pinned ? `Hover ${readOf(active)}` : null,
  ].filter(Boolean);
  const statusText =
    parts.length > 0
      ? parts.join(" · ")
      : `Idle · ${QUOTES.length} quotes · ${QUOTES.length - FOUND.length} not in source`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QuotePull
        label="Answer from Gaugeworks Reasoner"
        answer={ANSWER}
        source={SOURCE}
        pinned={pinned}
        onPinnedChange={setPinned}
        onActiveChange={setActive}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
