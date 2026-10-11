"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LumenChorus } from "@/registry/ui/lumen-chorus";

export const tweaks = defineTweaks({
  rise: {
    kind: "range",
    label: "Rise",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 0.75,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const HOURS = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, "0")}:00`,
);

/** Array 3's output by hour for reading `n`: the same sun, clouds passing. */
function readings(n: number) {
  return HOURS.map((_, i) => {
    const sun = Math.max(0, Math.sin((Math.PI * (i - 5.5)) / 13));
    const cloud =
      0.74 +
      0.16 * Math.cos(i * 0.9 + n * 1.3) +
      0.1 * Math.sin(i * 2.3 - n * 0.7);
    return Math.round(sun * 4.4 * cloud * 10) / 10;
  });
}

/**
 * Gaugeworks Solar, array 3: output by hour, with a fresh set of readings
 * arriving every few seconds while the card is on screen.
 */
export function LumenChorusDemo({
  chrome = true,
  // The chorus is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tick, setTick] = React.useState(0);
  const [active, setActive] = React.useState<number | null>(null);
  const series = React.useMemo(() => readings(tick), [tick]);

  // New readings only while the card can be seen: bound to the box as it arrives.
  const bindBox = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    let timer = 0;
    const io = new IntersectionObserver((entries) => {
      const on = entries[entries.length - 1]?.isIntersecting ?? false;
      window.clearInterval(timer);
      timer = on ? window.setInterval(() => setTick((t) => t + 1), 3600) : 0;
    });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const chorus = (
    <LumenChorus
      values={series}
      labels={HOURS}
      unit="kW"
      max={4.6}
      label="Array 3 output by hour"
      active={active}
      onActiveChange={setActive}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={bindBox} className="w-full" style={{ height: 208 }}>
        {chorus}
      </div>
    );
  }

  let peak = 0;
  series.forEach((v, i) => {
    if (v > (series[peak] ?? 0)) peak = i;
  });
  const peakText = `peak ${series[peak] ?? 0} kW at ${HOURS[peak]}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Solar · Array 3
        </p>
        <p className="text-sm font-medium text-foreground">Output by hour</p>
      </div>
      <div ref={bindBox} className="w-full" style={{ height: 220 }}>
        {chorus}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {active !== null ? (
          <>
            <span className="text-signal">
              {HOURS[active]} · {series[active] ?? 0} kW
            </span>{" "}
            · {peakText}
          </>
        ) : (
          <>
            <span className="text-signal">24 hours</span> · {peakText} ·
            readings live
          </>
        )}
      </p>
    </div>
  );
}
