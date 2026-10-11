"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LogRain, defaultLogRainLines } from "@/registry/ui/log-rain";

export const tweaks = defineTweaks({
  layers: {
    kind: "range",
    label: "Layers",
    default: 3,
    min: 1,
    max: 3,
    step: 1,
  },
  fallSpeed: {
    kind: "range",
    label: "Fall",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 250,
    min: 0,
    max: 360,
    step: 5,
    unit: "°",
  },
});

/**
 * Gaugeworks prod-eu, a deploy channel's live tail: the log rains past, and
 * any column stops to be read as the line it carries.
 */
export function LogRainDemo({
  chrome = true,
  // The rain is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [line, setLine] = React.useState<number | null>(null);
  const reading = line === null ? undefined : defaultLogRainLines[line];

  const panel = (
    <div className="flex w-full flex-col overflow-clip rounded-3 border border-hairline bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-signal"
          />
          <span className="truncate">Gaugeworks · prod-eu</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-3">
          tail -f
        </span>
      </div>
      <LogRain
        label="Gaugeworks prod-eu log"
        onLineChange={setLine}
        className={chrome ? "h-[26rem] w-full" : "h-[32rem] w-full"}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{panel}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading ? (
          <>
            <span className="text-signal">reading · {reading.source}</span> ·{" "}
            {reading.text.split(" · ")[0]}
          </>
        ) : (
          <>
            <span className="text-signal">raining</span> · hover a column to
            read it
          </>
        )}
      </p>
    </div>
  );
}
