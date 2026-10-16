"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultZonePeople,
  ZoneOverlap,
  type ZoneSlot,
} from "@/registry/ui/zone-overlap";

export const tweaks = defineTweaks({
  bandStyle: {
    kind: "choice",
    label: "Band",
    default: "glass",
    options: ["glass", "solid", "outline"],
    names: { glass: "Glass", solid: "Solid", outline: "Outline" },
  },
  hourWidth: {
    kind: "range",
    label: "Hour",
    default: 44,
    min: 28,
    max: 64,
    step: 4,
    unit: "px",
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "cool",
    options: ["cool", "warm", "mono"],
    names: { cool: "Cool", warm: "Warm", mono: "Mono" },
  },
});

const START = 840;
const LENGTH = 45;

const clock = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Minutes on the Lisbon clock for a slot's ms time. */
const lisbon = (ms: number) => {
  const d = new Date(ms + 60 * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/**
 * The Waylight design team's Tuesday: Lisbon, Helsinki, New York and Denver.
 * The band opens at 14:00 in Lisbon, with Denver still asleep; drag it right
 * and it blooms where all five are free.
 */
export function ZoneOverlapDemo({
  chrome = true,
  // The finder is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [start, setStart] = React.useState(START);
  const [length, setLength] = React.useState(LENGTH);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const describe = (slot: ZoneSlot) =>
    `${clock(lisbon(slot.start))}–${clock(lisbon(slot.end))} lisbon · ${
      slot.everyoneFree ? "everyone free" : `${slot.free} of ${slot.total} free`
    }`;

  const finder = (
    <ZoneOverlap
      key={run}
      value={start}
      onValueChange={(v) => {
        setStart(v);
        setNote(null);
      }}
      duration={length}
      onDurationChange={(m) => {
        setLength(m);
        setNote(null);
      }}
      onPick={(slot) => setNote(`picked · ${describe(slot)}`)}
      onSuggest={(slot) => setNote(`suggested · ${describe(slot)}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{finder}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  // The same arithmetic the surface does, for the status line.
  const lisbonOffset = defaultZonePeople[0]?.offset ?? 60;
  const busyFor = defaultZonePeople.filter((p) => {
    for (let m = start; m < start + length; m += 15) {
      const local = (((m + 7 + p.offset - lisbonOffset) % 1440) + 1440) % 1440;
      if (local < p.hours[0] * 60 || local >= p.hours[1] * 60) return true;
      if ((p.busy ?? []).some((b) => local >= b.start && local < b.end)) {
        return true;
      }
    }
    return false;
  });

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {finder}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setStart(START);
            setLength(LENGTH);
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">
              {clock(start)}–{clock(start + length)} lisbon
            </span>{" "}
            ·{" "}
            {busyFor.length === 0
              ? "everyone free"
              : `${defaultZonePeople.length - busyFor.length} of ${defaultZonePeople.length} free`}
          </>
        )}
      </p>
    </div>
  );
}
