"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SummitSteps } from "@/registry/ui/summit-steps";

export const tweaks = defineTweaks({
  goal: {
    kind: "range",
    label: "Goal",
    default: 10000,
    min: 4000,
    max: 20000,
    step: 500,
    unit: "steps",
  },
  terrain: {
    kind: "choice",
    label: "Terrain",
    default: "alpine",
    options: ["alpine", "desert", "coast"],
    names: { alpine: "Alpine", desert: "Desert", coast: "Coast" },
  },
});

/** 14:20 on an April day, read in UTC so every render agrees. */
const START = Date.UTC(2026, 3, 18, 14, 20);
const MINUTE = 60_000;
/** The day so far: a morning walk, the commute, a lunchtime loop. */
const MORNING = [
  0, 0, 0, 0, 0, 0, 120, 780, 1240, 360, 280, 520, 1460, 640, 380,
];
/** Steps that land in each four-second beat of the demo clock. */
const TRICKLE = [64, 0, 88, 42, 0, 120, 36, 76];
const WALK = 1200;

const NUMBER = new Intl.NumberFormat("en-US");
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

type Day = { now: number; hours: number[]; beat: number };

const addTo = (day: Day, steps: number): number[] => {
  const hour = new Date(day.now).getUTCHours();
  const hours = [...day.hours];
  while (hours.length <= hour) hours.push(0);
  hours[hour] = (hours[hour] ?? 0) + steps;
  return hours;
};

/**
 * Fieldline's step card for today: the walker is wherever the count has got
 * to, and the clock keeps moving while the card is open.
 */
export function SummitStepsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [day, setDay] = React.useState<Day>({
    now: START,
    hours: MORNING,
    beat: 0,
  });
  const [shown, setShown] = React.useState<number | null>(null);

  // Every four seconds a minute passes and a few steps land, until the
  // last minute of the day; the clock rests while the page is hidden.
  React.useEffect(() => {
    let timer = 0;
    const tick = () =>
      setDay((d) => {
        const next = d.now + MINUTE;
        if (new Date(next).getUTCDate() !== new Date(d.now).getUTCDate()) {
          return d;
        }
        const moved = { ...d, now: next };
        return {
          now: next,
          hours: addTo(moved, TRICKLE[d.beat % TRICKLE.length] ?? 0),
          beat: d.beat + 1,
        };
      });
    const start = () => {
      if (!timer) timer = window.setInterval(tick, 4000);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const goal = values.goal ?? tweaks.goal.default;
  const total = day.hours.reduce((sum, n) => sum + n, 0);
  const by =
    shown === null
      ? total
      : day.hours.slice(0, shown).reduce((sum, n) => sum + n, 0);

  const widget = (
    <SummitSteps
      label="Today"
      hours={day.hours}
      now={day.now}
      timeZone="UTC"
      value={shown}
      onValueChange={setShown}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return widget;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex justify-center">{widget}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {shown === null ? (
            <>
              <span className="text-signal">live {clock(day.now)}</span> ·{" "}
              {NUMBER.format(total)} steps · {Math.round((total / goal) * 100)}%
            </>
          ) : (
            <>
              <span className="text-signal">{pad(shown)}:00</span> ·{" "}
              {NUMBER.format(by)} steps · esc for now
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setShown(null);
            setDay((d) => ({ ...d, hours: addTo(d, WALK) }));
          }}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Log a walk
        </button>
      </div>
    </div>
  );
}
