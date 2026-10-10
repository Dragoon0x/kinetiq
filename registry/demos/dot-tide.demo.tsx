"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DotTide } from "@/registry/ui/dot-tide";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 16,
    min: 8,
    max: 32,
    step: 2,
    unit: "px",
  },
  speed: {
    kind: "range",
    label: "Tide",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "sea", "ember", "ink"],
    names: { cobalt: "Cobalt", sea: "Sea", ember: "Ember", ink: "Ink" },
  },
});

/**
 * Coldbrook Tides publishes tide tables; the hero field runs the morning's
 * water past the opening line.
 */
export function DotTideDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rising, setRising] = React.useState(false);
  const [waving, setWaving] = React.useState(false);
  const waveTimer = React.useRef<number | null>(null);
  const spacing = values.spacing ?? 16;
  const speed = values.speed ?? 0.6;
  const color = values.color ?? "cobalt";

  const onWave = React.useCallback(() => {
    setWaving(true);
    if (waveTimer.current !== null) window.clearTimeout(waveTimer.current);
    waveTimer.current = window.setTimeout(() => {
      waveTimer.current = null;
      setWaving(false);
    }, 1400);
  }, []);

  React.useEffect(
    () => () => {
      if (waveTimer.current !== null) window.clearTimeout(waveTimer.current);
    },
    [],
  );

  const field = (
    <DotTide
      onActiveChange={setRising}
      onWave={onWave}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Tides
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            High water at <span className="tabular-nums">06:42</span>
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Tide tables for the whole coast
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See this week
              </button>
            </>
          ) : null}
        </div>
      </div>
    </DotTide>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {waving ? (
          <>
            <span className="text-signal">wave</span> · running out from your
            press
          </>
        ) : rising ? (
          <>
            <span className="text-signal">swell</span> · the tide rises under
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{color}</span> · {spacing} px grid ·
            tide {speed.toFixed(1)}×
          </>
        )}
      </p>
    </div>
  );
}
