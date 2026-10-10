"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlasmaRibbon } from "@/registry/ui/plasma-ribbon";

export const tweaks = defineTweaks({
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 72,
    min: 24,
    max: 144,
    step: 8,
    unit: "px",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "ember", "jade", "orchid"],
    names: { cobalt: "Cobalt", ember: "Ember", jade: "Jade", orchid: "Orchid" },
  },
});

/**
 * Basinworks Grid runs a power network: its hero is the current itself, a
 * ribbon of plasma that rises to meet the visitor's hand.
 */
export function PlasmaRibbonDemo({
  chrome = true,
  // The ribbon is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState(false);
  const color = values.color ?? "cobalt";
  const thickness = values.thickness ?? 72;
  const glow = values.glow ?? 0.6;

  const current = (
    <PlasmaRibbon
      onActiveChange={setFollowing}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Grid
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            A steadier current for every street
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Live across four counties
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the network
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PlasmaRibbon>
  );

  if (!chrome) return <div className="flex w-full">{current}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {current}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {following ? (
          <>
            <span className="text-signal">following</span> · the ribbon rises to
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{color}</span> · {thickness} px · glow{" "}
            {glow.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
