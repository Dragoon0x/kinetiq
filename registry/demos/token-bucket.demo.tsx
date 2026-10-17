"use client";

import * as React from "react";

import { RotateCcw, Zap } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTokenBucketArrivals,
  defaultTokenBucketStart,
  simulateTokenBucket,
  TokenBucket,
  type TokenBucketArrival,
} from "@/registry/ui/token-bucket";

export const tweaks = defineTweaks({
  liquid: {
    kind: "choice",
    label: "Liquid",
    default: "water",
    options: ["water", "flat", "cells"],
    names: { water: "Water", flat: "Flat", cells: "Cells" },
  },
  refillSpeed: {
    kind: "range",
    label: "Refill",
    default: 500,
    min: 100,
    max: 1500,
    step: 100,
    unit: "/s",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const CAPACITY = 30000;
/** The first frame: 2.6 s into the log, a few requests in, the tank nine-tenths full. */
const T0 = 2600;
const TICK_MS = 200;
const LAST_ARRIVAL =
  Math.max(...defaultTokenBucketArrivals.map((a) => a.at)) -
  defaultTokenBucketStart;

type Clock = {
  /** Wall time since the log began, ms. */
  t: number;
  /** Script time: stands still while traffic is paused. */
  script: number;
  paused: boolean;
  /** Each resume shifts the rest of the script by the time spent paused. */
  shifts: { from: number; offset: number }[];
};

const START_CLOCK: Clock = { t: T0, script: T0, paused: false, shifts: [] };

const compact = (n: number) =>
  n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : String(Math.round(n));

/** Five more nightly-eval requests, a beat apart, sized from the burst count. */
const burstAt = (t: number, n: number): TokenBucketArrival[] =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `burst-${n}-${i}`,
    at: defaultTokenBucketStart + t + i * 110,
    tokens: 3000 + ((n * 7 + i * 5) % 6) * 240,
    route: "/v1/batch",
    key: "nightly-evals",
  }));

/**
 * The Waylight API on a team plan, a minute of real-looking traffic: a
 * trickle, the nightly eval job's burst that empties the tank, a queue, a
 * throttle, and the slow refill. The log runs only while the card is on
 * screen and the page is visible, and stops once the tank is full again.
 */
export function TokenBucketDemo({
  chrome = true,
  // The tank is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const refillSpeed = values.refillSpeed ?? tweaks.refillSpeed.default;
  const [clock, setClock] = React.useState<Clock>(START_CLOCK);
  const [extra, setExtra] = React.useState<TokenBucketArrival[]>([]);
  const [bursts, setBursts] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const [inspected, setInspected] = React.useState<string | null>(null);
  const [raised, setRaised] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  const realized = React.useMemo(() => {
    const offsetFor = (rel: number) => {
      let offset = 0;
      for (const s of clock.shifts) if (rel > s.from) offset = s.offset;
      return offset;
    };
    return defaultTokenBucketArrivals
      .filter((a) => a.at - defaultTokenBucketStart <= clock.script)
      .map((a) => ({
        ...a,
        at: a.at + offsetFor(a.at - defaultTokenBucketStart),
      }));
  }, [clock.script, clock.shifts]);

  const capacity = CAPACITY;
  const now = defaultTokenBucketStart + Math.round(clock.t);
  const sim = React.useMemo(
    () =>
      simulateTokenBucket(
        [...realized, ...extra],
        {
          capacity,
          refillSpeed,
          maxQueue: 3,
          throttleMs: 8000,
          start: defaultTokenBucketStart,
          startLevel: capacity,
        },
        now,
      ),
    [realized, extra, capacity, refillSpeed, now],
  );

  const queued = sim.requests.filter((r) => r.status === "queued").length;
  const pendingExtra = extra.some((a) => a.at > now);
  const settled =
    clock.script >= LAST_ARRIVAL &&
    !pendingExtra &&
    queued === 0 &&
    sim.throttledUntil === null &&
    sim.level >= capacity;

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // One clock, only while the panel is seen, the page is visible and the
  // log still has something to do.
  React.useEffect(() => {
    if (!inView || settled) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      if (document.hidden) {
        last = performance.now();
        return;
      }
      const t = performance.now();
      const dt = Math.min(1000, t - last);
      last = t;
      setClock((c) => ({
        ...c,
        t: c.t + dt,
        script: c.paused ? c.script : c.script + dt,
      }));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [inView, settled]);

  const replay = () => {
    setClock(START_CLOCK);
    setExtra([]);
    setBursts(0);
    setInspected(null);
    setRaised(false);
  };

  const panel = (
    <TokenBucket
      capacity={capacity}
      level={sim.level}
      refillSpeed={refillSpeed}
      requests={sim.requests}
      throttledUntil={sim.throttledUntil}
      now={now}
      status={clock.paused ? "paused" : "live"}
      subtitle={`Team plan · ${compact(capacity)} burst · ${compact(refillSpeed * 60)} a minute`}
      onPause={(next) =>
        setClock((c) =>
          next
            ? { ...c, paused: true }
            : {
                ...c,
                paused: false,
                shifts: [
                  ...c.shifts,
                  { from: c.script, offset: c.t - c.script },
                ],
              },
        )
      }
      onRaiseLimit={() => setRaised(true)}
      onInspectRequest={(r) => setInspected(r.id)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full max-w-3xl">
        {panel}
      </div>
    );
  }

  const last = sim.requests[sim.requests.length - 1];
  const shown = inspected ? sim.requests.find((r) => r.id === inspected) : last;
  const retry = sim.throttledUntil
    ? Math.ceil((sim.throttledUntil - now) / 1000)
    : 0;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={wrapRef} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => {
            setExtra((e) => [...e, ...burstAt(Math.round(clock.t), bursts)]);
            setBursts((n) => n + 1);
          }}
        >
          <Zap aria-hidden className="size-3.5" />
          Send burst
        </button>
        <button type="button" className={button} onClick={replay}>
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {`${compact(sim.level)} of ${compact(capacity)}`}
        </span>
        {` · ${queued} queued · ${retry > 0 ? `throttled 0:${String(retry).padStart(2, "0")}` : "clear"}`}
        {shown
          ? ` · ${inspected ? "open" : "last"} ${shown.route} ${compact(shown.tokens)}`
          : ""}
        {raised ? " · raise requested" : ""}
      </p>
    </div>
  );
}
