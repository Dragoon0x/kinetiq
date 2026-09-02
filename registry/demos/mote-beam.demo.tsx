"use client";

import { MoteBeam } from "@/registry/ui/mote-beam";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "L-214", stock: "Fern, Boston", trays: 18, state: "ready" },
  { id: "L-208", stock: "Fern, Maidenhair", trays: 9, state: "hardening" },
  { id: "L-221", stock: "Fern, Staghorn", trays: 4, state: "held" },
] as const;

/** A propagation-house card on a dark bench, pinned to the same dark colour
 * in either theme so the shaft and its dust always have somewhere dim to
 * fall across — a lot list, a tray count, two controls. Move the cursor
 * through the light and the dust in it drifts clear of the glass without a
 * single tray moving. */
export function MoteBeamDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <MoteBeam className="w-full max-w-2xl rounded-4 border border-white/10 bg-[#0b1020]">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-[#e5e7eb]/60">
              Fernworks · propagation house 3
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#e5e7eb] sm:text-3xl">
              Morning light, row by row.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#e5e7eb]/80">
              The east glass throws one long shaft across the benches every
              clear morning. Nothing on the trays has moved — only the light
              crossing them has.
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {LOTS.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-[#e5e7eb]">
                    {lot.stock}
                  </span>
                  <span className="font-mono text-xs text-[#e5e7eb]/60">
                    {lot.id} · {lot.trays} trays
                  </span>
                </div>
                <StatusSeal
                  variant={
                    lot.state === "ready"
                      ? "success"
                      : lot.state === "hardening"
                        ? "warn"
                        : "info"
                  }
                >
                  {lot.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
            <div className="flex flex-col">
              <span className="text-label text-[#e5e7eb]/60">
                Trays under light
              </span>
              <Readout value={31} size="sm" className="text-[#e5e7eb]" />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <PressureButton variant="solid">Release lot 214</PressureButton>
              <PressureButton
                variant="outline"
                className="border-white/20 text-[#e5e7eb] hover:bg-white/10"
              >
                Hold bench 3
              </PressureButton>
            </div>
          </div>
        </div>
      </MoteBeam>
      <p className="text-center font-mono text-[11px] text-ink-3">
        the dust in it
      </p>
    </div>
  );
}
