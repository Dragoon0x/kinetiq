"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlantCare } from "@/registry/ui/plant-care";

export const tweaks = defineTweaks({
  days: {
    kind: "range",
    label: "Days dry",
    default: 5,
    min: 0,
    max: 10,
    step: 1,
  },
  plant: {
    kind: "choice",
    label: "Plant",
    default: "fern",
    options: ["fern", "monstera", "cactus"],
    names: { fern: "Fern", monstera: "Monstera", cactus: "Cactus" },
  },
  pot: {
    kind: "choice",
    label: "Pot",
    default: "clay",
    options: ["clay", "stone", "glaze"],
    names: { clay: "Clay", stone: "Stone", glaze: "Glaze" },
  },
});

const NAMES = {
  fern: "Sill fern",
  monstera: "Hall monstera",
  cactus: "Desk cactus",
} as const;
const EVERY = { fern: 4, monstera: 7, cactus: 10 } as const;

const DAY = 86_400_000;
/** Wednesday 7 October 2026, 09:00 — fixed, so the server and the page agree. */
const START = Date.UTC(2026, 9, 7, 9, 0);
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MO = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const dateOf = (ms: number) => {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};

/**
 * A plant on the kitchen sill in Fernworks, the plant-care app: it was
 * watered five days ago, and each press of "A day passes" lets another day
 * go by.
 */
export function PlantCareDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const fromTweak = values.days ?? tweaks.days.default;
  const [days, setDays] = React.useState(fromTweak);
  const [seen, setSeen] = React.useState(fromTweak);
  const [now, setNow] = React.useState(START);
  // The tweak sets the scene; the Water button and the day button move on
  // from it.
  if (seen !== fromTweak) {
    setSeen(fromTweak);
    setDays(fromTweak);
  }

  const plant = values.plant ?? tweaks.plant.default;
  const name = NAMES[plant];
  const due = EVERY[plant] - days;
  const state =
    days === 0
      ? `watered · next ${dateOf(now + EVERY[plant] * DAY)}`
      : due < 0
        ? `${-due} day${due === -1 ? "" : "s"} overdue`
        : due === 0
          ? "water today"
          : due === 1
            ? "water tomorrow"
            : `${days} day${days === 1 ? "" : "s"} dry · fine`;

  return (
    <div className="flex w-full max-w-80 flex-col items-center gap-4">
      <PlantCare
        {...values}
        name={name}
        days={days}
        onDaysChange={setDays}
        now={now}
        sound={sound}
      />
      {chrome ? (
        <>
          <button
            type="button"
            onClick={() => {
              setDays((d) => d + 1);
              setNow((n) => n + DAY);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            A day passes
          </button>
          <p
            role="status"
            className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{name}</span> · {state}
          </p>
        </>
      ) : null}
    </div>
  );
}
