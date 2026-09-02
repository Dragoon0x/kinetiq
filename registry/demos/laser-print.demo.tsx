"use client";

import * as React from "react";

import { LaserPrint, type LaserPrintMode } from "@/registry/ui/laser-print";
import { PressureButton } from "@/registry/ui/pressure-button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";

const SPECS = [
  { label: "Material", value: "6061-T6 alu" },
  { label: "Thickness", value: "3.2 mm" },
  { label: "Kerf", value: "0.15 mm" },
  { label: "Feed rate", value: "42 mm/s" },
  { label: "Beam power", value: "1.8 kW" },
  { label: "Tolerance", value: "±0.05 mm" },
] as const;

/** A cut sheet that prints in as the beam reaches it. Scroll the stage past
 * the fold and the spec resolves top to bottom, sparks and heat shimmer
 * marking the line as it goes; switch modes above to drive the same beam
 * on a timer, or by hand. */
export function LaserPrintDemo() {
  const [mode, setMode] = React.useState<LaserPrintMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as LaserPrintMode)}
        >
          <SegmentedControlItem value="scroll">Scroll</SegmentedControlItem>
          <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
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

      <LaserPrint
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · cut sheet 114-B
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six numbers, one pass of the beam.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every dimension on this sheet enters the page the way the cutter
              enters the plate: top to bottom, one line at a time. Scroll past
              the fold and the spec resolves; scroll back and it returns to
              blank stock.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-hairline py-4 font-mono text-xs">
            {SPECS.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-ink-3">{spec.label}</span>
                <span className="text-ink">{spec.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Queue the cut</PressureButton>
            <PressureButton variant="outline">Hold the beam</PressureButton>
          </div>
        </div>
      </LaserPrint>

      <p className="font-mono text-[11px] text-ink-3">scroll to print</p>
    </div>
  );
}
