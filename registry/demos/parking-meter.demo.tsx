"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ParkingMeter } from "@/registry/ui/parking-meter";

export const tweaks = defineTweaks({
  max: {
    kind: "range",
    label: "Max stay",
    default: 120,
    min: 30,
    max: 240,
    step: 15,
    unit: "min",
  },
  coin: {
    kind: "range",
    label: "Per coin",
    default: 20,
    min: 10,
    max: 60,
    step: 5,
    unit: "min",
  },
  style: {
    kind: "choice",
    label: "Style",
    default: "classic",
    options: ["classic", "digital"],
    names: { classic: "Classic", digital: "Digital" },
  },
});

/** 14:20 on an April afternoon, read in UTC so every render agrees. */
const START = Date.UTC(2026, 3, 18, 14, 20);
const MINUTE = 60_000;
/** The demo clock runs twenty times fast: ten seconds every half second. */
const BEAT_MS = 500;
const BEAT = 10_000;

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / MINUTE));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};

/**
 * Waylight Pay, Fernworks Lane bay 14: twelve minutes on the meter, and the
 * clock running fast enough to watch it go.
 */
export function ParkingMeterDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(START);
  const [paid, setPaid] = React.useState<number | null>(START + 12 * MINUTE);

  // The clock rests while the page is hidden.
  React.useEffect(() => {
    let timer = 0;
    const start = () => {
      if (!timer) {
        timer = window.setInterval(() => setNow((t) => t + BEAT), BEAT_MS);
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

  const meter = (
    <ParkingMeter
      label="Bay 14"
      now={now}
      timeZone="UTC"
      value={paid}
      onValueChange={setPaid}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return meter;

  const remaining = paid === null ? 0 : paid - now;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex justify-center">{meter}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {remaining > 0 && paid !== null ? (
            <>
              <span className="text-signal">{clock(now)}</span> ·{" "}
              {left(remaining)} left · until {clock(paid)}
            </>
          ) : (
            <>
              <span className="text-signal">
                expired{paid !== null ? ` at ${clock(paid)}` : ""}
              </span>{" "}
              · tap to pay
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setNow((t) => t + 10 * MINUTE)}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Skip 10 min
        </button>
      </div>
    </div>
  );
}
