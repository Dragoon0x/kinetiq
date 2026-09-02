"use client";

import { FaxFeed } from "@/registry/ui/fax-feed";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { plot: "T-03", surveyor: "Kade Orr", logged: "09:14", state: "confirmed" },
  { plot: "T-07", surveyor: "Bree Lin", logged: "09:26", state: "pending" },
  { plot: "T-11", surveyor: "Kade Orr", logged: "09:41", state: "flagged" },
] as const;

/** A field report printing in as it arrives — dithered, streaked, dropping
 * the odd row, the way the office machine used to hand it over one pass at
 * a time. No cursor needed: it keeps coming through on its own. */
export function FaxFeedDemo() {
  return (
    <div className="flex w-full justify-center">
      <FaxFeed className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fieldline · morning transects
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Six transects, one clean report.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every reading the crew logged this morning, arriving the way the
              office machine used to print it — one line at a time, static and
              all.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Plot</th>
                <th className="py-2 pr-4 text-label text-ink-3">Surveyor</th>
                <th className="py-2 pr-4 text-label text-ink-3">Logged</th>
                <th className="py-2 text-label text-ink-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.plot} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.plot}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.surveyor}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.logged}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "confirmed"
                          ? "success"
                          : row.state === "pending"
                            ? "warn"
                            : "danger"
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
            <PressureButton variant="solid">Send the report</PressureButton>
            <PressureButton variant="outline">Hold transect 7</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              coming through
            </span>
          </div>
        </div>
      </FaxFeed>
    </div>
  );
}
