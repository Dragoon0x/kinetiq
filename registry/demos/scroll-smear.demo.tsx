"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { ScrollSmear } from "@/registry/ui/scroll-smear";
import { StatusSeal } from "@/registry/ui/status-seal";

const PLOTS = [
  { plot: "A-04", transect: "T2", moisture: "18.6%", state: "surveyed" },
  { plot: "A-07", transect: "T2", moisture: "21.1%", state: "flagged" },
  { plot: "B-11", transect: "T5", moisture: "14.9%", state: "pending" },
  { plot: "B-14", transect: "T5", moisture: "19.3%", state: "surveyed" },
  { plot: "C-02", transect: "T7", moisture: "22.8%", state: "flagged" },
] as const;

/** A field report long enough to actually scroll. Run the page past it and
 * the report streaks with scroll velocity, resolving sharp the moment the
 * page settles. */
export function ScrollSmearDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ScrollSmear className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fieldline · basin survey, week 6
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Every transect the crew walked, in the order they walked it.
            </h2>
          </div>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
            <p>
              The crew covered the lower basin in six days, forty-one transects
              logged by hand and cross-checked against the probe readings that
              same evening. Nothing here is modeled; every number came out of
              the ground the same afternoon it went into this report.
            </p>
            <p>
              Moisture held above eighteen percent through most of the western
              plots, dropping fast past transect five where the old drainage
              channel cuts under the ridge. Two readings near B-11 came back low
              enough that we walked the transect twice before writing them down.
            </p>
            <p>
              Nine plots are flagged for a second pass, mostly where the soil
              color did not match what the probe reported. The rest cleared on
              the first walk and will not need the crew back before the spring
              count.
            </p>
            <p>
              The second pass goes out Thursday, weather allowing. Everything
              below is what shipped with this write-up: the plots, the readings,
              and the two calls still waiting on a signature.
            </p>
          </div>
          <div className="flex items-center gap-2 border-y border-hairline py-3">
            <Readout size="sm" value={142} />
            <span className="text-xs text-ink-3">
              plots logged this pass, 9 flagged for a second walk
            </span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Plot</th>
                <th className="py-2 pr-4 text-label text-ink-3">Transect</th>
                <th className="py-2 pr-4 text-label text-ink-3">Moisture</th>
                <th className="py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {PLOTS.map((row) => (
                <tr key={row.plot} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.plot}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.transect}
                  </td>
                  <td className="py-2 pr-4 text-ink">{row.moisture}</td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "surveyed"
                          ? "success"
                          : row.state === "flagged"
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
            <PressureButton variant="solid">File the report</PressureButton>
            <PressureButton variant="outline">Flag plot B-11</PressureButton>
          </div>
        </div>
      </ScrollSmear>
      <p className="font-mono text-[11px] text-ink-3">faster than the eye</p>
    </div>
  );
}
