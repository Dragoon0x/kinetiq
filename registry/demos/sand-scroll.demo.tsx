"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { SandScroll, type SandScrollMode } from "@/registry/ui/sand-scroll";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";

const STATIONS = [
  { station: "S-04", bed: "Delta channel", depth: "2.1 m", state: "settled" },
  { station: "S-11", bed: "Bar sediment", depth: "4.6 m", state: "shifting" },
  { station: "S-17", bed: "Old levee", depth: "1.8 m", state: "buried" },
  { station: "S-23", bed: "Spillway apron", depth: "6.3 m", state: "unstable" },
] as const;

/** A silt survey grid held under sand until the line reaches it. Scroll the
 * stage past the fold and the readings settle out of the drift top to
 * bottom; switch modes above to drive the same line on a timer, or by
 * hand. */
export function SandScrollDemo() {
  const [mode, setMode] = React.useState<SandScrollMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as SandScrollMode)}
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

      <SandScroll
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · silt survey 22-B
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four stations, one falling line.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every reading on this reach sits the way the river left it: buried
              below a line that only a slow sweep uncovers. Scroll past the fold
              and the grid settles out of the drift; scroll back and it loosens
              into sand again.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Station</th>
                <th className="py-2 pr-4 text-label text-ink-3">Bed</th>
                <th className="py-2 pr-4 text-label text-ink-3">Depth</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((row) => (
                <tr key={row.station} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.station}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.bed}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.depth}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "settled"
                          ? "success"
                          : row.state === "shifting"
                            ? "warn"
                            : row.state === "unstable"
                              ? "danger"
                              : "info"
                      }
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the reading</PressureButton>
            <PressureButton variant="outline">Flag station 23</PressureButton>
          </div>
        </div>
      </SandScroll>

      <p className="font-mono text-[11px] text-ink-3">
        it settles as you scroll
      </p>
    </div>
  );
}
