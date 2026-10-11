"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { DartCursor } from "@/registry/ui/dart-cursor";

export const tweaks = defineTweaks({
  bank: {
    kind: "range",
    label: "Bank",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "range",
    label: "Size",
    default: 26,
    min: 16,
    max: 44,
    step: 2,
    unit: "px",
  },
  trail: {
    kind: "range",
    label: "Trail",
    default: 1.2,
    min: 0,
    max: 2.5,
    step: 0.1,
    unit: "s",
  },
});

const ghost =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's travel journal: the landing strip's cursor is a folded paper
 * dart that banks through every turn and loops when you circle.
 */
export function DartCursorDemo({
  chrome = true,
  // The dart is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [inside, setInside] = React.useState(false);
  const [loops, setLoops] = React.useState(0);
  const [landed, setLanded] = React.useState(true);

  const strip = (
    <DartCursor
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-60" : "h-52",
      )}
      onLoop={() => setLoops((n) => n + 1)}
      onLand={() => setLanded(true)}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-between gap-3 p-4 sm:p-5"
        onPointerEnter={() => {
          setInside(true);
          setLanded(false);
        }}
        onPointerLeave={() => setInside(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · Travel journal
          </p>
          {chrome ? (
            <nav aria-label="Waylight" className="-mx-3 flex flex-wrap">
              <button type="button" className={ghost}>
                Trips
              </button>
              <button type="button" className={ghost}>
                Maps
              </button>
              <button type="button" className={ghost}>
                Pricing
              </button>
            </nav>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[17rem] text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Every trip, folded into one page.
          </p>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Start a journal
          </button>
        </div>
      </div>
    </DartCursor>
  );

  if (!chrome) return <div className="flex w-full">{strip}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {strip}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {inside ? (
          <>
            <span className="text-signal">flying</span> ·{" "}
            {loops > 0
              ? `${loops} ${loops === 1 ? "loop" : "loops"} so far`
              : "circle fast to loop the loop"}
          </>
        ) : landed ? (
          <>
            <span className="text-signal">landed</span> · point inside, or press
            Tab
          </>
        ) : (
          <>
            <span className="text-signal">gliding in</span> · it lands on its
            own
          </>
        )}
      </p>
    </div>
  );
}
