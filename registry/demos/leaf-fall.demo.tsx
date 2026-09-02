"use client";

import { LeafFall } from "@/registry/ui/leaf-fall";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { lot: "L-114", stock: "Vine maple", bench: "B3", state: "ready" },
  { lot: "L-108", stock: "Red osier", bench: "B1", state: "hardening" },
  { lot: "L-121", stock: "Serviceberry", bench: "B4", state: "held" },
] as const;

/** Fernworks — a nursery card with several stacked surfaces: a heading, a
 * stat row, a lot table, two buttons. Each is a ledge the leaves can land
 * on; nothing here needs a hover or a click for the effect itself. */
export function LeafFallDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LeafFall className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · closing the benches
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three lots left the propagation house.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Everything else stays under cover until the first hard frost. The
              count below is what actually moved this week, not what was
              scheduled to.
            </p>
          </div>
          <div className="flex items-center gap-6 rounded-3 border border-hairline bg-surface-2 px-4 py-3">
            <div>
              <p className="text-label text-ink-3">Lots hardened off</p>
              <Readout value={41} size="lg" />
            </div>
            <div>
              <p className="text-label text-ink-3">Benches cleared</p>
              <Readout value={7} size="lg" />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Lot</th>
                <th className="py-2 pr-4 text-label text-ink-3">Stock</th>
                <th className="py-2 pr-4 text-label text-ink-3">Bench</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {LOTS.map((row) => (
                <tr key={row.lot} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.lot}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.stock}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.bench}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "ready"
                          ? "success"
                          : row.state === "hardening"
                            ? "warn"
                            : "info"
                      }
                    >
                      {row.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Close the bench</PressureButton>
            <PressureButton variant="outline">Hold for spring</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              autumn bench count
            </span>
          </div>
        </div>
      </LeafFall>
      <p className="font-mono text-[11px] text-ink-3">
        they land, and they stay
      </p>
    </div>
  );
}
