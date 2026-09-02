"use client";

import { ClothDrape } from "@/registry/ui/cloth-drape";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const RUNS = [
  { run: "R-12", bay: "Bay 4", metres: "18.5 m", state: "cut" },
  { run: "R-13", bay: "Bay 2", metres: "22.0 m", state: "pending" },
  { run: "R-14", bay: "Bay 7", metres: "14.25 m", state: "hemmed" },
] as const;

/** A shade-cloth order card draped like the fabric it is ordering. Move the
 * cursor across it — the panel dents in under the pointer and springs back
 * out, while a slow wind keeps rolling folds through the whole sheet. */
export function ClothDrapeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ClothDrape className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · shade-cloth order
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six bays, one cut list.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The order the loft is cutting against this week, hung here the way
              the finished panels will hang over the hoop house. Run the cursor
              over it — the weave gives under the pointer and settles back once
              you move on.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Run</th>
                <th className="py-2 pr-4 text-label text-ink-3">Bay</th>
                <th className="py-2 pr-4 text-label text-ink-3">Metres</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {RUNS.map((row) => (
                <tr key={row.run} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.run}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.bay}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.metres}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cut"
                          ? "success"
                          : row.state === "pending"
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
            <PressureButton variant="solid">
              Confirm the cut list
            </PressureButton>
            <PressureButton variant="outline">Hold run 13</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              58.75 m total
            </span>
          </div>
        </div>
      </ClothDrape>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        hung like cloth
      </p>
    </div>
  );
}
