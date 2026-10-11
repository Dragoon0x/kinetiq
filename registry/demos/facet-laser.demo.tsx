"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FacetLaser } from "@/registry/ui/facet-laser";

export const tweaks = defineTweaks({
  beamCount: {
    kind: "range",
    label: "Beams",
    default: 9,
    min: 3,
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
  cooling: {
    kind: "range",
    label: "Cooling",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const FACETS = 8;

/**
 * Basinworks Optics' bench: one beam into a cut crystal, a crown of beams
 * out, and the walls of the test room keeping a cooling record of every turn.
 */
export function FacetLaserDemo({
  chrome = true,
  // The bench is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(0);
  const [turning, setTurning] = React.useState(false);
  const beams = values.beamCount ?? 9;
  const facet = (Math.round(angle / (360 / FACETS)) % FACETS) + 1;

  const room = (
    <div
      className={
        chrome
          ? "h-64 w-full overflow-clip rounded-3 border border-hairline"
          : "h-52 w-full overflow-clip rounded-3 border border-hairline"
      }
    >
      <FacetLaser
        facets={FACETS}
        label="Crystal, turned by facet"
        onAngleChange={setAngle}
        onTurningChange={setTurning}
        {...values}
      >
        {chrome ? (
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Basinworks Optics · bench 4
          </p>
        ) : null}
      </FacetLaser>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{room}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {turning ? (
          <>
            <span className="text-signal">turning</span> · the walls take the
            light
          </>
        ) : (
          <>
            <span className="text-signal">
              facet {facet} of {FACETS}
            </span>{" "}
            · {angle}° · {beams} beams
          </>
        )}
      </p>
    </div>
  );
}
