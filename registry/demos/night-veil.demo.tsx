"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NightVeil } from "@/registry/ui/night-veil";

export const tweaks = defineTweaks({
  tone: {
    kind: "choice",
    label: "Tone",
    default: "indigo",
    options: ["indigo", "plum", "teal", "ember"],
    names: { indigo: "Indigo", plum: "Plum", teal: "Teal", ember: "Ember" },
  },
  motion: {
    kind: "range",
    label: "Motion",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  vignette: {
    kind: "range",
    label: "Vignette",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Sleep's evening hero: the line sits straight on a veil that
 * breathes, and a press takes a deep breath with it.
 */
export function NightVeilDemo({
  chrome = true,
  // The veil is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(false);
  const [inhaling, setInhaling] = React.useState(false);
  const tone = values.tone ?? "indigo";
  const still = (values.motion ?? 0.35) === 0;

  const veil = (
    <NightVeil
      onActiveChange={setActive}
      onBreathChange={setInhaling}
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
            Waylight Sleep
          </p>
          <p className="mt-1.5 max-w-56 text-lg leading-snug font-semibold text-balance text-foreground @lg:max-w-72 @lg:text-xl">
            Quiet evenings, kept quiet
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Start tonight
              </button>
              <span className="text-xs text-ink-2">
                Ten-minute wind downs, no streaks
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </NightVeil>
  );

  if (!chrome) return <div className="flex w-full">{veil}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {veil}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {inhaling ? (
          <>
            <span className="text-signal">deep breath</span> · the veil parts
          </>
        ) : active ? (
          <>
            <span className="text-signal">light lifted</span> · the veil thins
          </>
        ) : (
          <>
            <span className="text-signal">
              {still ? "veil still" : "veil breathing"}
            </span>{" "}
            · {tone} undertone
          </>
        )}
      </p>
    </div>
  );
}
