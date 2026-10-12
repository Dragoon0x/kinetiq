"use client";

import * as React from "react";

import { Plus, RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRackDevices,
  freeRuns,
  rackDraw,
  RackElevation,
  type RackDevice,
  type RackMove,
  type RackStatus,
} from "@/registry/ui/rack-elevation";

export const tweaks = defineTweaks({
  face: {
    kind: "choice",
    label: "Face",
    default: "front",
    options: ["front", "rear", "schematic"],
    names: { front: "Front", rear: "Rear", schematic: "Schematic" },
  },
  units: {
    kind: "range",
    label: "Units",
    default: 42,
    min: 12,
    max: 48,
    step: 6,
    unit: "U",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Basinworks' rack C-07 on the morning walk-round: the pump hosts mid-rack,
 * a core switch running warm, and Pump host 3 dark since the small hours.
 */
export function RackElevationDemo({
  chrome = true,
  // The rack is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [devices, setDevices] =
    React.useState<RackDevice[]>(defaultRackDevices);
  const [status, setStatus] = React.useState<RackStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [lastMove, setLastMove] = React.useState<RackMove | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  const spares = React.useRef(0);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <RackElevation height={540} {...values} />
      </div>
    );
  }

  const units = values.units ?? tweaks.units.default;

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const addDevice = () => {
    const run = freeRuns(devices, units).at(-1);
    if (!run) {
      setNote("no free unit");
      return;
    }
    spares.current += 1;
    const n = spares.current;
    const spare: RackDevice = {
      id: `spare-${n}`,
      name: `Spare host ${n}`,
      model: "Coldbrook C1",
      kind: "server",
      bottom: run.bottom + run.height - 1,
      height: 1,
      watts: 180,
      health: "unknown",
      ports: { total: 4, used: 0 },
      feed: "A",
    };
    setDevices((list) => [...list, spare]);
    setNote(`${spare.name} mounted at U${spare.bottom}`);
  };

  const draw = rackDraw(devices);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <RackElevation
        height={560}
        devices={devices}
        onMove={(move, next) => {
          setDevices(next);
          setLastMove(move);
          setNote(null);
        }}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {devices.length} devices · {draw.toLocaleString("en-US")} W
          </span>{" "}
          ·{" "}
          {note
            ? note
            : lastMove
              ? `${devices.find((d) => d.id === lastMove.id)?.name ?? lastMove.id} U${lastMove.from} to U${lastMove.to}`
              : status === "loading"
                ? "loading"
                : status === "error"
                  ? "load failed"
                  : "nothing moved yet"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext((v) => !v)}
            aria-pressed={failNext}
            className={BUTTON}
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Fail next
          </button>
          <button type="button" onClick={reload} className={BUTTON}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            onClick={addDevice}
            aria-disabled={status !== "ready" || undefined}
            className={BUTTON}
          >
            <Plus aria-hidden className="size-3.5" />
            Add device
          </button>
        </div>
      </div>
    </div>
  );
}
