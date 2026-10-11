"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SerpentinePop } from "@/registry/ui/serpentine-pop";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "party",
    options: ["party", "sorbet", "gilt", "mono"],
    names: { party: "Party", sorbet: "Sorbet", gilt: "Gilt", mono: "Mono" },
  },
  rate: {
    kind: "range",
    label: "Rate",
    default: 5,
    min: 1,
    max: 12,
    step: 1,
    unit: "/s",
  },
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline's 2.0 launch: the release hero throws paper as you move over it,
 * and every click is a popper.
 */
export function SerpentinePopDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pops, setPops] = React.useState(0);

  const hero = (
    <SerpentinePop
      label="Fieldline launch popper"
      sound={sound}
      onPop={setPops}
      className="h-52 w-full rounded-3 border border-hairline bg-card"
      {...values}
    >
      <div className="@container flex size-full flex-col items-center justify-center gap-1.5 px-6 pb-7 text-center">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · release 2.0
        </p>
        <p className="text-[clamp(1.375rem,6.5cqi,2rem)] leading-tight font-semibold tracking-tight text-balance text-foreground">
          Fieldline 2.0 is live
        </p>
        <p className="max-w-[34ch] text-sm text-balance text-ink-2">
          Shared boards, offline sync and a calmer inbox.
        </p>
        {chrome ? (
          <button
            type="button"
            className="mt-1.5 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Read the notes
          </button>
        ) : null}
      </div>
    </SerpentinePop>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pops === 0 ? (
          <>
            <span className="text-signal">move to throw streamers</span> · click
            to pop
          </>
        ) : (
          <>
            <span className="text-signal">popper {pops}</span> · paper settling
            on the floor
          </>
        )}
      </p>
    </div>
  );
}
