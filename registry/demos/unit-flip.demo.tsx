"use client";

import * as React from "react";

import { UnitFlip, type UnitFlipUnit } from "@/registry/ui/unit-flip";

const TEMPERATURE: [UnitFlipUnit, UnitFlipUnit] = [
  { label: "°C", convert: (value) => value, digits: 1 },
  { label: "°F", convert: (value) => value * 1.8 + 32, digits: 1 },
];

const DISTANCE: [UnitFlipUnit, UnitFlipUnit] = [
  { label: "km", convert: (value) => value, digits: 1 },
  { label: "mi", convert: (value) => value * 0.621371, digits: 2 },
];

const WEIGHT: [UnitFlipUnit, UnitFlipUnit] = [
  { label: "kg", convert: (value) => value, digits: 1 },
  { label: "lb", convert: (value) => value * 2.20462, digits: 1 },
];

export function UnitFlipDemo() {
  const [temperature, setTemperature] = React.useState<0 | 1>(0);
  const [distance, setDistance] = React.useState<0 | 1>(0);
  const [weight, setWeight] = React.useState<0 | 1>(1);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col divide-y divide-hairline rounded-3 border border-border bg-surface-1 px-4">
        <div className="py-3">
          <UnitFlip
            label="Inlet temperature"
            value={21.4}
            units={TEMPERATURE}
            unit={temperature}
            onUnitChange={setTemperature}
          />
        </div>
        <div className="py-3">
          <UnitFlip
            label="Line run"
            value={12.6}
            units={DISTANCE}
            unit={distance}
            onUnitChange={setDistance}
          />
        </div>
        <div className="py-3">
          <UnitFlip
            label="Rig weight"
            value={74.2}
            units={WEIGHT}
            unit={weight}
            onUnitChange={setWeight}
          />
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Reading in{" "}
        <span className="text-signal">
          {TEMPERATURE[temperature].label} · {DISTANCE[distance].label} ·{" "}
          {WEIGHT[weight].label}
        </span>
      </p>
    </div>
  );
}
