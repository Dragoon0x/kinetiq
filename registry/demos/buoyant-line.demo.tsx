"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BuoyantLine } from "@/registry/ui/buoyant-line";

export const tweaks = defineTweaks({
  rise: {
    kind: "range",
    label: "Rise",
    default: 1,
    min: 0.25,
    max: 2.5,
    step: 0.25,
    unit: "em",
  },
  lag: {
    kind: "range",
    label: "Lag",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  range: {
    kind: "range",
    label: "Range",
    default: 0.5,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
});

/**
 * A Basinworks field journal: scrolling the entry brings its headline up out
 * of the water, letter by letter, and scrolling back lets it sink again.
 */
export function BuoyantLineDemo({
  chrome = true,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = React.useState(0);

  const journal = (
    <div className="relative w-full">
      <div
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Basinworks field journal, scrollable"
        className="h-[196px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <div className="flex flex-col gap-3 px-5 pt-4 pb-24">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <span>Basinworks · entry 18</span>
            <span aria-hidden>scroll ↓</span>
          </div>
          <p className="max-w-prose text-sm text-ink-2">
            Morning readings from the north gauges came in level for the third
            day running.
          </p>
          <BuoyantLine
            as="h3"
            text="Still water carries the whole basin"
            scrollContainer={viewport}
            onProgressChange={setProgress}
            {...values}
            className="mt-4 text-[clamp(1.5rem,5.6cqi,2.6rem)] leading-[1.15] font-semibold tracking-[-0.01em] text-balance text-foreground @md:mt-12"
          />
          <p className="max-w-prose text-sm text-ink-2">
            Every gauge we read sits on one reservoir, so a calm week upstream
            is a calm week at every tap downstream. The spillway stays shut.
          </p>
          <p className="max-w-prose text-sm text-ink-2">
            Next readings at dawn. The north gauges report first, then the weir.
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-px bottom-px h-10 rounded-b-3 bg-gradient-to-t from-surface-1 to-transparent"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{journal}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {journal}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {progress >= 1
              ? "surfaced"
              : `rising ${Math.round(progress * 100)}%`}
          </span>{" "}
          · scroll the journal
        </p>
        <button
          type="button"
          onClick={() =>
            viewport.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
