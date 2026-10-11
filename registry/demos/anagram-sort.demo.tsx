"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AnagramSort } from "@/registry/ui/anagram-sort";

export const tweaks = defineTweaks({
  method: {
    kind: "choice",
    label: "Method",
    default: "pairs",
    options: ["pairs", "place", "sweep"],
    names: { pairs: "Pairs", place: "In place", sweep: "Sweep" },
  },
  swapSpeed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2.5,
    step: 0.1,
    unit: "×",
  },
  arcHeight: {
    kind: "range",
    label: "Arc",
    default: 0.55,
    min: 0.1,
    max: 1,
    step: 0.05,
    unit: "em",
  },
});

const HEADLINE = "Sorted before you wake";

/**
 * Fieldline Mail's overnight filing: the headline arrives as a jumble and
 * sorts itself while the card is in view; a changed tweak, the Shuffle
 * button or a press on the headline sorts it again.
 */
export function AnagramSortDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [home, setHome] = React.useState({ count: 0, total: 0 });
  const [sorted, setSorted] = React.useState(false);
  const replayKey = [
    values.method ?? "",
    values.swapSpeed ?? "",
    values.arcHeight ?? "",
    run,
  ].join("|");

  const card = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Mail · overnight
      </p>
      <AnagramSort
        as="h2"
        text={HEADLINE}
        replayKey={replayKey}
        sound={sound}
        onProgress={(count, total) => {
          setHome({ count, total });
          if (count < total) setSorted(false);
        }}
        onComplete={() => setSorted(true)}
        {...values}
        className="text-[clamp(1.625rem,7.2cqi,3.25rem)] leading-[1.1] font-semibold tracking-[-0.015em] text-foreground"
      />
      <p className="text-sm text-ink-2">
        Receipts, travel and newsletters, filed by the time the coffee is ready.
      </p>
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{card}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {card}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {sorted ? (
            <>
              <span className="text-signal">sorted</span> · press the headline
              to shuffle it
            </>
          ) : (
            <>
              <span className="text-signal">sorting</span> · {home.count} of{" "}
              {home.total} {home.total === 1 ? "letter" : "letters"} home
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Shuffle
        </button>
      </div>
    </div>
  );
}
