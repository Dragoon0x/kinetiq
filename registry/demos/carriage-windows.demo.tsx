"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CarriageWindows,
  defaultCarriageItems,
} from "@/registry/ui/carriage-windows";

export const tweaks = defineTweaks({
  parallax: {
    kind: "range",
    label: "Parallax",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 22,
    min: 8,
    max: 48,
    step: 2,
    unit: "px",
  },
  radius: {
    kind: "range",
    label: "Radius",
    default: 14,
    min: 2,
    max: 40,
    step: 2,
    unit: "px",
  },
});

/**
 * Waylight Rail's coast line, six stops: the carriage side is the
 * timetable, each window a stop on the way.
 */
export function CarriageWindowsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The second stop first, so the carriage fills the frame from the start.
  const [stop, setStop] = React.useState(1);
  const items = defaultCarriageItems;
  const count = items.length;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <CarriageWindows
          items={items}
          value={stop}
          onValueChange={setStop}
          label="Waylight Rail, the coast line"
          sound={sound}
          className="h-52 w-full"
          {...values}
        />
      </div>
    );
  }

  const button =
    "inline-flex size-8 items-center justify-center rounded-2 border border-hairline bg-surface-1 text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Rail · the coast line
          </p>
          <p className="text-base font-medium text-foreground">
            Six stops, one carriage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous window"
            // Never disabled outright: a button that loses its enabled state
            // while focused would drop focus to the page.
            aria-disabled={stop === 0 || undefined}
            onClick={() => setStop((s) => Math.max(0, s - 1))}
            className={button}
          >
            <ChevronLeft aria-hidden className="size-4 shrink-0" />
          </button>
          <button
            type="button"
            aria-label="Next window"
            aria-disabled={stop === count - 1 || undefined}
            onClick={() => setStop((s) => Math.min(count - 1, s + 1))}
            className={button}
          >
            <ChevronRight aria-hidden className="size-4 shrink-0" />
          </button>
        </div>
      </div>
      <CarriageWindows
        items={items}
        value={stop}
        onValueChange={setStop}
        label="Waylight Rail, the coast line"
        sound={sound}
        className="h-60 w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">window {stop + 1}</span> of {count} ·{" "}
        {items[stop]?.caption ?? items[stop]?.alt}
      </p>
    </div>
  );
}
