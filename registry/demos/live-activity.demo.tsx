"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LiveActivity,
  type LiveActivityMode,
  type LiveActivityNotice,
} from "@/registry/ui/live-activity";

export const tweaks = defineTweaks({
  stages: {
    kind: "range",
    label: "Stages",
    default: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  mode: {
    kind: "choice",
    label: "Mode",
    default: "courier",
    options: ["courier", "ride", "flight"],
    names: { courier: "Courier", ride: "Ride", flight: "Flight" },
  },
  expand: { kind: "toggle", label: "Expand", default: false },
});

/** A fixed moment, so the server and the first client render agree. */
const START = Date.UTC(2026, 9, 14, 9, 30, 0);
const TRIP = 12 * 60 * 1000;
/** The demo runs ten times faster than the clock on the wall. */
const TICK = 500;
const STEP = 5000;
const REPORT = 5;

const TITLES: Record<LiveActivityMode, string[]> = {
  courier: [
    "Basinworks order 4471",
    "Waylight Pay card",
    "Fernworks parts",
    "Coldbrook statement",
  ],
  ride: [
    "Ride to Coldbrook depot",
    "Ride to Basin Road",
    "Ride to Lot 9",
    "Ride to Fieldline yard",
  ],
  flight: ["Flight FW 208", "Flight GW 91", "Flight FW 214", "Flight BW 17"],
};

type Trip = { id: string; slot: number; start: number; arrival: number };

type Sim = {
  now: number;
  trips: Trip[];
  progress: Record<string, number>;
  made: number;
};

/** Seeded wobble on each report, so the courier is sometimes early, sometimes late. */
const jitter = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.06;
};

const reported = (trip: Trip, at: number, seed: number) => {
  const p = 1 - (trip.arrival - at) / (trip.arrival - trip.start);
  if (p >= 1) return 1;
  return Number(Math.min(0.99, Math.max(0.02, p + jitter(seed))).toFixed(3));
};

const FIRST: Sim = {
  now: START,
  trips: [
    {
      id: "a",
      slot: 0,
      start: START - 0.3 * TRIP,
      arrival: START + 0.7 * TRIP,
    },
    { id: "b", slot: 1, start: START, arrival: START + 2.2 * TRIP },
  ],
  progress: { a: 0.3, b: 0.02 },
  made: 2,
};

/** One more trip, starting now. */
const added = (s: Sim): Sim => {
  const id = `t${s.made}`;
  return {
    ...s,
    made: s.made + 1,
    trips: [
      ...s.trips,
      {
        id,
        slot: s.made % 4,
        start: s.now,
        arrival: s.now + TRIP * (0.8 + (s.made % 3) * 0.3),
      },
    ],
    progress: { ...s.progress, [id]: 0.02 },
  };
};

const without = (s: Sim, id: string): Sim => ({
  ...s,
  trips: s.trips.filter((t) => t.id !== id),
});

/**
 * A Basinworks order on its way, with a Waylight card behind it. The clock
 * runs ten times fast and a new position arrives every few seconds; a
 * delivered order is replaced, so the card never goes still.
 */
export function LiveActivityDemo({
  chrome = true,
  sound,
  mode = "courier",
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sim, setSim] = React.useState<Sim>(FIRST);
  const [onScreen, setOnScreen] = React.useState(true);
  const ticks = React.useRef(0);

  const bind = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      setOnScreen(Boolean(entries[entries.length - 1]?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const send = React.useCallback(() => setSim(added), []);

  // The clock, and a report every few ticks. Nothing runs off screen or in
  // a hidden page.
  React.useEffect(() => {
    if (!onScreen) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      ticks.current += 1;
      const tick = ticks.current;
      setSim((s) => {
        const at = s.now + STEP;
        if (tick % REPORT !== 0) return { ...s, now: at };
        const progress = { ...s.progress };
        s.trips.forEach((trip, i) => {
          progress[trip.id] = Math.max(
            s.progress[trip.id] ?? 0,
            reported(trip, at, tick + i * 7),
          );
        });
        return { ...s, now: at, progress };
      });
    }, TICK);
    return () => window.clearInterval(t);
  }, [onScreen]);

  // A delivered trip leaves after a moment and a new one starts.
  const doneId = sim.trips.find((t) => (sim.progress[t.id] ?? 0) >= 1)?.id;
  React.useEffect(() => {
    if (!doneId) return;
    const t = window.setTimeout(() => {
      setSim((s) => added(without(s, doneId)));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [doneId]);

  const { now, trips, progress } = sim;
  const titles = TITLES[mode] ?? TITLES.courier;
  const notices: LiveActivityNotice[] = trips.map((t) => ({
    id: t.id,
    title: titles[t.slot] ?? titles[0] ?? "",
    progress: progress[t.id] ?? 0,
    arrival: t.arrival,
  }));
  const front = notices[0];
  const left = front?.arrival !== undefined ? front.arrival - now : 0;
  const mins = Math.max(0, Math.round(left / 60000));

  return (
    <div ref={bind} className="flex w-full max-w-2xl flex-col gap-3">
      <LiveActivity
        notices={notices}
        now={now}
        mode={mode}
        onDismiss={(id) => setSim((s) => without(s, id))}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {front ? (
              <>
                <span className="text-signal">{front.title}</span> ·{" "}
                {front.progress >= 1
                  ? "arrived"
                  : `${Math.round(front.progress * 100)}% of the way · ${mins} min left`}
              </>
            ) : (
              <span className="text-signal">nothing on its way</span>
            )}
          </p>
          <button
            type="button"
            onClick={send}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Send one
          </button>
        </div>
      ) : null}
    </div>
  );
}
