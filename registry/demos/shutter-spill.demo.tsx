"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultShutterSpillItems,
  ShutterSpill,
} from "@/registry/ui/shutter-spill";

export const tweaks = defineTweaks({
  cadence: {
    kind: "range",
    label: "Cadence",
    default: 8,
    min: 3,
    max: 15,
    step: 1,
    unit: "fps",
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.85,
    min: 0.3,
    max: 1,
    step: 0.05,
  },
  flash: {
    kind: "range",
    label: "Flash",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Darkroom: roll 12, a morning on the coast, fired onto the light
 * table as a burst of contact prints.
 */
export function ShutterSpillDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  const items = defaultShutterSpillItems;
  const n = items.length;
  // A new cadence or flash only shows in a burst, so changing either fires
  // the roll again; the first burst waits for the table to come into view.
  const replay = `${take}:${values.cadence ?? ""}:${values.flash ?? ""}`;
  const [firstReplay] = React.useState(replay);
  // What the table last reported, kept with the take it came from so a new
  // take starts from a loaded camera.
  const [report, setReport] = React.useState<{
    take: string;
    spilled: boolean;
    picked: number | null;
  }>({ take: replay, spilled: false, picked: null });
  const current = report.take === replay;
  const spilled = current && report.spilled;
  const picked = current ? report.picked : null;

  const table = (
    <ShutterSpill
      key={replay}
      items={items}
      trigger={replay === firstReplay ? "inView" : "mount"}
      onSpilledChange={(next) =>
        setReport((r) => ({
          take: replay,
          spilled: next,
          picked: r.take === replay ? r.picked : null,
        }))
      }
      onValueChange={(next) =>
        setReport((r) => ({
          take: replay,
          spilled: r.take === replay ? r.spilled : true,
          picked: next,
        }))
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 520 }}>
        {table}
      </div>
    );
  }

  const held = picked === null ? null : items[picked];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline darkroom · roll 12
          </p>
          <p className="text-sm font-medium text-foreground">
            Morning on the coast
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Fire again
        </button>
      </div>
      <div className="w-full" style={{ height: 420 }}>
        {table}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {held && picked !== null ? (
          <>
            <span className="text-signal">picked</span> · frame {picked + 1} ·{" "}
            {held.caption ?? held.alt}
          </>
        ) : spilled ? (
          <>
            <span className="text-signal">spilled</span> · {n} frames on the
            table
          </>
        ) : (
          <>
            <span className="text-signal">loaded</span> · {n} frames, press the
            camera
          </>
        )}
      </p>
    </div>
  );
}
