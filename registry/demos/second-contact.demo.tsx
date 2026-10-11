"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SecondContact,
  type SecondContactPhase,
  type SecondContactPoint,
} from "@/registry/ui/second-contact";

export const tweaks = defineTweaks({
  corona: {
    kind: "range",
    label: "Corona",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  beads: {
    kind: "range",
    label: "Beads",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 200,
    min: 0,
    max: 360,
    step: 10,
    unit: "°",
  },
});

/** First contact long past: the moon half over the sun. */
const START: SecondContactPoint = { x: -0.95, y: 0.28 };
/** Just off centre: the last bead flaring into the diamond ring. */
const RING: SecondContactPoint = { x: -0.145, y: 0 };

const SAYS: Record<SecondContactPhase, [string, string]> = {
  clear: ["clear", "the sun is clear of the moon"],
  partial: ["partial", "drag the moon onto the sun"],
  beads: ["baily's beads", "the last light breaks into beads"],
  diamond: ["diamond ring", "the inner corona is showing"],
  totality: ["totality", "the corona is out"],
};

/**
 * Waylight Observatory's rehearsal of the eclipse path: it opens on the
 * diamond ring; the visitor drives the moon off and back across the sun.
 */
export function SecondContactDemo({
  chrome = true,
  // The eclipse is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [moon, setMoon] = React.useState<SecondContactPoint>(RING);
  const [phase, setPhase] = React.useState<SecondContactPhase>("diamond");
  const [said, hint] = SAYS[phase];

  const sky = (
    <SecondContact
      label="Waylight eclipse rehearsal"
      value={moon}
      onValueChange={setMoon}
      onPhaseChange={setPhase}
      className={chrome ? "h-[220px]" : "h-[216px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{sky}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {sky}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{said}</span> · {hint}
        </p>
        <button
          type="button"
          onClick={() => setMoon(START)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Start again
        </button>
      </div>
    </div>
  );
}
