"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import {
  ThermalReceipt,
  type ThermalReceiptMode,
} from "@/registry/ui/thermal-receipt";

const ITEMS = [
  { name: "Vine maple, 3-gal", price: "$34.00" },
  { name: "Serviceberry, 1-gal", price: "$18.50" },
  { name: "Red osier dogwood, bare-root", price: "$9.75" },
  { name: "Pacific ninebark, 2-gal", price: "$26.00" },
  { name: "Sword fern, 1-gal", price: "$14.25" },
] as const;

const TOTAL = 102.5;

/** A nursery order printing the way a thermal receipt does — scroll the
 * stage and the halftone dots resolve top to bottom under a moving print
 * head; switch modes above to drive the same head on a timer, or by hand. */
export function ThermalReceiptDemo() {
  const [mode, setMode] = React.useState<ThermalReceiptMode>("scroll");
  const [manualProgress, setManualProgress] = React.useState(50);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-2xl flex-col items-start gap-3">
        <SegmentedControl
          label="Mode"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as ThermalReceiptMode)}
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

      <ThermalReceipt
        mode={mode}
        progress={manualProgress / 100}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · order 2291</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Five lots, one spring order.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              What is going out on the truck this morning, itemised the way the
              counter printer does it: line by line, under a head that never
              stops to look back.
            </p>
          </div>
          <ul className="flex flex-col gap-2 border-y border-hairline py-4 font-mono text-xs">
            {ITEMS.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-ink-2">{item.name}</span>
                <span className="text-ink">{item.price}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <span className="text-label text-ink-3">Order total</span>
            <Readout
              size="lg"
              value={TOTAL}
              format={(v) => `$${v.toFixed(2)}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Send to the truck</PressureButton>
            <PressureButton variant="outline">Hold the order</PressureButton>
          </div>
        </div>
      </ThermalReceipt>

      <p className="font-mono text-[11px] text-ink-3">
        printed on the way down
      </p>
    </div>
  );
}
