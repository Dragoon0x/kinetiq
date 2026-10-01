"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  StandMonitor,
  type StandMonitorOrientation,
} from "@/registry/ui/stand-monitor";

export const tweaks = defineTweaks({
  height: {
    kind: "range",
    label: "Height",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 4,
    min: 0,
    max: 15,
    step: 1,
    unit: "°",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "silver",
    options: ["silver", "black", "white"],
    names: { silver: "Silver", black: "Black", white: "White" },
  },
});

/** Flow through the Basin 3 weir, last seven days, as shares of the week's peak. */
const FLOW = [0.62, 0.71, 0.55, 0.83, 1, 0.48, 0.4];
const GAUGES = [
  { id: "weir", name: "Weir", value: "1.42 m" },
  { id: "sluice", name: "Sluice", value: "0.38 m" },
  { id: "outfall", name: "Outfall", value: "0.91 m" },
];

/** Gaugeworks' basin board: chart and gauges side by side, stacked when tall. */
function BasinBoard() {
  return (
    <div
      className="flex size-full gap-[4cqmin] p-[5cqmin] [@container(orientation:portrait)]:flex-col"
      style={{ fontSize: "max(5px, 6.5cqmin)" }}
    >
      <div className="flex min-w-0 flex-[1.4] flex-col gap-[3cqmin]">
        <div className="flex items-center justify-between gap-[2cqmin]">
          <span className="truncate font-semibold text-foreground">
            Gaugeworks · Basin 3
          </span>
          <span className="flex shrink-0 items-center gap-[1.5cqmin] text-ink-3">
            <span
              aria-hidden
              className="size-[3cqmin] rounded-full bg-success"
            />
            Live
          </span>
        </div>
        <p
          className="font-mono leading-none font-medium text-foreground tabular-nums"
          style={{ fontSize: "1.9em" }}
        >
          1,284 m³
        </p>
        <div className="flex flex-1 items-end gap-[1.6cqmin] border-b border-hairline pb-[1cqmin]">
          {FLOW.map((v, i) => (
            <span
              key={i}
              className={
                i === 4
                  ? "flex-1 rounded-t-[1cqmin] bg-cobalt-bright"
                  : "flex-1 rounded-t-[1cqmin] bg-cobalt-bright/35"
              }
              style={{ height: `${Math.round(v * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <ul
        role="list"
        className="flex min-w-0 flex-1 flex-col justify-center gap-[2cqmin] border-l border-hairline pl-[4cqmin] [@container(orientation:portrait)]:justify-start [@container(orientation:portrait)]:border-t [@container(orientation:portrait)]:border-l-0 [@container(orientation:portrait)]:pt-[4cqmin] [@container(orientation:portrait)]:pl-0"
      >
        {GAUGES.map((g) => (
          <li
            key={g.id}
            className="flex items-baseline justify-between gap-[2cqmin]"
          >
            <span className="truncate text-ink-2">{g.name}</span>
            <span className="shrink-0 font-mono text-foreground tabular-nums">
              {g.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Gaugeworks' basin board on a desk display: lift the screen, push its top
 * back, or turn it to portrait for the long view.
 */
export function StandMonitorDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [orientation, setOrientation] =
    React.useState<StandMonitorOrientation>("landscape");
  // The readings follow the hand; a new tweak value moves them again.
  const tweakHeight = values.height ?? tweaks.height.default;
  const tweakTilt = values.tilt ?? tweaks.tilt.default;
  const [height, setHeight] = React.useState(tweakHeight);
  const [tilt, setTilt] = React.useState(tweakTilt);
  const [seen, setSeen] = React.useState({ h: tweakHeight, t: tweakTilt });
  if (seen.h !== tweakHeight || seen.t !== tweakTilt) {
    setSeen({ h: tweakHeight, t: tweakTilt });
    if (seen.h !== tweakHeight) setHeight(tweakHeight);
    if (seen.t !== tweakTilt) setTilt(tweakTilt);
  }

  const monitor = (
    <StandMonitor
      label="Gaugeworks display"
      orientation={orientation}
      onOrientationChange={setOrientation}
      onHeightChange={setHeight}
      onTiltChange={setTilt}
      sound={sound}
      {...values}
    >
      <BasinBoard />
    </StandMonitor>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[400px]">{monitor}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {monitor}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{orientation}</span> · height{" "}
        {Math.round(height * 100)}% · tilt {tilt}°
      </p>
    </div>
  );
}
