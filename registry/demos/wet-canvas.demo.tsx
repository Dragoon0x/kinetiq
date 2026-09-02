"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { WetCanvas } from "@/registry/ui/wet-canvas";

const SWATCHES = [
  { label: "primary", className: "bg-[var(--primary)]" },
  { label: "success", className: "bg-[var(--success)]" },
  { label: "warn", className: "bg-[var(--warn)]" },
  { label: "accent", className: "bg-[var(--accent-bright)]" },
  { label: "ink-3", className: "bg-[var(--ink-3)]" },
] as const;

const BEDS = [
  { plot: "P1", crop: "Broad beans", sown: "Mar 12", state: "thriving" },
  { plot: "P4", crop: "Chard", sown: "Apr 02", state: "watch" },
  { plot: "P7", crop: "Squash", sown: "Apr 20", state: "sown" },
] as const;

/** Fernworks' planting palette — a real card, still and legible until the
 * cursor drags across it and raises wet ridges from the weave beneath. */
export function WetCanvasDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <WetCanvas className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · planting palette
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every bed, the colour it is planted.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The palette the crew paints from and the beds it went into, side
              by side. Drag a finger or a cursor over the card — the paint drags
              with it, wet and glossy, before settling back into the weave.
            </p>
          </div>
          <div className="flex gap-3">
            {SWATCHES.map((swatch) => (
              <div
                key={swatch.label}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className={`size-8 rounded-2 border border-hairline ${swatch.className}`}
                />
                <span className="font-mono text-[10px] text-ink-3">
                  {swatch.label}
                </span>
              </div>
            ))}
          </div>
          <ul className="flex flex-col">
            {BEDS.map((bed) => (
              <li
                key={bed.plot}
                className="flex items-center justify-between border-b border-hairline py-2 text-sm last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-3">
                    {bed.plot}
                  </span>
                  <span className="font-medium text-ink">{bed.crop}</span>
                  <span className="font-mono text-xs text-ink-2">
                    {bed.sown}
                  </span>
                </div>
                <StatusSeal
                  variant={
                    bed.state === "thriving"
                      ? "success"
                      : bed.state === "watch"
                        ? "warn"
                        : "info"
                  }
                >
                  {bed.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">
              Log today&apos;s planting
            </PressureButton>
            <PressureButton variant="outline">Print the bed map</PressureButton>
          </div>
        </div>
      </WetCanvas>
      <p className="text-center font-mono text-[11px] text-ink-3">
        drag across the paint
      </p>
    </div>
  );
}
