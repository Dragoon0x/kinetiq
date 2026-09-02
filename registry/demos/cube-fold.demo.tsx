"use client";

import * as React from "react";

import { CubeFold, type CubeFoldMode } from "@/registry/ui/cube-fold";
import { PressureButton } from "@/registry/ui/pressure-button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B-04", eta: "06:12", vessel: "Kestrel Wake", status: "Docked" },
  { berth: "B-07", eta: "07:45", vessel: "Northerly Run", status: "Inbound" },
  { berth: "B-11", eta: "08:30", vessel: "Salt Fen", status: "Holding" },
  { berth: "B-02", eta: "09:05", vessel: "Open Reach", status: "Vacant" },
] as const;

const STATUS_VARIANT = {
  Docked: "success",
  Inbound: "info",
  Holding: "warn",
  Vacant: "info",
} as const;

/** A berth manifest that folds in as the marina board scrolls into view —
 * the top and bottom bands hinge away in perspective and meet flat at the
 * midpoint of the scroll. Switch modes above to drive the same fold on
 * scroll, or by hand. */
export function CubeFoldDemo() {
  const [mode, setMode] = React.useState<CubeFoldMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as CubeFoldMode)}
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

      <CubeFold
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Waylight · berth manifest 04
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four berths, the chart folds in with the tide.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The harbourmaster posts the manifest at first light. As the board
              scrolls into view it hinges up over its own top and bottom edge,
              the way a chart folds shut on a chart table, and lies flat once
              the whole berth line is in frame.
            </p>
          </div>
          <div className="flex flex-col gap-3 border-y border-hairline py-4 font-mono text-xs">
            {BERTHS.map((row) => (
              <div key={row.berth} className="flex items-center gap-3">
                <span className="w-12 text-ink-3">{row.berth}</span>
                <span className="w-14 text-ink">{row.eta}</span>
                <span className="flex-1 text-ink-2">{row.vessel}</span>
                <StatusSeal variant={STATUS_VARIANT[row.status]}>
                  {row.status}
                </StatusSeal>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Assign berth</PressureButton>
            <PressureButton variant="outline">Release hold</PressureButton>
          </div>
        </div>
      </CubeFold>

      <p className="font-mono text-[11px] text-ink-3">folds as it passes</p>
    </div>
  );
}
