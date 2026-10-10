"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrownRays } from "@/registry/ui/crown-rays";

export const tweaks = defineTweaks({
  rays: {
    kind: "range",
    label: "Rays",
    default: 12,
    min: 4,
    max: 24,
    step: 1,
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.5,
    min: 0,
    max: 1,
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

/**
 * Basinworks Summit's invitation: the line stands under a crown of light
 * that swings toward the visitor's hand and breaks into a pulse at a press.
 */
export function CrownRaysDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState(false);
  const [pulses, setPulses] = React.useState(0);
  const [breaking, setBreaking] = React.useState(false);
  const rays = values.rays ?? 12;
  const haze = values.haze ?? 0.5;

  // The pulse has run down the rays by the time this fires; the line says so then.
  React.useEffect(() => {
    if (pulses === 0) return;
    const done = window.setTimeout(() => setBreaking(false), 900);
    return () => window.clearTimeout(done);
  }, [pulses]);

  const crown = (
    <CrownRays
      onActiveChange={setFollowing}
      onPulse={() => {
        setBreaking(true);
        setPulses((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-center justify-end p-5 text-center @lg:p-7">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Basinworks Summit
          </p>
          <p className="mt-1.5 max-w-60 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            See it from above
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Get a seat
              </button>
              <span className="text-xs text-ink-2">
                June 12 · the high hall
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </CrownRays>
  );

  if (!chrome) return <div className="flex w-full">{crown}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {crown}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {breaking ? (
          <>
            <span className="text-signal">light breaks</span> · a pulse down the
            rays
          </>
        ) : following ? (
          <>
            <span className="text-signal">following</span> · the crown swings to
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{rays} rays</span> · haze{" "}
            {haze.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
