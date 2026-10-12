"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BrushedWindows,
  defaultGaugeEvents,
  defaultGaugeNow,
  defaultGaugeWindows,
  type BrushWindow,
} from "@/registry/ui/brushed-windows";

export const tweaks = defineTweaks({
  binSize: {
    kind: "range",
    label: "Bin size",
    default: 6,
    min: 2,
    max: 24,
    step: 2,
    unit: "h",
  },
  frostLevel: {
    kind: "range",
    label: "Frost",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const PERIOD_START = defaultGaugeNow - 30 * 86_400_000;
const TOTAL = defaultGaugeEvents.filter(
  (e) => e.at >= PERIOD_START && e.at < defaultGaugeNow,
).length;

/**
 * Gaugeworks' pressure-line alerts for the last thirty days: two storms are
 * already cut out; drag across the ribbon to cut more.
 */
export function BrushedWindowsDemo({
  chrome = true,
  // The ribbon is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [windows, setWindows] =
    React.useState<BrushWindow[]>(defaultGaugeWindows);
  const [note, setNote] = React.useState<string | null>(null);

  const ribbon = (
    <BrushedWindows
      windows={windows}
      onWindowsChange={(next) => {
        setNote(
          next.length > windows.length
            ? "window cut"
            : next.length < windows.length
              ? "window gone"
              : "window moved",
        );
        setWindows(next);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{ribbon}</div>;

  const inside = defaultGaugeEvents.filter((e) =>
    windows.some((w) => e.at >= w.start && e.at < w.end),
  ).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {ribbon}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setWindows(defaultGaugeWindows);
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
        <span className="text-signal">
          {windows.length} {windows.length === 1 ? "window" : "windows"} ·{" "}
          {inside} of {TOTAL} events
        </span>
        {note ? ` · ${note}` : " · drag the ribbon to cut another"}
      </p>
    </div>
  );
}
