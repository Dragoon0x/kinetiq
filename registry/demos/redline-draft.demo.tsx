"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RedlineDraft } from "@/registry/ui/redline-draft";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "red",
    options: ["red", "blue", "green"],
    names: { red: "Red", blue: "Blue", green: "Green" },
  },
  marks: {
    kind: "choice",
    label: "Marks",
    default: "few",
    options: ["few", "many"],
    names: { few: "Few", many: "Many" },
  },
});

const PHRASES = [
  "Checking the figures",
  "Drafting your summary",
  "Sending it for review",
];

/**
 * Gaugeworks preparing a quarterly report: the status line is drafted and
 * edited while the report is put together, and set clean when it is sent.
 */
export function RedlineDraftDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(true);
  const [index, setIndex] = React.useState(0);

  const report = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · Q3 report
      </p>
      <RedlineDraft
        phrases={PHRASES}
        active={active}
        doneText="Report sent for review"
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{report}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {report}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {active ? (
            <>
              <span className="text-signal">editing</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · strike a weak word
            </>
          ) : (
            <>
              <span className="text-signal">sent</span> · report in review
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setActive((on) => !on)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {active ? "Finish" : "Edit again"}
        </button>
      </div>
    </div>
  );
}
