"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BeadPit } from "@/registry/ui/bead-pit";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 160,
    min: 40,
    max: 320,
    step: 20,
  },
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "candy",
    options: ["candy", "accent", "pearl", "ember"],
    names: { candy: "Candy", accent: "Accent", pearl: "Pearl", ember: "Ember" },
  },
});

/**
 * Fieldline Beads, glass beads sold by the handful: the shop's hero sits over
 * a pit of them. Sweep through to stir, click to pop a few.
 */
export function BeadPitDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [popped, setPopped] = React.useState(0);
  const [settled, setSettled] = React.useState(true);
  const [stirring, setStirring] = React.useState(false);
  const count = Math.round(values.count ?? 160);

  const onPop = (n: number) => {
    setPopped(n);
    setSettled(false);
  };

  const pit = (
    <BeadPit
      onActiveChange={setStirring}
      onPop={onPop}
      onSettle={() => {
        setSettled(true);
        setPopped(0);
      }}
      sound={sound}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-4 sm:p-5">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Beads
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Every colour, by the handful
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Sorted by hand, sent in cotton bags
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Shop the jars
              </button>
            </>
          ) : null}
        </div>
      </div>
    </BeadPit>
  );

  if (!chrome) return <div className="flex w-full">{pit}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pit}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {popped > 0 ? (
          <>
            <span className="text-signal">popped {popped}</span> · landing
          </>
        ) : stirring ? (
          <>
            <span className="text-signal">stirring</span> · beads rolling
          </>
        ) : (
          <>
            <span className="text-signal">{count} beads</span> ·{" "}
            {settled ? "settled" : "rolling"}
          </>
        )}
      </p>
    </div>
  );
}
