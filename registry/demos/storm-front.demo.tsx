"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StormFront, type StormStrike } from "@/registry/ui/storm-front";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 6,
    min: 0,
    max: 20,
    step: 1,
    unit: "/min",
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "var(--foreground)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "var(--foreground)": "Slate",
    },
  },
});

/**
 * Gaugeworks Forecast's evening outlook: the line sits in the clear band
 * under the storm, the cloud flashes on its own, and a click calls the
 * lightning down where the visitor points.
 */
export function StormFrontDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [last, setLast] = React.useState<StormStrike["source"] | null>(null);
  const [strikes, setStrikes] = React.useState(0);
  const rate = Math.round(values.rate ?? 6);
  const density = values.density ?? 0.6;

  // The flash and its afterglow are over by the time this fires.
  React.useEffect(() => {
    if (strikes === 0) return;
    const done = window.setTimeout(() => setLast(null), 1600);
    return () => window.clearTimeout(done);
  }, [strikes]);

  const storm = (
    <StormFront
      base={0.56}
      sound={sound}
      onStrike={(strike) => {
        setLast(strike.source);
        setStrikes((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-start justify-end p-5 text-left @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Gaugeworks Forecast
          </p>
          <p className="mt-1.5 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            Storms through the evening
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Set an alert
              </button>
              <span className="text-xs text-ink-2">Strikes within 12 km</span>
            </div>
          ) : null}
        </div>
      </div>
    </StormFront>
  );

  if (!chrome) return <div className="flex w-full">{storm}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {storm}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last === "visitor" ? (
          <>
            <span className="text-signal">strike</span> · called down by you
          </>
        ) : last === "storm" ? (
          <>
            <span className="text-signal">flash</span> · deep in the cloud
          </>
        ) : (
          <>
            <span className="text-signal">
              {rate === 0
                ? "no flashes"
                : `${rate} ${rate === 1 ? "flash" : "flashes"} a minute`}
            </span>{" "}
            · density {density.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
