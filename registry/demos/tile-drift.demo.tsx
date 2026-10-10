"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TileDrift } from "@/registry/ui/tile-drift";

export const tweaks = defineTweaks({
  rows: {
    kind: "range",
    label: "Rows",
    default: 4,
    min: 2,
    max: 7,
    step: 1,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 14,
    min: 0,
    max: 30,
    step: 1,
    unit: "°",
  },
});

type Hand =
  { kind: "rest" } | { kind: "stir" } | { kind: "throw"; row: number };

/**
 * Waylight Prints, a weekly print shop: the week's editions drift past on a
 * wall behind the announcement, and a visitor can throw a row along.
 */
export function TileDriftDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState<Hand>({ kind: "rest" });
  const rows = values.rows ?? 4;
  const speed = values.speed ?? 1;
  const motionSafe = useMotionSafe();

  const wall = (
    <TileDrift
      gap={chrome ? 10 : 8}
      onActiveChange={(active) =>
        setHand((h) =>
          active
            ? h.kind === "throw"
              ? h
              : { kind: "stir" }
            : { kind: "rest" },
        )
      }
      onFling={(row) => setHand({ kind: "throw", row: row + 1 })}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline bg-surface-1"
          : "h-52 rounded-3 border border-hairline bg-surface-1"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Prints
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            New prints every Friday
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                48 editions · signed and numbered
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Browse the wall
              </button>
            </>
          ) : null}
        </div>
      </div>
    </TileDrift>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {wall}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hand.kind === "throw" ? (
          <>
            <span className="text-signal">row {hand.row} thrown</span> · it
            rejoins the drift
          </>
        ) : hand.kind === "stir" ? (
          <>
            <span className="text-signal">rows surging</span> · easing back
          </>
        ) : (
          <>
            <span className="text-signal">
              {rows} {rows === 1 ? "row" : "rows"}
            </span>{" "}
            · {speed > 0 && motionSafe ? "drifting" : "held still"}
          </>
        )}
      </p>
    </div>
  );
}
