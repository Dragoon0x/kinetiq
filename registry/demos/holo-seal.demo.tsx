"use client";

import { HoloSeal } from "@/registry/ui/holo-seal";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { lot: "L-108", variety: "Ostrich fern", state: "ready" },
  { lot: "L-114", variety: "Maidenhair fern", state: "ready" },
  { lot: "L-121", variety: "Sword fern", state: "ready" },
] as const;

/** A propagation-house release card. Each lot that cleared inspection wears
 * a small foil badge — move the cursor over the card and the badges catch
 * the light like real holographic foil, turning colour with the angle from
 * the centre to the pointer. */
export function HoloSealDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <HoloSeal className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · propagation house 3
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three lots cleared inspection today.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every lot that passes leaves the house with a foil seal pressed
              into its tag, the same way a certificate would be stamped by hand.
              Nothing about the tag itself changes; only the light across it
              does.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Ready to ship</p>
              <Readout size="lg" value={646} />
            </div>
            <div>
              <p className="text-label text-ink-3">Beds cleared</p>
              <Readout size="lg" value={12} />
            </div>
            <div>
              <p className="text-label text-ink-3">Avg. moisture</p>
              <Readout size="lg" value={62} format={(v) => `${v}%`} />
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {LOTS.map((lot) => (
              <li
                key={lot.lot}
                className="flex items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-3">
                    {lot.lot}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {lot.variety}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    data-holo
                    className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink-2 uppercase"
                  >
                    certified
                  </span>
                  <StatusSeal variant="success">{lot.state}</StatusSeal>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Release the lots</PressureButton>
            <PressureButton variant="outline">Hold for relabel</PressureButton>
          </div>
        </div>
      </HoloSeal>
      <p className="font-mono text-[11px] text-ink-3">
        a rainbow that moves when you do
      </p>
    </div>
  );
}
