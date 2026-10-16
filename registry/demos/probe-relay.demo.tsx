"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultProbeChecks,
  defaultProbeNow,
  defaultProbeStations,
  ProbeRelay,
  probeRun,
  type ProbeCheck,
  type ProbeStatus,
} from "@/registry/ui/probe-relay";

export const tweaks = defineTweaks({
  pathCurve: {
    kind: "range",
    label: "Curve",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pulseSpeed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** A seeded network delay before a run's results come back, per run. */
const delayOf = (run: number) => 420 + ((run * 337) % 5) * 110;

/**
 * Waylight's API probed from six stations. Run now (or R) asks the demo's
 * stand-in runner, which answers after a short seeded delay with seeded
 * latencies; on every third run Basinworks times out.
 */
export function ProbeRelayDemo({
  chrome = true,
  // The runner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [checks, setChecks] = React.useState<ProbeCheck[]>(defaultProbeChecks);
  const [active, setActive] = React.useState(defaultProbeChecks[0]?.id ?? "");
  const [now, setNow] = React.useState(defaultProbeNow);
  const [status, setStatus] = React.useState<ProbeStatus>("ready");
  const [note, setNote] = React.useState<string | null>(null);
  const runs = React.useRef<Record<string, number>>({});
  const clock = React.useRef(defaultProbeNow);
  const timers = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const relay = (
    <ProbeRelay
      checks={checks}
      value={active}
      onValueChange={(id) => {
        setActive(id);
        setNote(null);
      }}
      now={now}
      onRun={(check) => {
        const run = (runs.current[check.id] ?? 0) + 1;
        runs.current[check.id] = run;
        setNote(null);
        timers.current.push(
          window.setTimeout(() => {
            clock.current += 60_000;
            const ranAt = clock.current;
            setNow(ranAt);
            setChecks((list) =>
              list.map((c) =>
                c.id === check.id
                  ? probeRun(c, defaultProbeStations, run + 3, ranAt)
                  : c,
              ),
            );
          }, delayOf(run)),
        );
      }}
      onPause={(check, paused) => {
        setChecks((list) =>
          list.map((c) => (c.id === check.id ? { ...c, paused } : c)),
        );
        setNote(`${paused ? "paused" : "resumed"} · ${check.name}`);
      }}
      onEdit={(check) => setNote(`edit · ${check.method} ${check.path}`)}
      status={status}
      onRetry={() => setStatus("ready")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{relay}</div>;

  const check = checks.find((c) => c.id === active);
  const ok = (check?.results ?? []).filter((r) => r.latency !== null);
  const fastest = [...ok].sort(
    (a, b) => (a.latency ?? 0) - (b.latency ?? 0),
  )[0];
  const fastestName = defaultProbeStations.find(
    (s) => s.id === fastest?.station,
  )?.name;
  const failed = (check?.results.length ?? 0) - ok.length;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {relay}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={status === "loading"}
          onClick={() =>
            setStatus((s) => (s === "loading" ? "ready" : "loading"))
          }
          className={button}
        >
          Loading
        </button>
        <button
          type="button"
          aria-pressed={status === "error"}
          onClick={() => setStatus((s) => (s === "error" ? "ready" : "error"))}
          className={cn(
            button,
            status === "error" &&
              "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail load
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            runs.current = {};
            clock.current = defaultProbeNow;
            setChecks(defaultProbeChecks);
            setActive(defaultProbeChecks[0]?.id ?? "");
            setNow(defaultProbeNow);
            setStatus("ready");
            setNote(null);
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
        {status === "loading" ? (
          <span className="text-signal">loading checks</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">load failed</span> · retry to load
            checks
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : check ? (
          <>
            <span className="text-signal">
              {check.method} {check.path}
            </span>{" "}
            · {defaultProbeStations.length} stations
            {fastest && fastestName
              ? ` · fastest ${fastestName} ${fastest.latency} ms`
              : ""}
            {failed ? ` · ${failed} failed` : ""}
          </>
        ) : null}
      </p>
    </div>
  );
}
