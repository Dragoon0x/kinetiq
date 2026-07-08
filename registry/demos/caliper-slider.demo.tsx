"use client";

import * as React from "react";

import { CaliperSlider } from "@/registry/ui/caliper-slider";

export function CaliperSliderDemo() {
  const [tolerance, setTolerance] = React.useState<[number, number]>([
    3.2, 7.8,
  ]);
  const [sampleRate, setSampleRate] = React.useState(48);

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Tolerance window</span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
            Bore · pass 2
          </span>
        </div>
        <CaliperSlider
          range
          min={0}
          max={12}
          step={0.2}
          value={tolerance}
          onValueChange={(next) => {
            if (Array.isArray(next)) setTolerance(next);
          }}
          format={(v) => `${v.toFixed(1)} mm`}
          label="Tolerance window"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Sample rate</span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
            {sampleRate >= 48 ? "Hi-res capture" : "Standard capture"}
          </span>
        </div>
        <CaliperSlider
          min={1}
          max={96}
          step={1}
          value={sampleRate}
          onValueChange={(next) => {
            if (typeof next === "number") setSampleRate(next);
          }}
          readout="float"
          format={(v) => `${v} kHz`}
          label="Sample rate"
        />
      </div>
    </div>
  );
}
