"use client";

import * as React from "react";

import { MapFold, type MapFoldMode } from "@/registry/ui/map-fold";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";

const SPECS = [
  { label: "Datum", value: "NAD83" },
  { label: "Zone", value: "14N" },
  { label: "Baseline", value: "220 m" },
  { label: "Slope", value: "3.5%" },
  { label: "Survey class", value: "II" },
  { label: "Crew", value: "Fieldline 3" },
] as const;

/** A field survey sheet that closes into a folded packet as it leaves the
 * viewport and opens flat once it is centred — shut at the top and bottom of
 * the scroll, spread out at the midpoint, the way a crew unfolds a map on
 * the hood of the truck and shuts it again before moving on. Switch modes
 * above to drive the same fold on scroll, or by hand. */
export function MapFoldDemo() {
  const [mode, setMode] = React.useState<MapFoldMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);
  const [markers, setMarkers] = React.useState(12);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as MapFoldMode)}
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

      <MapFold
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · survey sheet 07</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Twelve markers, one sheet that folds shut.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The crew carries one sheet per site, creased into a packet that
              fits a jacket pocket. It opens flat to plot a marker and shuts
              again the moment the truck starts moving.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-hairline py-4 font-mono text-xs">
            {SPECS.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center justify-between"
              >
                <span className="text-ink-3">{spec.label}</span>
                <span className="text-ink">{spec.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label text-ink-3">Markers logged</span>
            <Readout value={markers} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton
              variant="solid"
              onClick={() => setMarkers((count) => count + 1)}
            >
              Log marker
            </PressureButton>
            <PressureButton variant="outline">Close the sheet</PressureButton>
          </div>
        </div>
      </MapFold>

      <p className="font-mono text-[11px] text-ink-3">folds like a map</p>
    </div>
  );
}
