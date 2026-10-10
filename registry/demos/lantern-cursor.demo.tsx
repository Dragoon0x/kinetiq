"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LanternCursor } from "@/registry/ui/lantern-cursor";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 130,
    min: 60,
    max: 220,
    step: 10,
    unit: "px",
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dim: {
    kind: "range",
    label: "Dim",
    default: 0.8,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
});

const STOPS = [
  { name: "Fernworks bridge", km: "0.8 km" },
  { name: "Basin overlook", km: "2.1 km" },
  { name: "Waylight hut", km: "3.4 km" },
];

/**
 * Coldbrook Lodge's night walks: the booking card sits in the dark, and the
 * visitor's lantern is what lights the way through it.
 */
export function LanternCursorDemo({
  chrome = true,
  // The lantern is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [held, setHeld] = React.useState(false);
  const [lit, setLit] = React.useState<string | null>(null);

  const scene = (
    <LanternCursor className="w-full rounded-3" {...values}>
      <div
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHeld(true);
        }}
        onPointerLeave={() => setHeld(false)}
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) {
            setLit(event.target.textContent ?? null);
          }
        }}
        onBlur={() => setLit(null)}
        className="@container rounded-3 border border-hairline bg-card p-5"
      >
        <div className="flex flex-col gap-4 @[30rem]:flex-row @[30rem]:items-end @[30rem]:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Coldbrook Lodge · night walks
            </p>
            <p className="text-xl leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
              Bring a lantern. Leave the map.
            </p>
            <p className="text-sm text-ink-2 @[30rem]:hidden">
              Three stops, 3.4 km, back by ten.
            </p>
            <button
              type="button"
              className="inline-flex h-8 w-fit items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Reserve a walk
            </button>
          </div>
          <ol className="hidden shrink-0 flex-col gap-1.5 @[30rem]:flex">
            {STOPS.map((stop, i) => (
              <li
                key={stop.name}
                className="flex items-center justify-between gap-6 text-sm"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                    0{i + 1}
                  </span>
                  {stop.name}
                </span>
                <span className="font-mono text-xs text-ink-3 tabular-nums">
                  {stop.km}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </LanternCursor>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{scene}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lit ? (
          <>
            <span className="text-signal">lit</span> · {lit}
          </>
        ) : held ? (
          <>
            <span className="text-signal">lantern in hand</span> · it leans the
            way you move
          </>
        ) : (
          <>
            <span className="text-signal">lantern at rest</span> · move over the
            card, or tab to it
          </>
        )}
      </p>
    </div>
  );
}
