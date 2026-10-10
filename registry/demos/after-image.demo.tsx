"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AfterImage } from "@/registry/ui/after-image";

export const tweaks = defineTweaks({
  echoes: {
    kind: "range",
    label: "Echoes",
    default: 5,
    min: 1,
    max: 8,
    step: 1,
  },
  lag: {
    kind: "range",
    label: "Lag",
    default: 40,
    min: 16,
    max: 96,
    step: 8,
    unit: "ms",
  },
  hue: {
    kind: "range",
    label: "Hue drift",
    default: 20,
    min: 0,
    max: 60,
    step: 5,
    unit: "°",
  },
});

/**
 * Waylight makes lamps whose light stays in the eye: its headline leaves an
 * afterglow wherever the words go.
 */
export function AfterImageDemo({
  chrome = true,
  // The echoes are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [moving, setMoving] = React.useState(false);
  const echoes = values.echoes ?? tweaks.echoes.default;
  const lag = values.lag ?? tweaks.lag.default;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight · lamps that linger
      </p>
      <AfterImage
        as="h2"
        text="Light that lingers"
        onMotionChange={setMoving}
        className="text-[clamp(2.25rem,11.5cqw,5rem)] leading-[1.1] font-semibold tracking-tight text-foreground"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {moving ? (
            <>
              <span className="text-signal">moving</span> · {echoes}{" "}
              {echoes === 1 ? "echo" : "echoes"}, {lag} ms apart
            </>
          ) : (
            <>
              <span className="text-signal">settled</span> · drag a word across
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
