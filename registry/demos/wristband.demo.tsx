"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Wristband } from "@/registry/ui/wristband";

export const tweaks = defineTweaks({
  fabric: {
    kind: "choice",
    label: "Fabric",
    default: "woven",
    options: ["woven", "silicone", "paper"],
    names: { woven: "Woven", silicone: "Silicone", paper: "Paper" },
  },
  tier: {
    kind: "choice",
    label: "Tier",
    default: "vip",
    options: ["ga", "vip", "crew"],
    names: { ga: "GA", vip: "VIP", crew: "Crew" },
  },
  wrap: {
    kind: "range",
    label: "Wrap",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const ACCESS: Record<string, string> = {
  ga: "gates a to c",
  vip: "lounge, gate b",
  crew: "all areas",
};

/**
 * Check-in at Basinworks Summer Sessions: the ticket becomes a band on the
 * wrist, and the band opens the gates.
 */
export function WristbandDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState(false);
  const [scans, setScans] = React.useState(0);
  const tier = values.tier ?? tweaks.tier.default;

  const band = (
    <Wristband
      name="Teo Bramhall"
      event="Basinworks Summer Sessions 2026"
      code="BW26-0417"
      snapped={on}
      onSnappedChange={(next) => {
        setOn(next);
        if (!next) setScans(0);
      }}
      onScan={() => setScans((n) => n + 1)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return band;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {band}
      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {!on ? (
          <>
            <span className="text-signal">unworn</span> · tap the band to put it
            on
          </>
        ) : scans > 0 ? (
          <>
            <span className="text-signal">
              scanned {scans === 1 ? "once" : `${scans} times`}
            </span>{" "}
            · {tier} · {ACCESS[tier]}
          </>
        ) : (
          <>
            <span className="text-signal">worn</span> · {tier} · {ACCESS[tier]}
          </>
        )}
      </p>
    </div>
  );
}
