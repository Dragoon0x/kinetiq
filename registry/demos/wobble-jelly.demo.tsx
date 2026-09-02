"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { WobbleJelly } from "@/registry/ui/wobble-jelly";

const LOTS = [
  { id: "FW-201", stock: "Salal", state: "ready" },
  { id: "FW-217", stock: "Western sword fern", state: "hardening" },
  { id: "FW-233", stock: "Oregon grape", state: "propagating" },
  { id: "FW-248", stock: "Twinberry", state: "sold" },
] as const;

/** A nursery card set on a slab of jelly. Press down anywhere on the card — a real mesh of vertices on springs, coupled to their neighbours — and the panel bulges outward from that point before settling back on its own. */
export function WobbleJellyDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <WobbleJelly className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · potting bench</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four lots, one soft bench.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The bench under this card is a real mesh of vertices on springs,
              coupled to their neighbours so a poke moves through the material
              instead of just the one point you touched. Press down anywhere and
              watch it settle.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Beds</p>
              <Readout size="lg" value={9} />
            </div>
            <div>
              <p className="text-label text-ink-3">Lots active</p>
              <Readout size="lg" value={162} />
            </div>
            <div>
              <p className="text-label text-ink-3">Survival</p>
              <Readout
                size="lg"
                value={94.8}
                format={(v) => `${v.toFixed(1)}%`}
              />
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {LOTS.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-2">{lot.id}</span>
                <span className="flex-1 font-medium text-ink">{lot.stock}</span>
                <StatusSeal
                  variant={
                    lot.state === "ready"
                      ? "success"
                      : lot.state === "hardening"
                        ? "warn"
                        : lot.state === "sold"
                          ? "danger"
                          : "info"
                  }
                >
                  {lot.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Water the bench</PressureButton>
            <PressureButton variant="outline">Log a lot</PressureButton>
          </div>
        </div>
      </WobbleJelly>
      <p className="font-mono text-[11px] text-ink-3">poke it</p>
    </div>
  );
}
