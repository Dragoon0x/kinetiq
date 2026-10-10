"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { HaloRings } from "@/registry/ui/halo-rings";

export const tweaks = defineTweaks({
  pulse: {
    kind: "range",
    label: "Pulse",
    default: 1.2,
    min: 0.2,
    max: 3,
    step: 0.2,
    unit: "/s",
  },
  width: {
    kind: "range",
    label: "Width",
    default: 8,
    min: 2,
    max: 20,
    step: 2,
    unit: "px",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "tide",
    options: ["tide", "dusk", "ember", "mono"],
    names: { tide: "Tide", dusk: "Dusk", ember: "Ember", mono: "Mono" },
  },
});

/**
 * Waylight Radio's listening room: the station is on air, and the rings that
 * spread from your cursor are the broadcast going out.
 */
export function HaloRingsDemo({
  chrome = true,
  // The rings are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sent, setSent] = React.useState(0);
  const [near, setNear] = React.useState(false);
  const pulse = values.pulse ?? 1.2;

  const room = (
    <HaloRings
      origin={[0.78, 0.5]}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onRing={() => setSent((n) => n + 1)}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-end gap-3 p-5 sm:p-6"
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
      >
        <div className="max-w-xs">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-danger"
            />
            Waylight Radio · on air
          </p>
          <p className="mt-1 text-xl leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
            Live from the reading room.
          </p>
          {chrome ? (
            <p className="mt-1 text-sm text-ink-2">
              Quiet voices, late records, 88.4 across the valley.
            </p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Listen live
          </button>
        </div>
      </div>
    </HaloRings>
  );

  if (!chrome) return <div className="flex w-full">{room}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sent > 0 ? (
          <>
            <span className="text-signal">
              {sent} bright {sent === 1 ? "ring" : "rings"} sent
            </span>{" "}
            · press again to send another
          </>
        ) : near ? (
          <>
            <span className="text-signal">following you</span> · press to send a
            bright ring
          </>
        ) : (
          <>
            <span className="text-signal">on air</span> · {pulse.toFixed(1)}{" "}
            rings a second under the cursor
          </>
        )}
      </p>
    </div>
  );
}
