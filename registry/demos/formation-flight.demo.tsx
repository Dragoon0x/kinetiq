"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFlockItems,
  FormationFlight,
  type FormationName,
} from "@/registry/ui/formation-flight";

export const tweaks = defineTweaks({
  formation: {
    kind: "choice",
    label: "Formation",
    default: "ring",
    options: ["ring", "spiral", "globe", "grid"],
    names: { ring: "Ring", spiral: "Spiral", globe: "Globe", grid: "Grid" },
  },
  cohesion: {
    kind: "range",
    label: "Cohesion",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bank: {
    kind: "range",
    label: "Bank",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * The field archive of an invented survey team, Gaugeworks: a season's
 * twenty-four frames, shown as one flock that changes shape on cue.
 */
export function FormationFlightDemo({
  chrome = true,
  // The flock is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  formation,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets the formation; the picker can change it until the tweak
  // moves again.
  const [chosen, setChosen] = React.useState<FormationName | null>(null);
  const [seen, setSeen] = React.useState(formation);
  if (formation !== seen) {
    setSeen(formation);
    setChosen(null);
  }
  const shown: FormationName = chosen ?? formation ?? "ring";
  const [picked, setPicked] = React.useState<number | null>(null);

  const flock = (
    <FormationFlight
      formation={shown}
      onFormationChange={setChosen}
      onSelect={setPicked}
      label="Gaugeworks season four, twenty-four frames"
      className={
        chrome
          ? "h-[420px] w-full rounded-4 border border-hairline bg-surface-1"
          : "h-[540px] w-full rounded-4"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{flock}</div>;

  const item = picked !== null ? defaultFlockItems[picked] : undefined;
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Season four, field frames
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks archive
        </p>
      </div>
      {flock}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{shown}</span> · 24 frames
        {item
          ? ` · frame ${String((picked ?? 0) + 1).padStart(2, "0")} chosen, ${item.caption?.toLowerCase()}`
          : " · hover a frame to bring it forward"}
      </p>
    </div>
  );
}
