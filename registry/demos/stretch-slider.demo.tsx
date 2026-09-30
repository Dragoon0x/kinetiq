"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StretchSlider } from "@/registry/ui/stretch-slider";

export const tweaks = defineTweaks({
  elasticity: {
    kind: "range",
    label: "Elasticity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  maxStretch: {
    kind: "range",
    label: "Max stretch",
    default: 40,
    min: 16,
    max: 64,
    step: 8,
    unit: "px",
  },
  snapPoints: {
    kind: "range",
    label: "Snap points",
    default: 3,
    min: 0,
    max: 10,
    step: 1,
  },
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 8,
    min: 4,
    max: 16,
    step: 2,
    unit: "px",
  },
});

/** The bill, in cents, so the tip never picks up a floating-point cent. */
const BILL = 4200;
const MOST = 30;

const money = (cents: number) => (cents / 100).toFixed(2);

/**
 * Adding a tip in Waylight Pay: 0 to 30% of a 42.00 bill. Pull past 30% and
 * the band pulls back.
 */
export function StretchSliderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tip, setTip] = React.useState(18);
  const cents = Math.round((BILL * tip) / 100);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-xs text-ink-3">Waylight Pay · Table 12</p>
          <p className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
            Bill {money(BILL)}
          </p>
        </div>
        <StretchSlider
          label="Tip"
          min={0}
          max={MOST}
          step={1}
          format={(v) => `${v}%`}
          value={tip}
          onValueChange={setTip}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{`tip ${tip}%`}</span>
          {tip === 0
            ? " · no tip · pull left and it pulls back"
            : ` · ${money(cents)} · total ${money(BILL + cents)}${
                tip === MOST ? " · the most waylight adds" : ""
              }`}
        </p>
      ) : null}
    </div>
  );
}
