"use client";

import * as React from "react";

import { FocusText } from "@/registry/ui/focus-text";
import { cn } from "@/registry/lib/utils";

export type TurnQuote = {
  id: string;
  quote: string;
  name: string;
  role: string;
};

export type TestimonialFocusTurnProps = {
  eyebrow?: string;
  quotes?: TurnQuote[];
  /** Seconds each quote holds before the next resolves in. */
  interval?: number;
  className?: string;
};

const DEFAULT_QUOTES: TurnQuote[] = [
  {
    id: "q1",
    quote: "The queue stopped being a mood and became a fact.",
    name: "R. Okafor",
    role: "Payments desk lead",
  },
  {
    id: "q2",
    quote: "Hard cases land with us while they are still easy.",
    name: "J. Vance",
    role: "Support engineering",
  },
  {
    id: "q3",
    quote: "The routing ledger is the staffing argument now.",
    name: "P. Iyer",
    role: "Head of operations",
  },
];

/**
 * One sentence at a time, resolving from blur: each quote takes the whole
 * stage and pulls into focus word by word on the library's focus instrument,
 * holds long enough to land, then yields. Dots below give the reader the
 * wheel — selecting one stops the clock, because a carousel that fights the
 * reader loses the testimonial's whole point.
 */
export function TestimonialFocusTurn({
  eyebrow = "Switchyard · in their words",
  quotes = DEFAULT_QUOTES,
  interval = 5,
  className,
}: TestimonialFocusTurnProps) {
  const [index, setIndex] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const active = quotes[index % quotes.length];

  React.useEffect(() => {
    if (held || quotes.length < 2) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % quotes.length),
      interval * 1000,
    );
    return () => window.clearInterval(id);
  }, [held, interval, quotes.length]);

  return (
    <section
      aria-label="What customers say"
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20 text-center sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>

        <figure className="mt-8 flex min-h-44 flex-col items-center justify-center sm:min-h-40">
          {active && (
            <React.Fragment key={active.id}>
              <blockquote>
                <FocusText
                  as="p"
                  by="word"
                  trigger="mount"
                  className="text-2xl leading-snug font-semibold tracking-tight text-balance sm:text-4xl"
                >
                  {`“${active.quote}”`}
                </FocusText>
              </blockquote>
              <figcaption className="text-ink-3 mt-6 font-mono text-[11px] tracking-[0.08em] uppercase">
                {active.name} — {active.role}
              </figcaption>
            </React.Fragment>
          )}
        </figure>

        <div role="tablist" aria-label="Quotes" className="mt-10 flex gap-2">
          {quotes.map((quote, i) => (
            <button
              key={quote.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Quote from ${quote.name}`}
              onClick={() => {
                setIndex(i);
                setHeld(true);
              }}
              className={cn(
                "size-2.5 rounded-full transition-colors",
                i === index
                  ? "bg-primary"
                  : "bg-hairline-strong hover:bg-ink-3",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
