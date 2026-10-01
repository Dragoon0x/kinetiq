"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MoonPhase, moonOn } from "@/registry/ui/moon-phase";

export const tweaks = defineTweaks({
  hemisphere: {
    kind: "choice",
    label: "Hemisphere",
    default: "north",
    options: ["north", "south"],
    names: { north: "North", south: "South" },
  },
  detail: { kind: "toggle", label: "Detail", default: true },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** Half past nine on a June night, read in UTC so every render agrees. */
const TONIGHT = Date.UTC(2026, 5, 24, 21, 30);
const DAY = 86_400_000;
const STEP_MS = 60_000;

const relative = (n: number) =>
  n === 0
    ? "tonight"
    : n === 1
      ? "tomorrow"
      : n === -1
        ? "yesterday"
        : n > 0
          ? `in ${n} days`
          : `${-n} days ago`;

/**
 * Fieldline's night-sky card for the Coldbrook Ridge dark-sky camp: how much
 * moon there will be, and when the dark nights come.
 */
export function MoonPhaseDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(TONIGHT);
  const [night, setNight] = React.useState(0);

  // Tonight moves on in real time, a minute at a time, and rests while the
  // page is hidden.
  React.useEffect(() => {
    let timer = 0;
    const start = () => {
      if (!timer) {
        timer = window.setInterval(() => setNow((t) => t + STEP_MS), STEP_MS);
      }
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

  const moon = moonOn(now + night * DAY);

  const widget = (
    <MoonPhase
      label="Moon over Coldbrook Ridge"
      now={now}
      timeZone="UTC"
      value={night}
      onValueChange={setNight}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return widget;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex justify-center">{widget}</div>
      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{relative(night)}</span> ·{" "}
        {moon.phase.toLowerCase()} · {Math.round(moon.lit * 100)}% lit
      </p>
    </div>
  );
}
