"use client";

import * as React from "react";

import {
  AccordionPleat,
  type AccordionPleatMode,
} from "@/registry/ui/accordion-pleat";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";

const SPECS = [
  { label: "Bore", value: "38 mm" },
  { label: "Stroke", value: "64 mm" },
  { label: "Rated pressure", value: "12 bar" },
  { label: "Duty cycle", value: "60%" },
] as const;

/** A calibration card that pleats shut like an accordion at the edges of
 * scroll and opens flat at the midpoint. Switch modes above to drive the
 * same fold on scroll, or by hand. */
export function AccordionPleatDemo() {
  const [mode, setMode] = React.useState<AccordionPleatMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as AccordionPleatMode)}
        >
          <SegmentedControlItem value="scroll">Scroll</SegmentedControlItem>
          <SegmentedControlItem value="manual">Manual</SegmentedControlItem>
        </SegmentedControl>
        {mode === "manual" && (
          <label className="flex w-full items-center gap-3 font-mono text-[11px] text-ink-3">
            Progress
            <input
              type="range"
              min={0}
              max={100}
              value={manualProgress}
              onChange={(event) =>
                setManualProgress(Number(event.target.value))
              }
              className="flex-1 accent-[var(--primary)]"
            />
            <span className="w-9 text-right tabular-nums">
              {manualProgress}%
            </span>
          </label>
        )}
      </div>

      <AccordionPleat
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · bench 12</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One sheet, four readings, no seams.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The calibration card pleats shut the moment it leaves frame and
              opens flat the moment it centres, the way a folded spec sheet
              unfolds across a bench.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-y border-hairline py-4 font-mono text-xs sm:grid-cols-4">
            {SPECS.map((spec) => (
              <div key={spec.label} className="flex flex-col gap-1">
                <span className="text-ink-3">{spec.label}</span>
                <span className="text-ink">{spec.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Readout
              value={412}
              format={(v) => `${v.toFixed(0)} psi`}
              size="lg"
            />
            <Readout
              value={68}
              format={(v) => `${v.toFixed(0)} degC`}
              size="md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log reading</PressureButton>
            <PressureButton variant="outline">Reset gauge</PressureButton>
          </div>
        </div>
      </AccordionPleat>

      <p className="font-mono text-[11px] text-ink-3">opening as you scroll</p>
    </div>
  );
}
