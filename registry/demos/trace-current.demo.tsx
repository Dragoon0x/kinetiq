"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TraceCurrent } from "@/registry/ui/trace-current";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  flowRate: {
    kind: "range",
    label: "Flow rate",
    default: 6,
    min: 2,
    max: 16,
    step: 1,
    unit: "/s",
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 260,
    min: 0,
    max: 360,
    step: 10,
    unit: "°",
  },
});

/**
 * Gaugeworks Relay: the routing engine's hero, set on a board whose currents
 * find the visitor's pointer the way requests find the nearest edge.
 */
export function TraceCurrentDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rerouting, setRerouting] = React.useState(false);
  const [pulsed, setPulsed] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onPulse = () => {
    setPulsed(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPulsed(false);
    }, 1400);
  };

  const board = (
    <TraceCurrent
      onRerouteChange={setRerouting}
      onPulse={onPulse}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-5">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-3.5 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Relay
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Every request takes the shortest path
          </p>
          {chrome ? (
            <button
              type="button"
              className="mt-2.5 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Read the docs
            </button>
          ) : null}
        </div>
      </div>
    </TraceCurrent>
  );

  if (!chrome) return <div className="flex w-full">{board}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pulsed ? (
          <>
            <span className="text-signal">pulse sent</span> · along every trace
          </>
        ) : rerouting ? (
          <>
            <span className="text-signal">rerouting</span> · the currents run to
            you
          </>
        ) : (
          <>
            <span className="text-signal">on circuit</span> · move over the
            board or click
          </>
        )}
      </p>
    </div>
  );
}
