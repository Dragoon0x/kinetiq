"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SunArc } from "@/registry/ui/sun-arc";

export const tweaks = defineTweaks({
  clock: {
    kind: "choice",
    label: "Clock",
    default: "24",
    options: ["24", "12"],
    names: { "24": "24-hour", "12": "12-hour" },
  },
  sky: { kind: "toggle", label: "Sky", default: true },
  marks: { kind: "toggle", label: "Marks", default: true },
});

/** An April afternoon at the trailhead, read in UTC so every render agrees. */
const START = Date.UTC(2026, 3, 18, 15, 40);
const SUNRISE = 374;
const SUNSET = 1192;
const DAWN = 344;
const DUSK = 1222;
const STEP_MS = 15_000;

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number, twelve: boolean) => {
  const w = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(w / 60);
  return twelve
    ? `${h % 12 || 12}:${pad(w % 60)} ${h < 12 ? "am" : "pm"}`
    : `${pad(h)}:${pad(w % 60)}`;
};
const left = (m: number) => {
  const r = Math.max(0, Math.round(m));
  return r < 60 ? `${r} m` : `${Math.floor(r / 60)} h ${pad(r % 60)} m`;
};

/**
 * Fieldline's trail card for Coldbrook Ridge: how much daylight is left for
 * the walk down, and what it will be like later.
 */
export function SunArcDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(START);
  const [shown, setShown] = React.useState<number | null>(null);

  // The clock moves in real time, in quarter-minute steps, and rests while
  // the page is hidden.
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

  const twelve = values.clock === "12";
  const date = new Date(now);
  const liveMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  const at = shown ?? liveMin;
  const reading =
    at < SUNRISE
      ? `${left(SUNRISE - at)} until sunrise`
      : at < SUNSET
        ? `${left(SUNSET - at)} of daylight left`
        : at < DUSK
          ? `${left(DUSK - at)} until dark`
          : "after dark";

  const widget = (
    <SunArc
      sunrise={SUNRISE}
      sunset={SUNSET}
      dawn={DAWN}
      dusk={DUSK}
      now={now}
      timeZone="UTC"
      value={shown}
      onValueChange={setShown}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-2xl">{widget}</div>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {widget}
      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {shown === null ? (
          <>
            <span className="text-signal">live · {hhmm(liveMin, twelve)}</span>{" "}
            · {reading}
          </>
        ) : (
          <>
            <span className="text-signal">
              scrubbed to {hhmm(shown, twelve)}
            </span>{" "}
            · {reading} · esc for now
          </>
        )}
      </p>
    </div>
  );
}
