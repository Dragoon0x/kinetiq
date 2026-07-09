"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { WheelPicker, type WheelPickerOption } from "@/registry/ui/wheel-picker";

/** Fixed exposure ladder — eight stops, 1/500 out to 4s, never random. */
const STOPS: WheelPickerOption[] = [
  { value: "1/500", label: "1/500" },
  { value: "1/250", label: "1/250" },
  { value: "1/125", label: "1/125" },
  { value: "1/60", label: "1/60" },
  { value: "1/15", label: "1/15" },
  { value: "1/4", label: "1/4" },
  { value: "1s", label: "1s" },
  { value: "4s", label: "4s" },
];

const DEFAULT_STOP = "1/125";

/**
 * WheelPicker as a bench instrument: the KQ-077 shutter drum on a bezel plate
 * with corner ticks, beside a readout card that mirrors the committed stop.
 * The readout only moves when the drum settles on a detent.
 */
export function WheelPickerDemo() {
  const labelId = React.useId();
  const [committed, setCommitted] = React.useState(DEFAULT_STOP);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Shutter Drum &middot; 8 Stops
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-077</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5">
          {/* The labeled field: the drum reads its name from the label above. */}
          <div className="min-w-0 flex-1 basis-52">
            <p id={labelId} className="mb-2 text-label text-ink-2">
              Exposure Preset
            </p>
            <WheelPicker
              aria-labelledby={labelId}
              options={STOPS}
              defaultValue={DEFAULT_STOP}
              onValueChange={setCommitted}
            />
          </div>

          {/* Settled readout — mirrors the committed stop, one move per settle. */}
          <div className="w-40 shrink-0 rounded-3 border border-hairline bg-surface-1 p-4">
            <p className="text-label text-ink-3">Committed</p>
            <p
              role="status"
              className="mt-1 font-mono text-lg text-signal tabular-nums"
            >
              {committed}
            </p>
            <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-snug text-ink-3">
              Fires once per settle.
            </p>
          </div>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-077 &middot; Wheel Picker &middot; Rows 5 &middot; P 700 &middot;
          &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag, scroll, or type a digit - the drum settles on a detent.
      </p>
    </div>
  );
}
