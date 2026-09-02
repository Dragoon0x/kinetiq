"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { WarpGrid } from "@/registry/ui/warp-grid";

const METRICS = [
  { key: "p50", value: "42ms" },
  { key: "p95", value: "188ms" },
  { key: "p99", value: "410ms" },
  { key: "rps", value: "3,120" },
  { key: "errors", value: "0.4%" },
  { key: "saturation", value: "61%" },
] as const;

/** A load-test console for the grid to shear. Sweep slowly and the panel holds still; flick the cursor across it and the cells nearest the path shear into colour before springing back. */
export function WarpGridDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <WarpGrid className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Gaugeworks · load test</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Run 214 is holding the line.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Ten thousand virtual users, ramped over two minutes, still landing
              inside budget. The grid under this panel is the whole page — flick
              the cursor across it and watch the springs answer.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {METRICS.map((metric) => (
              <div
                key={metric.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                  {metric.key}
                </p>
                <p className="mt-1 font-mono text-lg text-ink">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Hold the ramp</PressureButton>
            <PressureButton variant="outline">Abort run</PressureButton>
          </div>
        </div>
      </WarpGrid>
      <p className="font-mono text-[11px] text-ink-3">move fast</p>
    </div>
  );
}
