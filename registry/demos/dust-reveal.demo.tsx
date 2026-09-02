"use client";

import { DustReveal } from "@/registry/ui/dust-reveal";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "FW-114", stock: "Vine maple", state: "ready" },
  { id: "FW-129", stock: "Serviceberry", state: "hardening" },
  { id: "FW-142", stock: "Red osier dogwood", state: "sold" },
  { id: "FW-158", stock: "Pacific ninebark", state: "propagating" },
] as const;

/** A nursery lot record held as dust until the cursor comes looking for it.
 * Move the cursor across the card — the grey grain coalesces into the crisp
 * record wherever it settles, and drifts back to dust everywhere else. */
export function DustRevealDemo() {
  return (
    <div className="flex w-full justify-center">
      <DustReveal className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · nursery lot record
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Fourteen beds, one growing season.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every lot the propagation house is carrying right now, held as
              fine grey dust until you come looking for it. Wherever the cursor
              settles, the record resolves — colour, edges, and all.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Beds</p>
              <Readout size="lg" value={14} />
            </div>
            <div>
              <p className="text-label text-ink-3">Lots active</p>
              <Readout size="lg" value={214} />
            </div>
            <div>
              <p className="text-label text-ink-3">Survival</p>
              <Readout
                size="lg"
                value={96.4}
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
            <PressureButton variant="solid">Release the lots</PressureButton>
            <PressureButton variant="outline">Hold bed 9</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              it settles where you look
            </span>
          </div>
        </div>
      </DustReveal>
    </div>
  );
}
