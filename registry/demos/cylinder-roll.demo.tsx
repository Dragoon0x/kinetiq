"use client";

import * as React from "react";

import {
  CylinderRoll,
  type CylinderRollMode,
} from "@/registry/ui/cylinder-roll";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  { gate: "G-1", head: "3.2 m", status: "Open" },
  { gate: "G-2", head: "1.8 m", status: "Holding" },
  { gate: "G-3", head: "0.0 m", status: "Closed" },
  { gate: "G-4", head: "2.6 m", status: "Open" },
] as const;

const STATUS_VARIANT = {
  Open: "success",
  Holding: "warn",
  Closed: "info",
} as const;

/** A reservoir board wrapped around a drum that rolls into view as it
 * scrolls, the gate table and readouts turning with the rest of the page.
 * Switch modes above to drive the same roll on scroll, or by hand. */
export function CylinderRollDemo() {
  const [mode, setMode] = React.useState<CylinderRollMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as CylinderRollMode)}
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

      <CylinderRoll
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · reservoir control
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four gates, one head of water, level to the millimetre.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The whole board turns with the page, the way a drum gauge turns
              past its own seam. Scroll it into view, or take the wheel yourself
              with the slider above.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Reservoir level</p>
              <Readout
                value={41.8}
                format={(v) => `${v.toFixed(1)} m`}
                size="md"
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout value={12} format={(v) => `${v} m³/s`} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Outflow</p>
              <Readout value={9} format={(v) => `${v} m³/s`} size="md" />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Head</th>
                <th className="py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((row) => (
                <tr key={row.gate} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.gate}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.head}
                  </td>
                  <td className="py-2">
                    <StatusSeal variant={STATUS_VARIANT[row.status]}>
                      {row.status}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Open gate 3</PressureButton>
            <PressureButton variant="outline">Hold spillway</PressureButton>
          </div>
        </div>
      </CylinderRoll>

      <p className="font-mono text-[11px] text-ink-3">rolling</p>
    </div>
  );
}
