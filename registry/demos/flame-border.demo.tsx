"use client";

import { FlameBorder } from "@/registry/ui/flame-border";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

/** A hot-path alert card for Gaugeworks: three readings running close to
 * their limits, ringed in fire that licks inward from every edge of the
 * card while the numbers themselves stay perfectly still to read. */
export function FlameBorderDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FlameBorder className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · hot path</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Rack 6 is running at its edge.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Three readings, all trending the same direction at once. Nothing
              has tripped yet, and the margin below is the only number here
              still moving in your favour.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Temperature</p>
              <Readout
                size="lg"
                value={94.2}
                format={(v) => `${v.toFixed(1)}°C`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Load</p>
              <Readout size="lg" value={88} format={(v) => `${v}%`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Margin</p>
              <Readout size="lg" value={6} format={(v) => `${v}%`} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Throttle rack 6</PressureButton>
            <PressureButton variant="outline" holdToConfirm={900}>
              Force shutdown
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              06:41 uptime
            </span>
          </div>
        </div>
      </FlameBorder>
      <p className="text-center font-mono text-[11px] text-ink-3">
        wrapped in fire
      </p>
    </div>
  );
}
