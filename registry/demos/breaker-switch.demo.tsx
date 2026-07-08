"use client";

import * as React from "react";

import { BreakerSwitch } from "@/registry/ui/breaker-switch";

export function BreakerSwitchDemo() {
  const [main, setMain] = React.useState(true);
  const [telemetry, setTelemetry] = React.useState(true);
  const [autoCalibrate, setAutoCalibrate] = React.useState(false);

  const live = [main, telemetry, telemetry && autoCalibrate].filter(
    Boolean,
  ).length;

  return (
    <div className="border-border bg-card w-full max-w-sm rounded-3 border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">Lab power rail</h3>
        <span
          role="status"
          className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase tabular-nums"
        >
          Rail: {live}/3 systems live
        </span>
      </div>
      <div className="flex flex-col p-2">
        <BreakerSwitch
          size="lg"
          checked={main}
          onCheckedChange={setMain}
          onLabel="On"
          offLabel="Off"
          label={<span className="text-sm font-medium">Main power</span>}
          className="w-full justify-between rounded-2 px-2 py-2.5"
        />
        <BreakerSwitch
          checked={telemetry}
          onCheckedChange={(next) => {
            setTelemetry(next);
            // Calibration rides on the telemetry link — cut one, cut both.
            if (!next) setAutoCalibrate(false);
          }}
          label={<span className="text-sm font-medium">Telemetry link</span>}
          className="w-full justify-between rounded-2 px-2 py-2.5"
        />
        <BreakerSwitch
          checked={autoCalibrate}
          onCheckedChange={setAutoCalibrate}
          disabled={!telemetry}
          label={
            <span className="text-sm font-medium">
              Auto-calibrate
              <span className="text-muted-foreground block text-xs font-normal">
                Requires telemetry
              </span>
            </span>
          }
          className="w-full justify-between rounded-2 px-2 py-2.5"
        />
      </div>
    </div>
  );
}
