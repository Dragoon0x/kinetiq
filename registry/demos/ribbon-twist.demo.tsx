"use client";

import * as React from "react";

import { RibbonTwist, type RibbonTwistMode } from "@/registry/ui/ribbon-twist";
import { PressureButton } from "@/registry/ui/pressure-button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";

const BERTHS = [
  { berth: "B-01", vessel: "Fair Tide", eta: "05:40", status: "Docked" },
  { berth: "B-06", vessel: "Wide Reach", eta: "06:55", status: "Inbound" },
  { berth: "B-09", vessel: "Slack Water", eta: "07:30", status: "Holding" },
  { berth: "B-03", vessel: "Grey Fen", eta: "08:15", status: "Vacant" },
] as const;

const STATUS_VARIANT = {
  Docked: "success",
  Inbound: "info",
  Holding: "warn",
  Vacant: "info",
} as const;

/** A berth board that twists about its own spine as it scrolls through the
 * midpoint of the viewport — flat when centred, turned toward its reverse
 * at either end. Switch modes above to drive the same twist on scroll, or
 * by hand. */
export function RibbonTwistDemo() {
  const [mode, setMode] = React.useState<RibbonTwistMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as RibbonTwistMode)}
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

      <RibbonTwist
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · berth board 09</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four berths, the board turns with the tide line.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The board hangs at the head of the pontoon and reads flat once it
              settles mid-frame. Scroll past it and the whole sheet twists about
              its own spine, the way a length of ribbon turns in a draught,
              showing its plain reverse before it rights itself again.
            </p>
          </div>
          <div className="flex flex-col gap-3 border-y border-hairline py-4 font-mono text-xs">
            {BERTHS.map((row) => (
              <div key={row.berth} className="flex items-center gap-3">
                <span className="w-14 text-ink-3">{row.berth}</span>
                <span className="w-16 text-ink">{row.eta}</span>
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
      </RibbonTwist>

      <p className="font-mono text-[11px] text-ink-3">turning with the page</p>
    </div>
  );
}
