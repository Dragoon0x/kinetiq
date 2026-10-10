"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BeaconPillar } from "@/registry/ui/beacon-pillar";

export const tweaks = defineTweaks({
  width: {
    kind: "range",
    label: "Width",
    default: 90,
    min: 40,
    max: 200,
    step: 10,
    unit: "px",
  },
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 1,
    min: 0.2,
    max: 1.5,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "var(--warn)",
    options: [
      "var(--warn)",
      "var(--accent-bright)",
      "var(--signal)",
      "var(--foreground)",
    ],
    names: {
      "var(--warn)": "Amber",
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--foreground)": "Pearl",
    },
  },
});

const NAMES: Record<string, string> = {
  "var(--warn)": "amber",
  "var(--accent-bright)": "cobalt",
  "var(--signal)": "mint",
  "var(--foreground)": "pearl",
};

type Beat = "standing" | "leaning" | "surge";

/**
 * Fernworks Signal's launch hero: the line stands in the dark beside a
 * pillar of light that leans toward the visitor's hand and surges at a
 * press.
 */
export function BeaconPillarDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [near, setNear] = React.useState(false);
  const [surges, setSurges] = React.useState(0);
  const [surging, setSurging] = React.useState(false);
  const light = NAMES[values.color ?? "var(--warn)"] ?? "amber";

  // The surge has fallen away by the time this fires; the line says so then.
  React.useEffect(() => {
    if (surges === 0) return;
    const done = window.setTimeout(() => setSurging(false), 900);
    return () => window.clearTimeout(done);
  }, [surges]);

  const pillar = (
    <BeaconPillar
      position={0.74}
      onActiveChange={setNear}
      onSurge={() => {
        setSurging(true);
        setSurges((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col justify-center p-5 @lg:p-7">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Fernworks Signal
          </p>
          <p className="mt-1.5 max-w-40 text-lg leading-snug font-semibold text-balance text-foreground @md:max-w-56 @lg:text-xl">
            A light to steer by
          </p>
          {chrome ? (
            <div className="mt-3 flex max-w-60 flex-col items-start gap-2">
              <span className="text-xs text-ink-2">
                Offline charts for every harbour
              </span>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Get the charts
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </BeaconPillar>
  );

  if (!chrome) return <div className="flex w-full">{pillar}</div>;

  const beat: Beat = surging ? "surge" : near ? "leaning" : "standing";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pillar}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {beat === "surge" ? (
          <>
            <span className="text-signal">surge</span> · the motes climb
          </>
        ) : beat === "leaning" ? (
          <>
            <span className="text-signal">leaning</span> · toward your hand
          </>
        ) : (
          <>
            <span className="text-signal">pillar standing</span> · {light} light
          </>
        )}
      </p>
    </div>
  );
}
