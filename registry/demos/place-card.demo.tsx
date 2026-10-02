"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlaceCard, defaultPlaceSteps } from "@/registry/ui/place-card";

export const tweaks = defineTweaks({
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 1.8,
    min: 1.2,
    max: 2.8,
    step: 0.1,
    unit: "x",
  },
  route: {
    kind: "choice",
    label: "Route",
    default: "dashes",
    options: ["dashes", "dots", "line"],
    names: { dashes: "Dashes", dots: "Footsteps", line: "Line" },
  },
  hours: {
    kind: "choice",
    label: "Hours",
    default: "24h",
    options: ["24h", "12h"],
    names: { "24h": "24-hour", "12h": "12-hour" },
  },
});

/** Thursday 1 October 2026, 19:46 at the café (UTC). */
const START = Date.UTC(2026, 9, 1, 19, 46);
const OPENS = 7 * 60 + 30;
const CLOSES = 22 * 60;
const STEP_MS = 45 * 60 * 1000;

const span = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/**
 * Fieldline's city guide: Coldbrook Roasters, a short walk away, seen at a
 * fixed evening hour that Later moves on by 45 minutes at a time.
 */
export function PlaceCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(START);
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);

  const date = new Date(now);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const isOpen = minute >= OPENS && minute < CLOSES;
  const left = ((isOpen ? CLOSES : OPENS) - minute + 1440) % 1440;
  const meters = defaultPlaceSteps.reduce((sum, s) => sum + s.meters, 0);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <PlaceCard
        now={now}
        timeZone="UTC"
        opensAt="07:30"
        closesAt="22:00"
        expanded={open}
        onExpandedChange={(next) => {
          setOpen(next);
          if (next) setStep(0);
        }}
        onStepSelect={setStep}
        sound={sound}
        {...values}
        className="self-center"
      />
      {chrome ? (
        <>
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => setNow((t) => t + STEP_MS)}
              className="inline-flex h-8 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Later, +45 min
            </button>
            {now !== START ? (
              <button
                type="button"
                onClick={() => setNow(START)}
                className="inline-flex h-8 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Reset clock
              </button>
            ) : null}
          </div>
          <p
            role="status"
            className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{isOpen ? "open" : "closed"}</span>
            {isOpen
              ? ` · closes in ${span(left)}`
              : ` · opens in ${span(left)}`}
            {open
              ? ` · step ${step + 1} of ${defaultPlaceSteps.length}`
              : ` · ${meters} m walk`}
          </p>
        </>
      ) : null}
    </div>
  );
}
