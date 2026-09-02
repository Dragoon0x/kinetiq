"use client";

import { HexFloor } from "@/registry/ui/hex-floor";
import { PressureButton } from "@/registry/ui/pressure-button";

const ZONES = [
  { zone: "A1", temp: "-18.2°C" },
  { zone: "A2", temp: "-17.6°C" },
  { zone: "B1", temp: "-19.4°C" },
  { zone: "B2", temp: "-16.9°C" },
  { zone: "C1", temp: "-18.8°C" },
  { zone: "C2", temp: "-15.3°C" },
] as const;

/** Coldbrook's cold-floor map, laid over a floor of hex prisms standing at
 * their own seeded height. Move the cursor across the grid — the prisms
 * under it flatten so the zone being read sits flush, while the rest of the
 * floor keeps standing in relief. */
export function HexFloorDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <HexFloor className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · cold-floor map</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six zones, one cold floor.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every zone the warehouse is holding tonight, standing in relief
              until the cursor comes looking for one. Wherever it settles, that
              reading sits flat and legible while the rest of the floor keeps
              its shape.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 border-y border-hairline py-4">
            {ZONES.map((z) => (
              <div
                key={z.zone}
                className="rounded-2 border border-hairline px-3 py-2"
              >
                <p className="font-mono text-[11px] text-ink-3">
                  Zone {z.zone}
                </p>
                <p className="font-mono text-lg font-semibold text-ink">
                  {z.temp}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log the floor</PressureButton>
            <PressureButton variant="outline">Hold zone B2</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              6 zones · night shift
            </span>
          </div>
        </div>
      </HexFloor>
      <p className="font-mono text-[11px] text-ink-3">flat where you look</p>
    </div>
  );
}
