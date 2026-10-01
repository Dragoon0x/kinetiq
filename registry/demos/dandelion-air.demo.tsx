"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DandelionAir } from "@/registry/ui/dandelion-air";

export const tweaks = defineTweaks({
  aqi: {
    kind: "range",
    label: "Index",
    default: 72,
    min: 0,
    max: 300,
    step: 5,
  },
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  seeds: {
    kind: "range",
    label: "Seeds",
    default: 48,
    min: 24,
    max: 72,
    step: 4,
  },
});

/** How the index moves through a seeded afternoon: the rush hour, then rain. */
const AFTERNOON = [18, 46, 64, -38, -72, -30, -12, 24];
const FIRST_HOUR = 14;

const bandOf = (aqi: number) =>
  aqi <= 50
    ? "good"
    : aqi <= 100
      ? "moderate"
      : aqi <= 150
        ? "sensitive"
        : aqi <= 200
          ? "unhealthy"
          : aqi <= 300
            ? "very unhealthy"
            : "hazardous";

type Reading = { base: number; aqi: number; hour: number };

/**
 * Waylight's weather card for Coldbrook Park: the air this afternoon, and
 * a dandelion to blow while you wait for it to clear.
 */
export function DandelionAirDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const base = values.aqi ?? tweaks.aqi.default;
  const [reading, setReading] = React.useState<Reading>({
    base,
    aqi: base,
    hour: 0,
  });
  // A new index from the panel starts the afternoon again from it.
  if (reading.base !== base) setReading({ base, aqi: base, hour: 0 });
  const [blown, setBlown] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (blown === null) return;
    const timer = window.setTimeout(() => setBlown(null), 2400);
    return () => window.clearTimeout(timer);
  }, [blown]);

  const widget = (
    <DandelionAir
      label="Air quality"
      place="Coldbrook Park"
      onBlow={setBlown}
      sound={sound}
      {...values}
      aqi={reading.aqi}
    />
  );

  if (!chrome) return widget;

  const clock = `${FIRST_HOUR + reading.hour}:00`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex justify-center">{widget}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {blown !== null ? (
            <>
              <span className="text-signal">blown</span> · {blown}{" "}
              {blown === 1 ? "seed" : "seeds"} left · refilling
            </>
          ) : (
            <>
              <span className="text-signal">aqi {reading.aqi}</span> ·{" "}
              {bandOf(reading.aqi)} · {clock}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() =>
            setReading((r) => {
              const hour = (r.hour + 1) % (AFTERNOON.length + 1);
              const aqi =
                hour === 0
                  ? r.base
                  : Math.min(
                      300,
                      Math.max(0, r.aqi + (AFTERNOON[r.hour] ?? 0)),
                    );
              return { ...r, aqi, hour };
            })
          }
          className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Next hour
        </button>
      </div>
    </div>
  );
}
