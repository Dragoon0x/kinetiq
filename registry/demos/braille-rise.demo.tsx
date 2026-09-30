"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BrailleRise } from "@/registry/ui/braille-rise";

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
  emboss: {
    kind: "range",
    label: "Emboss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  cells: { kind: "toggle", label: "Cells", default: true },
});

const PHRASES = ["Reading the scan", "Setting the cells", "Proofing the page"];

/**
 * Basinworks Docs turning a scanned statement into an accessible copy: the
 * status line is embossed before it is printed.
 */
export function BrailleRiseDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [working, setWorking] = React.useState(true);
  const [phrase, setPhrase] = React.useState(0);

  const line = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks Docs · accessible copy
      </p>
      <BrailleRise
        phrases={PHRASES}
        active={working}
        doneText="Accessible copy ready"
        onPhraseChange={setPhrase}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{line}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {line}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {working && phrase >= 0 ? (
            <>
              <span className="text-signal">embossing</span> · {phrase + 1} of{" "}
              {PHRASES.length} · run a finger along the line
            </>
          ) : (
            <>
              <span className="text-signal">ready</span> · copy saved
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setWorking((w) => !w)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {working ? "Finish" : "Prepare again"}
        </button>
      </div>
    </div>
  );
}
