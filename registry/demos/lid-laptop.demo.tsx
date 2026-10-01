"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LidLaptop } from "@/registry/ui/lid-laptop";

export const tweaks = defineTweaks({
  angle: {
    kind: "range",
    label: "Angle",
    default: 110,
    min: 90,
    max: 130,
    step: 5,
    unit: "°",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "space",
    options: ["space", "silver", "midnight"],
    names: { space: "Space", silver: "Silver", midnight: "Midnight" },
  },
  wake: { kind: "toggle", label: "Wake", default: true },
});

/** Cubic metres through the Basin 3 weir, Monday to Sunday. */
const FLOW = [
  { day: "M", v: 0.62 },
  { day: "T", v: 0.71 },
  { day: "W", v: 0.55 },
  { day: "T", v: 0.83 },
  { day: "F", v: 0.94 },
  { day: "S", v: 0.48 },
  { day: "S", v: 0.4 },
];

/** Gaugeworks' weekly flow view, as it would sit on the laptop's screen. */
function FlowScreen() {
  return (
    <div className="flex size-full flex-col gap-1.5 p-2 @min-[18rem]:gap-2.5 @min-[18rem]:p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[9px] font-semibold text-foreground @min-[18rem]:text-[11px]">
          Gaugeworks · Weekly flow
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[8px] text-ink-3 @min-[18rem]:text-[10px]">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-2 bg-surface-2 px-2 py-1">
          <p className="text-[8px] text-ink-3 @min-[18rem]:text-[9px]">
            Through the weir
          </p>
          <p className="font-mono text-[11px] font-medium text-foreground tabular-nums @min-[18rem]:text-sm">
            1,284 m³
          </p>
        </div>
        <div className="rounded-2 bg-surface-2 px-2 py-1">
          <p className="text-[8px] text-ink-3 @min-[18rem]:text-[9px]">
            Gauge uptime
          </p>
          <p className="font-mono text-[11px] font-medium text-foreground tabular-nums @min-[18rem]:text-sm">
            99.2%
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-end gap-1 overflow-clip border-b border-hairline pb-0.5">
        {FLOW.map((d, i) => (
          <div
            key={i}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
          >
            <span
              className={
                i === 4
                  ? "w-full rounded-t-1 bg-cobalt-bright"
                  : "w-full rounded-t-1 bg-cobalt-bright/35"
              }
              style={{ height: `${Math.round(d.v * 80)}%` }}
            />
            <span className="text-[7px] leading-none text-ink-3 @min-[18rem]:text-[9px]">
              {d.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A Gaugeworks report on a laptop that opens as it comes into view. Click it
 * or drag the lid; in chrome, Replay shuts it and opens it again.
 */
export function LidLaptopDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [replay, setReplay] = React.useState(0);

  // Replay shuts the lid, waits for it to land, and lifts it again.
  React.useEffect(() => {
    if (replay === 0) return;
    const timer = window.setTimeout(() => setOpen(true), 1100);
    return () => window.clearTimeout(timer);
  }, [replay]);

  const laptop = (
    <LidLaptop
      label="Gaugeworks laptop"
      open={open}
      onOpenChange={setOpen}
      sound={sound}
      {...values}
    >
      <FlowScreen />
    </LidLaptop>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[304px]">{laptop}</div>;
  }

  const angle = values.angle ?? tweaks.angle.default;
  const wake = values.wake ?? tweaks.wake.default;
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {laptop}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">lid open</span> · {angle}° ·{" "}
              {wake ? "screen awake" : "always lit"}
            </>
          ) : (
            <>
              <span className="text-signal">lid closed</span> · tap or drag to
              open
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReplay((r) => r + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
