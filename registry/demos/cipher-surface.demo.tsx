"use client";

import { CipherSurface } from "@/registry/ui/cipher-surface";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  {
    code: "BW-4471-A",
    hold: "Hold 1",
    cargo: "Timber, kiln-dried",
    state: "cleared",
  },
  { code: "BW-4482-C", hold: "Hold 2", cargo: "Steel coil", state: "holding" },
  { code: "BW-4490-B", hold: "Hold 3", cargo: "Grain, bulk", state: "inbound" },
  {
    code: "BW-4501-D",
    hold: "Hold 4",
    cargo: "Machinery parts",
    state: "cleared",
  },
] as const;

/** A berth manifest — heading, prose, a table of mono codes, controls — for
 * the cipher to encode. The whole board ciphers into glyphs at rest; bring
 * the cursor close and the wavefront decodes the real manifest underneath. */
export function CipherSurfaceDemo() {
  return (
    <div className="flex w-full justify-center">
      <CipherSurface className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · the berth manifest
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four holds, one manifest, no surprises.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every hold on this manifest ciphers into glyphs the moment the
              page settles — the numbers underneath are still live, still
              clickable, still exactly what dispatch signed off on.
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run the cursor across the table and watch the wavefront peel the
              glyphs back into the real manifest, code by code, before they
              scramble shut again the moment you look away.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Code</th>
                <th className="py-2 pr-4 text-label text-ink-3">Hold</th>
                <th className="py-2 pr-4 text-label text-ink-3">Cargo</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.code} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.code}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">{row.hold}</td>
                  <td className="py-2 pr-4 text-ink-2">{row.cargo}</td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "cleared"
                          ? "success"
                          : row.state === "holding"
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
            <PressureButton variant="solid">Confirm manifest</PressureButton>
            <PressureButton variant="outline">Flag a hold</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              14:20 · draft 8.2 m
            </span>
          </div>
          <p className="text-xs text-ink-3">Bring the cursor close.</p>
        </div>
      </CipherSurface>
    </div>
  );
}
