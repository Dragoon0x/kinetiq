"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LiveWireMark } from "@/registry/ui/live-wire-mark";

export const tweaks = defineTweaks({
  voltage: {
    kind: "range",
    label: "Voltage",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  arcs: {
    kind: "range",
    label: "Arcs",
    default: 3,
    min: 1,
    max: 8,
    step: 1,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks, makers of field instruments: the company mark with current
 * running round it, in the lockup at the top of their landing page.
 */
export function LiveWireMarkDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [discharges, setDischarges] = React.useState(0);
  const [recharging, setRecharging] = React.useState(false);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const lockup = (
    <div className="@container w-full">
      <div className="flex flex-col items-center gap-2 text-center @[26rem]:flex-row @[26rem]:gap-5 @[26rem]:text-left">
        <LiveWireMark
          label="Gaugeworks"
          className="size-28 @[26rem]:size-36"
          sound={sound}
          onDischarge={() => {
            setDischarges((n) => n + 1);
            setRecharging(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setRecharging(false), 1200);
          }}
          {...values}
        />
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-foreground @[26rem]:text-3xl">
            Gaugeworks
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Field instruments · est. 1962
          </p>
        </div>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-md">{lockup}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {lockup}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {recharging ? (
          <>
            <span className="text-signal">discharged</span> · recharging
          </>
        ) : (
          <>
            <span className="text-signal">live</span> ·{" "}
            {discharges === 0
              ? "hover to charge, press to discharge"
              : `${discharges} ${discharges === 1 ? "discharge" : "discharges"}`}
          </>
        )}
      </p>
    </div>
  );
}
