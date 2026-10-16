"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRacks,
  RackElevation,
  type RackSpec,
  type RackStatus,
} from "@/registry/ui/rack-elevation";

export const tweaks = defineTweaks({
  rackCount: {
    kind: "range",
    label: "Racks",
    default: 3,
    min: 1,
    max: 4,
    step: 1,
  },
  ledStyle: {
    kind: "choice",
    label: "Lights",
    default: "dot",
    options: ["dot", "pipe", "ring"],
    names: { dot: "Dot", pipe: "Pipe", ring: "Ring" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "graphite",
    options: ["graphite", "steel", "sand"],
    names: { graphite: "Graphite", steel: "Steel", sand: "Sand" },
  },
});

const LOAD_MS = 1200;

/** A second alert, on a different light, for the "Raise alert" button. */
function withLinkAlert(racks: RackSpec[]): RackSpec[] {
  return racks.map((rack) => ({
    ...rack,
    hosts: rack.hosts.map((h) =>
      h.id === "gw-cache-01"
        ? {
            ...h,
            state: "alert" as const,
            alert: { light: "net" as const, message: "Link flapping on eth1" },
          }
        : h,
    ),
  }));
}

/**
 * Gaugeworks' Basin Hall, row 3: the on-call engineer checks the racks
 * before a deploy. One API worker has a failing fan; Raise alert adds a
 * flapping link on a cache node, so a second single light blinks.
 */
export function RackElevationDemo({
  chrome = true,
  // The elevation is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<RackStatus>("ready");
  const [failLoad, setFailLoad] = React.useState(false);
  const [raised, setRaised] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const racks = React.useMemo(
    () => (raised ? withLinkAlert(defaultRacks) : defaultRacks),
    [raised],
  );

  const load = (fail: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    timer.current = window.setTimeout(
      () => setStatus(fail ? "error" : "ready"),
      LOAD_MS,
    );
  };

  const surface = (
    <RackElevation
      racks={racks}
      selected={selected}
      onSelect={(host) => {
        setSelected(host?.id ?? null);
        setNote(null);
      }}
      onDrain={(host, drained) =>
        setNote(`${host.name} ${drained ? "drained" : "back in rotation"}`)
      }
      onReboot={(host) => setNote(`reboot sent · ${host.name}`)}
      status={status}
      onRetry={() => {
        setFailLoad(false);
        load(false);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const count = Math.max(1, Math.min(racks.length, values.rackCount ?? 3));
  const visible = racks.slice(0, count);
  const hosts = visible.flatMap((r) => r.hosts);
  const alerts = hosts.filter((h) => h.alert).length;
  const open = hosts.find((h) => h.id === selected);

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => load(failLoad)} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failLoad}
          onClick={() => setFailLoad((v) => !v)}
          className={cn(
            button,
            failLoad && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail load
        </button>
        <button
          type="button"
          aria-pressed={raised}
          onClick={() => setRaised((v) => !v)}
          className={cn(
            button,
            raised && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Raise alert
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setSelected(null);
            setStatus("ready");
            setFailLoad(false);
            setRaised(false);
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
          <span className="text-signal">reading the racks</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">load failed</span> · retry to read the
            racks
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : open ? (
          <>
            <span className="text-signal">{open.name} open</span> ·{" "}
            {Math.round(open.temp)} °C · load {Math.round(open.load * 100)}%
          </>
        ) : (
          <>
            <span className="text-signal">
              {count} {count === 1 ? "rack" : "racks"} · {hosts.length} hosts
            </span>{" "}
            · {alerts} {alerts === 1 ? "alert" : "alerts"}
          </>
        )}
      </p>
    </div>
  );
}
