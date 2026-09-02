"use client";

import { DayArc } from "@/registry/ui/day-arc";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const BEDS = [
  { id: "FW-21", crop: "Seedling trays", state: "full sun" },
  { id: "FW-33", crop: "Fern understory", state: "part shade" },
  { id: "FW-40", crop: "Moss propagation", state: "shaded" },
] as const;

/** A nursery light log for Fernworks: the whole card runs on the same sun
 * the beds outside are tracking, tinting toward dawn and dusk colour and
 * casting long shadows off the type as the arc crosses the frame. Nothing
 * here answers the cursor — only the clock. */
export function DayArcDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <DayArc className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · the day arc</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One sun, tracked across the whole nursery.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The card tints and dims on the same clock the light overhead runs
              on, casting long shadows off the type at the edges of the day and
              pulling them back in at noon. Nothing here is waiting on you — the
              pace belongs to the sun, not the cursor.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Daylight hours</p>
              <Readout size="lg" value={11} format={(v) => `${v}h`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Peak UV index</p>
              <Readout size="lg" value={6.2} format={(v) => v.toFixed(1)} />
            </div>
            <div>
              <p className="text-label text-ink-3">Beds in shade</p>
              <Readout size="lg" value={9} />
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {BEDS.map((bed) => (
              <li
                key={bed.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-2">{bed.id}</span>
                <span className="flex-1 font-medium text-ink">{bed.crop}</span>
                <StatusSeal
                  variant={
                    bed.state === "full sun"
                      ? "success"
                      : bed.state === "part shade"
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
              Pull the shade cloth
            </PressureButton>
            <PressureButton variant="outline">Hold at zenith</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bed 21 · full sun
            </span>
          </div>
        </div>
      </DayArc>
      <p className="text-center font-mono text-[11px] text-ink-3">
        dawn to dusk
      </p>
    </div>
  );
}
