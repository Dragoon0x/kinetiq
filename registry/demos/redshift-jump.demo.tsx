"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  RedshiftJump,
  defaultRedshiftDestinations,
  type RedshiftJumpPhase,
} from "@/registry/ui/redshift-jump";

export const tweaks = defineTweaks({
  velocity: {
    kind: "range",
    label: "Velocity",
    default: 0.99,
    min: 0.9,
    max: 0.99,
    step: 0.01,
    unit: "c",
  },
  shift: {
    kind: "range",
    label: "Shift",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Transit's route page: the next jump, held and released from the
 * window itself.
 */
export function RedshiftJumpDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [jumps, setJumps] = React.useState(0);
  const [phase, setPhase] = React.useState<RedshiftJumpPhase>("idle");

  const onValueChange = (next: number) => {
    setIndex(next);
    setJumps((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="flex w-full">
        <RedshiftJump
          className="h-[208px] w-full rounded-3"
          value={index}
          onValueChange={onValueChange}
          onPhaseChange={setPhase}
          sound={sound}
          {...values}
        />
      </div>
    );
  }

  const here = defaultRedshiftDestinations[index]?.name ?? "";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Transit · Next jump
        </p>
        <p className="text-base leading-snug font-semibold text-foreground">
          Hold the window to spin up the drive
        </p>
      </div>
      <RedshiftJump
        className="h-56 w-full rounded-3"
        value={index}
        onValueChange={onValueChange}
        onPhaseChange={setPhase}
        sound={sound}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "charging" ? (
          <>
            <span className="text-signal">building speed</span> · the sky crowds
            ahead
          </>
        ) : phase === "peak" ? (
          <>
            <span className="text-signal">at the peak</span> · let go to jump
          </>
        ) : phase === "jumping" ? (
          <>
            <span className="text-signal">jumping</span> · dropping out
          </>
        ) : jumps > 0 ? (
          <>
            <span className="text-signal">arrived</span> · {here} · jump {jumps}
          </>
        ) : (
          <>
            <span className="text-signal">cruising</span> · press and hold, or
            hold Space
          </>
        )}
      </p>
    </div>
  );
}
