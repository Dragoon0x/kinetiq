"use client";

import { CrossStitch } from "@/registry/ui/cross-stitch";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "FW-301", stock: "Doug fir starts", state: "propagating" },
  { id: "FW-312", stock: "Salal", state: "ready" },
  { id: "FW-326", stock: "Oregon grape", state: "hardening" },
  { id: "FW-340", stock: "Twinberry", state: "sold" },
] as const;

/** Fernworks' lot board, laid out as cross-stitch on linen. The board never
 * moves for a pointer -- it just sits there, every square holding its own
 * slow shimmer, quantised cell by cell out of the record underneath. */
export function CrossStitchDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CrossStitch className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · the lot board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Nine lots, one cross-stitched board.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every lot the greenhouse is carrying, squared off onto woven
              linen. Bare ground shows the weave and its own small grid of
              holes; anything actually growing gets crossed in thread the colour
              of its own record.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Rows</p>
              <Readout size="lg" value={9} />
            </div>
            <div>
              <p className="text-label text-ink-3">Lots active</p>
              <Readout size="lg" value={126} />
            </div>
            <div>
              <p className="text-label text-ink-3">Germination</p>
              <Readout
                size="lg"
                value={91.2}
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
                        : "info"
                  }
                >
                  {lot.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Stitch the board</PressureButton>
            <PressureButton variant="outline">Hold lot FW-312</PressureButton>
          </div>
        </div>
      </CrossStitch>
      <p className="font-mono text-[11px] text-ink-3">thread by thread</p>
    </div>
  );
}
