"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HazeFade } from "@/registry/ui/haze-fade";

export const tweaks = defineTweaks({
  direction: {
    kind: "choice",
    label: "Direction",
    default: "right",
    options: ["right", "left", "up", "down"],
    names: { right: "Right", left: "Left", up: "Up", down: "Down" },
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.6,
    min: 0.1,
    max: 1,
    step: 0.1,
  },
  duration: {
    kind: "range",
    label: "Duration",
    default: 1400,
    min: 600,
    max: 3000,
    step: 200,
    unit: "ms",
  },
});

const FORECAST = ["06:40 · 4°", "09:00 · 11°", "Wind NW 6"];

/**
 * Coldbrook's field notes: the morning's headline clears out of the valley
 * mist, left to right, as the card comes into view.
 */
export function HazeFadeDemo({
  chrome = true,
  // The haze is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const direction = values.direction ?? tweaks.direction.default;
  const haze = values.haze ?? tweaks.haze.default;
  const duration = values.duration ?? tweaks.duration.default;
  const [round, setRound] = React.useState(0);
  const replayKey = `${round}:${direction}:${haze}:${duration}`;
  // Clear only for the run that finished: a replay or a tweak is hazed again.
  const [clearedKey, setClearedKey] = React.useState<string | null>(null);
  const clear = clearedKey === replayKey;

  const notes = (
    <div className="@container w-full">
      <HazeFade
        replayKey={replayKey}
        onComplete={() => setClearedKey(replayKey)}
        className="flex flex-col gap-3"
        {...values}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · Field notes · No. 12
        </p>
        <h2 className="text-[clamp(1.6rem,6.4cqi,2.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance text-foreground">
          The valley clears by nine.
        </h2>
        <p className="max-w-[46ch] text-sm text-ink-2">
          Mist sits in the low fields until the sun is over the ridge. Walk
          early and the path is yours.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {FORECAST.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      </HazeFade>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{notes}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {notes}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{clear ? "clear" : "hazed"}</span> ·
          clearing {direction === "up" || direction === "down" ? "" : "to the "}
          {direction} · haze {haze.toFixed(1)} · {duration} ms
        </p>
        <button
          type="button"
          onClick={() => setRound((n) => n + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
