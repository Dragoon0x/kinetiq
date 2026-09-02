"use client";

import { PageCurl } from "@/registry/ui/page-curl";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { lot: "L-014", stock: "Rowan, bare-root", bed: "Bed 3", state: "ready" },
  { lot: "L-021", stock: "Hazel whips", bed: "Bed 1", state: "hardening" },
  { lot: "L-036", stock: "Field maple", bed: "Bed 6", state: "held" },
] as const;

/** A nursery log under a sheet that curls at the corner. Hover the corner and it lifts on its own; grab it and drag to peel the page back, showing its own paper underside and the bench beneath. */
export function PageCurlDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <PageCurl className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · the propagation log
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three lots, one bench worth checking.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every lot on this page came off the same cutting bench this week.
              Lift the corner before you sign off on the count, and see what is
              written on the other side.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Germination</span>
              <Readout value={86} format={(v) => `${v}%`} size="lg" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-3">Bench temp</span>
              <Readout
                value={17.8}
                format={(v) => `${v.toFixed(1)}C`}
                size="lg"
              />
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {LOTS.map((row) => (
              <li
                key={row.lot}
                className="flex items-center gap-4 py-2 text-sm"
              >
                <span className="w-16 shrink-0 font-mono text-xs text-ink-2">
                  {row.lot}
                </span>
                <span className="flex-1 font-medium text-ink">{row.stock}</span>
                <span className="font-mono text-xs text-ink-3">{row.bed}</span>
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
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Sign off the count</PressureButton>
            <PressureButton variant="outline">Flag bed 6</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bench 2 · week 14
            </span>
          </div>
        </div>
      </PageCurl>
      <p className="font-mono text-xs text-ink-3">lift the corner</p>
    </div>
  );
}
