"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrownWatch } from "@/registry/ui/crown-watch";

export const tweaks = defineTweaks({
  detents: { kind: "toggle", label: "Detents", default: true },
  case: {
    kind: "choice",
    label: "Case",
    default: "steel",
    options: ["steel", "gold", "black"],
    names: { steel: "Steel", gold: "Gold", black: "Black" },
  },
  band: {
    kind: "choice",
    label: "Band",
    default: "sport",
    options: ["sport", "leather", "mesh"],
    names: { sport: "Sport", leather: "Leather", mesh: "Mesh" },
  },
});

/** One row per notch of the crown: the rows are exactly `step` tall. */
const ROW = 32;

const DEPARTURES = [
  { time: "09:52", place: "Harbour", platform: "4", late: "" },
  { time: "09:58", place: "Northgate", platform: "2", late: "" },
  { time: "10:04", place: "Coldbrook", platform: "1", late: "+3" },
  { time: "10:11", place: "Fernworks Halt", platform: "3", late: "" },
  { time: "10:17", place: "Harbour", platform: "4", late: "" },
  { time: "10:23", place: "Basin Quay", platform: "2", late: "" },
  { time: "10:30", place: "Northgate", platform: "2", late: "+6" },
  { time: "10:36", place: "Waylight Junction", platform: "5", late: "" },
  { time: "10:44", place: "Coldbrook", platform: "1", late: "" },
];

/** Fieldline Rail on the wrist: the next departures, a row per notch. */
function DepartureBoard() {
  return (
    <ul role="list" aria-label="Departures" className="flex flex-col">
      {DEPARTURES.map((d) => (
        <li
          key={d.time}
          className="flex flex-col justify-center gap-0.5 border-b border-hairline px-3"
          style={{ height: ROW }}
        >
          <span className="flex items-center justify-between gap-2 font-mono text-[11px] leading-none tabular-nums">
            <span className="text-foreground">{d.time}</span>
            {d.late ? <span className="text-warn">{d.late} min</span> : null}
          </span>
          <span className="truncate text-[10px] leading-tight text-ink-2">
            {d.place} · P{d.platform}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Fieldline Rail's departure board on a watch: turn the crown, swipe the
 * glass or wheel over it, and press the crown to go back to the next train.
 */
export function CrownWatchDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [offset, setOffset] = React.useState(0);
  const first = Math.min(
    DEPARTURES.length - 1,
    Math.max(0, Math.round(offset / ROW)),
  );
  const top = DEPARTURES[first] ?? DEPARTURES[0];

  const watch = (
    <CrownWatch
      label="Fieldline Rail watch"
      title="Departures"
      time="09:47"
      step={ROW}
      value={offset}
      onValueChange={setOffset}
      sound={sound}
      {...values}
    >
      <DepartureBoard />
    </CrownWatch>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[210px]">{watch}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-[240px] self-center">{watch}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {offset === 0 ? (
          <>
            <span className="text-signal">next train on top</span> · turn the
            crown
          </>
        ) : (
          <>
            <span className="text-signal">
              {first} {first === 1 ? "row" : "rows"} down
            </span>{" "}
            · {top?.time} {top?.place} on top
          </>
        )}
      </p>
    </div>
  );
}
