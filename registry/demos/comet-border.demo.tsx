"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CometBorder } from "@/registry/ui/comet-border";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 140,
    min: 40,
    max: 400,
    step: 20,
    unit: "px/s",
  },
  tail: {
    kind: "range",
    label: "Tail",
    default: 160,
    min: 40,
    max: 400,
    step: 20,
    unit: "px",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "mint", "amber", "ink"],
    names: { cobalt: "Cobalt", mint: "Mint", amber: "Amber", ink: "Ink" },
  },
});

const FEATURES = ["Live telemetry from every rig", "Alerts within a second"];

/**
 * Gaugeworks' new Pro plan, announced on its pricing page: the card's frame
 * carries a comet, and pointing at it (or tabbing in) lights a second one.
 */
export function CometBorderDemo({
  chrome = true,
  // The comet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [laps, setLaps] = React.useState(0);
  const [hot, setHot] = React.useState(false);
  const [crossings, setCrossings] = React.useState(0);

  const card = (
    <CometBorder
      className="w-full rounded-4 bg-card"
      onLap={setLaps}
      onCross={() => setCrossings((n) => n + 1)}
      {...values}
    >
      <div
        className="flex flex-col gap-3 p-4 sm:p-5"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHot(true);
        }}
        onPointerLeave={() => setHot(false)}
        onFocus={(event) => setHot(event.target.matches(":focus-visible"))}
        onBlur={() => setHot(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Pro
          </p>
          <span className="rounded-full bg-cobalt-wash px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
            New
          </span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="max-w-[18rem] text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Live telemetry for every rig.
          </p>
          <p className="font-mono text-sm text-ink-2 tabular-nums">
            £29 / month
          </p>
        </div>
        {chrome ? (
          <ul className="flex flex-col gap-1.5">
            {FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-2 text-xs text-ink-2"
              >
                <Check aria-hidden className="size-3.5 shrink-0 text-success" />
                {feature}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Upgrade
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Compare plans
          </button>
        </div>
      </div>
    </CometBorder>
  );

  if (!chrome) return <div className="flex w-full max-w-lg">{card}</div>;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hot && crossings > 0 ? (
          <>
            <span className="text-signal">crossed</span> · {crossings}{" "}
            {crossings === 1 ? "flare" : "flares"} at the edge
          </>
        ) : hot ? (
          <>
            <span className="text-signal">hovered</span> · twin lit, faster pace
          </>
        ) : (
          <>
            <span className="text-signal">circling</span> · {laps}{" "}
            {laps === 1 ? "lap" : "laps"} so far
          </>
        )}
      </p>
    </div>
  );
}
