"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LetterField } from "@/registry/ui/letter-field";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  words: {
    kind: "choice",
    label: "Words",
    default: "studio",
    options: ["studio", "garden", "harbor", "none"],
    names: {
      studio: "Studio",
      garden: "Garden",
      harbor: "Harbor",
      none: "None",
    },
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "ink",
    options: ["ink", "accent", "signal", "ember"],
    names: { ink: "Ink", accent: "Accent", signal: "Signal", ember: "Ember" },
  },
});

/**
 * Fieldline Journal, a magazine for slow reading: the masthead sits on a
 * page of letters that keep rearranging, and words worth stopping for
 * surface out of it.
 */
export function LetterFieldDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [calm, setCalm] = React.useState(false);
  const [latest, setLatest] = React.useState<{ word: string; count: number }>({
    word: "",
    count: 0,
  });
  const rate = values.rate ?? 1;

  const field = (
    <LetterField
      size={chrome ? 15 : 14}
      onActiveChange={setCalm}
      onWord={(word) => setLatest((l) => ({ word, count: l.count + 1 }))}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Journal
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Words worth slowing down for
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Issue 14 · eleven long reads
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Start reading
              </button>
            </>
          ) : null}
        </div>
      </div>
    </LetterField>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {calm ? (
          <>
            <span className="text-signal">calm under your hand</span> · the
            letters hold
          </>
        ) : latest.count > 0 ? (
          <>
            <span className="text-signal">“{latest.word}” surfaced</span> ·{" "}
            {latest.count} {latest.count === 1 ? "word" : "words"}
          </>
        ) : rate > 0 ? (
          <>
            <span className="text-signal">field shifting</span> · rate{" "}
            {rate.toFixed(1)}
          </>
        ) : (
          <>
            <span className="text-signal">field held</span> · move over it
          </>
        )}
      </p>
    </div>
  );
}
