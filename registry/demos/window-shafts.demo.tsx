"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WindowShafts } from "@/registry/ui/window-shafts";

export const tweaks = defineTweaks({
  angle: {
    kind: "range",
    label: "Angle",
    default: 38,
    min: 20,
    max: 70,
    step: 1,
    unit: "°",
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dust: {
    kind: "range",
    label: "Dust",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const LIGHT = (warmth: number) =>
  warmth > 0.66 ? "amber light" : warmth > 0.33 ? "warm light" : "daylight";

/**
 * Waylight Rooms, a small hotel facing west: the line sits in the shade of
 * a wall the late sun crosses, and the visitor's hand moves the sun.
 */
export function WindowShaftsDemo({
  chrome = true,
  // The room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [moving, setMoving] = React.useState(false);
  const [stirs, setStirs] = React.useState(0);
  const [stirred, setStirred] = React.useState(false);
  const angle = values.angle ?? 38;
  const warmth = values.warmth ?? 0.6;

  // The dust has settled by the time this fires; the line says so then.
  React.useEffect(() => {
    if (stirs === 0) return;
    const done = window.setTimeout(() => setStirred(false), 1100);
    return () => window.clearTimeout(done);
  }, [stirs]);

  const room = (
    <WindowShafts
      onActiveChange={setMoving}
      onStir={() => {
        setStirred(true);
        setStirs((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        {/* Bottom left: the wall below the beams stays in shade. */}
        <div className="flex size-full flex-col justify-end p-5 @lg:p-7">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Waylight Rooms
          </p>
          <p className="mt-1.5 max-w-44 text-lg leading-snug font-semibold text-balance text-foreground @lg:max-w-56 @lg:text-xl">
            The light comes in at four
          </p>
          {chrome ? (
            <div className="mt-3 flex max-w-60 flex-col items-start gap-2">
              <span className="text-xs text-ink-2">
                Twelve rooms facing west
              </span>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the rooms
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </WindowShafts>
  );

  if (!chrome) return <div className="flex w-full">{room}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stirred ? (
          <>
            <span className="text-signal">dust stirred</span> · it glints in the
            beams
          </>
        ) : moving ? (
          <>
            <span className="text-signal">moving the sun</span> · the bars drift
          </>
        ) : (
          <>
            <span className="text-signal">sun at {angle}°</span> ·{" "}
            {LIGHT(warmth)}
          </>
        )}
      </p>
    </div>
  );
}
