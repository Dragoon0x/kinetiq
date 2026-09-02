"use client";

import { FocusPull } from "@/registry/ui/focus-pull";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

/** An instrument bench for the lens to read. Move the cursor across it — a ring stays sharp under the pointer while the rest of the bench falls softly out of focus, the way a shallow lens sees a close dial. */
export function FocusPullDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FocusPull className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · the instrument bench
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              One dial in focus at a time.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every instrument on this bench is real and reads live. Move the
              cursor across it and only the ring underneath stays crisp — the
              rest eases out of focus the way a close lens sees a bench, not a
              filter laid over it.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-label text-ink-3">Model</dt>
              <dd className="font-mono text-ink">GW-2200 dial gauge</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Class</dt>
              <dd className="font-mono text-ink">0.5, precision</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Span</dt>
              <dd className="font-mono text-ink">0 – 160 kPa</dd>
            </div>
            <div>
              <dt className="text-label text-ink-3">Last calibrated</dt>
              <dd className="font-mono text-ink">14 days ago</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-4">
            <div>
              <p className="text-label text-ink-3">Live reading</p>
              <Readout value={84} format={(v) => `${v} kPa`} size="md" />
            </div>
            <div>
              <p className="text-label text-ink-3">Drift</p>
              <Readout value={2} format={(v) => `${v}%`} size="md" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Calibrate now</PressureButton>
            <PressureButton variant="outline">Log the drift</PressureButton>
          </div>
        </div>
      </FocusPull>
      <p className="font-mono text-[11px] text-ink-3">sharp where you look</p>
    </div>
  );
}
