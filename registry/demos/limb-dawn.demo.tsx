"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LimbDawn, type LimbDawnPhase } from "@/registry/ui/limb-dawn";

export const tweaks = defineTweaks({
  curvature: {
    kind: "range",
    label: "Curvature",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  atmosphere: {
    kind: "range",
    label: "Atmosphere",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  flare: {
    kind: "range",
    label: "Flare",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const SAID: Record<LimbDawnPhase, [string, string]> = {
  night: ["night", "the limb in shadow"],
  airglow: ["airglow", "the air turns blue"],
  crest: ["crest", "a pinpoint on the limb"],
  ring: ["ring of light", "the sun breaks the edge"],
  dawn: ["dawn", "a thin amber band"],
};

/**
 * Waylight's launch hero: the line stands over the night side of the world
 * while the sun comes up behind it, once, the first time it is seen.
 */
export function LimbDawnDemo({
  chrome = true,
  // The dawn is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [phase, setPhase] = React.useState<LimbDawnPhase>("night");
  const [said, detail] = SAID[phase];

  const hero = (
    <div
      className={
        chrome
          ? "h-64 w-full overflow-clip rounded-3 border border-hairline"
          : "h-52 w-full overflow-clip rounded-3 border border-hairline"
      }
    >
      <LimbDawn
        key={run}
        eyebrow="Waylight · orbit two"
        headline="Waylight"
        onPhaseChange={setPhase}
        {...values}
      >
        {chrome ? (
          <p className="max-w-64 text-xs text-balance text-ink-2">
            Maps of the night side, refreshed every pass.
          </p>
        ) : null}
      </LimbDawn>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{said}</span> · {detail}
        </p>
        <button
          type="button"
          onClick={() => {
            setPhase("night");
            setRun((n) => n + 1);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay the dawn
        </button>
      </div>
    </div>
  );
}
