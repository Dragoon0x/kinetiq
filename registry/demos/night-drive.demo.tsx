"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NightDrive } from "@/registry/ui/night-drive";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  lanes: {
    kind: "range",
    label: "Lanes",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  colors: {
    kind: "choice",
    label: "Colors",
    default: "sodium",
    options: ["sodium", "neon", "ice", "accent"],
    names: { sodium: "Sodium", neon: "Neon", ice: "Ice", accent: "Accent" },
  },
});

/**
 * Waylight FM, an overnight radio show: its hero sits in the sky over the
 * road home, and holding anywhere on the road puts the foot down.
 */
export function NightDriveDemo({
  chrome = true,
  // The road is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [steering, setSteering] = React.useState(false);
  const [warping, setWarping] = React.useState(false);
  const lanes = Math.round(values.lanes ?? 4);
  const colors = values.colors ?? "sodium";
  const speed = values.speed ?? 1;

  const road = (
    <NightDrive
      onActiveChange={setSteering}
      onWarpChange={setWarping}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-4 sm:p-5">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/80 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight FM · After hours
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Music for the long way home
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Live from midnight to six
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Tune in
              </button>
            </>
          ) : null}
        </div>
      </div>
    </NightDrive>
  );

  if (!chrome) return <div className="flex w-full">{road}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {road}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {warping ? (
          <>
            <span className="text-signal">warp</span> · hold to keep it
          </>
        ) : steering ? (
          <>
            <span className="text-signal">steering</span> · the lanes drift
          </>
        ) : (
          <>
            <span className="text-signal">
              {speed > 0 ? "cruising" : "parked"}
            </span>{" "}
            · {lanes} lanes · {colors}
          </>
        )}
      </p>
    </div>
  );
}
