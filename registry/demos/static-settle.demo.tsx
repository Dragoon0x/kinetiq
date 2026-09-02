"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StaticSettle } from "@/registry/ui/static-settle";
import { StatusSeal } from "@/registry/ui/status-seal";

const DIALS = [
  { id: "D-01", gauge: "Line pressure", state: "in tolerance" },
  { id: "D-04", gauge: "Coolant flow", state: "drifting" },
  { id: "D-06", gauge: "Bearing temp", state: "in tolerance" },
] as const;

/** A calibration bench read through a dead channel's worth of noise. Hold
 * the cursor still over a dial and the static clears around it once the
 * hand has actually stopped; nudge it and the noise closes back over. */
export function StaticSettleDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <StaticSettle className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · calibration bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six dials, one steady hand.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The feed off this bench runs noisy by default — every dial behind
              a wash of grain and a slow rolling band. Hold the cursor over one
              and stop moving it; the static only clears once your hand actually
              has.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Dials tracked</p>
              <Readout size="lg" value={6} />
            </div>
            <div>
              <p className="text-label text-ink-3">Drift tolerance</p>
              <Readout size="lg" value={0.4} format={(v) => `${v}%`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Calibrated today</p>
              <Readout size="lg" value={19} />
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {DIALS.map((dial) => (
              <li
                key={dial.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-2">{dial.id}</span>
                <span className="flex-1 font-medium text-ink">
                  {dial.gauge}
                </span>
                <StatusSeal
                  variant={dial.state === "in tolerance" ? "success" : "warn"}
                >
                  {dial.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the calibration</PressureButton>
            <PressureButton variant="outline">Flag dial D-04</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 3 · shift 2
            </span>
          </div>
        </div>
      </StaticSettle>
      <p className="font-mono text-xs text-ink-3">noise, until you rest</p>
    </div>
  );
}
