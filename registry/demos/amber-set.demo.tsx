"use client";

import { AmberSet } from "@/registry/ui/amber-set";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "FW-114", stock: "Vine maple", state: "sealed" },
  { id: "FW-129", stock: "Serviceberry", state: "curing" },
  { id: "FW-142", stock: "Red osier dogwood", state: "released" },
  { id: "FW-158", stock: "Pacific ninebark", state: "curing" },
] as const;

/** A nursery lot record set in a slab of amber. The record sits still and
 * true at the centre, bends and warms toward the edges, and carries its own
 * slow drift of trapped inclusions regardless of the cursor. */
export function AmberSetDemo() {
  return (
    <div className="flex w-full justify-center">
      <AmberSet className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · nursery lot record
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every lot the season set aside.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Once a lot clears the propagation house it goes into the archive
              exactly as it stood — nothing added, nothing pruned. The record
              does not move. Only the resin around it does.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Vaulted</p>
              <Readout size="lg" value={214} />
            </div>
            <div>
              <p className="text-label text-ink-3">Beds held</p>
              <Readout size="lg" value={14} />
            </div>
            <div>
              <p className="text-label text-ink-3">Years kept</p>
              <Readout size="lg" value={7.5} format={(v) => `${v}y`} />
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
                    lot.state === "sealed"
                      ? "success"
                      : lot.state === "curing"
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
            <PressureButton variant="solid">Seal the lot</PressureButton>
            <PressureButton variant="outline">Hold release</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              kept, in amber
            </span>
          </div>
        </div>
      </AmberSet>
    </div>
  );
}
