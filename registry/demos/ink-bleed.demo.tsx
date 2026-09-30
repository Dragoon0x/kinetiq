"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InkBleed } from "@/registry/ui/ink-bleed";

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
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "laid",
    options: ["plain", "laid", "kraft"],
    names: { plain: "Plain", laid: "Laid", kraft: "Kraft" },
  },
});

const PHRASES = [
  "Drafting your letter",
  "Checking the figures",
  "Signing for Coldbrook Bank",
];

/**
 * Coldbrook Bank drafting a letter of credit: the status line writes itself
 * in ink while the letter is prepared, and signs off when it is sent.
 */
export function InkBleedDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(true);
  const [index, setIndex] = React.useState(0);

  const letter = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Bank · letter of credit 0412
      </p>
      <InkBleed
        phrases={PHRASES}
        active={active}
        doneText="Letter signed and sent"
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{letter}</div>;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {letter}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {active ? (
            <>
              <span className="text-signal">writing</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · drag across wet ink
              to blot
            </>
          ) : (
            <>
              <span className="text-signal">signed</span> · letter sent
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setActive((on) => !on)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {active ? "Finish" : "Write again"}
        </button>
      </div>
    </div>
  );
}
