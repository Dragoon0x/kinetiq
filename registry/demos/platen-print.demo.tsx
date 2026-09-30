"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlatenPrint } from "@/registry/ui/platen-print";

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
  pressure: {
    kind: "range",
    label: "Pressure",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "black",
    options: ["black", "red", "blue"],
    names: { black: "Black", red: "Red", blue: "Blue" },
  },
});

const PHRASES = [
  "Printing your lab label",
  "Setting the batch number",
  "Inking the barcode",
];

/**
 * Fieldline Health at the specimen desk: while a sample's label is prepared
 * the status line is struck out on the label printer, and it reads the desk
 * to collect from when it is done.
 */
export function PlatenPrintDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(true);
  const [index, setIndex] = React.useState(0);

  const label = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Health · specimen FH-2207
      </p>
      <PlatenPrint
        phrases={PHRASES}
        active={active}
        doneText="Label ready at desk 3"
        onPhraseChange={setIndex}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{label}</div>;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {label}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {active ? (
            <>
              <span className="text-signal">printing</span> ·{" "}
              {Math.max(1, index + 1)} of {PHRASES.length} · press to strike a
              letter
            </>
          ) : (
            <>
              <span className="text-signal">printed</span> · label ready
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setActive((on) => !on)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {active ? "Finish" : "Print again"}
        </button>
      </div>
    </div>
  );
}
