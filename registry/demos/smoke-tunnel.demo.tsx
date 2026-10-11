"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SmokeTunnel } from "@/registry/ui/smoke-tunnel";

export const tweaks = defineTweaks({
  flow: {
    kind: "range",
    label: "Flow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: 6,
    min: -8,
    max: 24,
    step: 1,
    unit: "°",
  },
  smoke: {
    kind: "range",
    label: "Smoke",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks Aero's tunnel booking page: smoke streams past a wing section
 * you can turn, and past fourteen degrees the flow lets go.
 */
export function SmokeTunnelDemo({
  chrome = true,
  // The tunnel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(values.angle ?? 6);
  // The tweak turns the wing; the tunnel reports back what the hand did.
  const [seen, setSeen] = React.useState(values.angle);
  if (seen !== values.angle) {
    setSeen(values.angle);
    setAngle(values.angle ?? 6);
  }
  const stalled = angle > 14;

  const tunnel = (
    <SmokeTunnel
      onValueChange={setAngle}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-start justify-end p-3 sm:p-4">
        <div className="rounded-2 border border-hairline bg-background/80 px-2.5 py-1.5 text-right backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks · tunnel 2
          </p>
          <p className="text-sm leading-snug font-medium text-foreground">
            See the lift.
          </p>
        </div>
      </div>
    </SmokeTunnel>
  );

  if (!chrome) return <div className="flex w-full">{tunnel}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {tunnel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className={stalled ? "text-warn" : "text-signal"}>
          {Number.isInteger(angle) ? angle : angle.toFixed(1)}°
        </span>{" "}
        · {stalled ? "stalled, the smoke tumbles" : "flow attached"} · drag the
        wing
      </p>
    </div>
  );
}
