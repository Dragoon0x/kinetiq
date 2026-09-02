"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { ThunderShade } from "@/registry/ui/thunder-shade";

const GATES = [
  { name: "Gate A", detail: "Main spillway, north wall", state: "open" },
  { name: "Gate B", detail: "Auxiliary release", state: "holding" },
  { name: "Gate C", detail: "Emergency overflow", state: "sealed" },
] as const;

/** Basinworks' gauge board under a rolling storm. The cloud shadow drifts on
 * its own while the cursor rests over the card and freezes the moment it
 * leaves; click anywhere and a bolt forks down to the impact point,
 * flashing the board white for an instant and leaving a scorch mark that
 * fades over the following second. */
export function ThunderShadeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ThunderShade className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Basinworks · reservoir board
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              A storm crossing the watershed.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The gauge board still reads true under the weather. Rest the
              cursor on the card and the cloud shadow drifts with the front;
              click anywhere and it strikes, same as the sky above the dam.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
            <div>
              <p className="text-label text-ink-3">Level</p>
              <Readout
                size="lg"
                value={118.4}
                format={(v) => `${v.toFixed(1)} m`}
              />
            </div>
            <div>
              <p className="text-label text-ink-3">Inflow</p>
              <Readout size="lg" value={62} format={(v) => `${v} m3/s`} />
            </div>
            <div>
              <p className="text-label text-ink-3">Spillway</p>
              <Readout size="lg" value={35} format={(v) => `${v}%`} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Gate</th>
                <th className="py-2 pr-4 text-label text-ink-3">Detail</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((gate) => (
                <tr key={gate.name} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-medium text-ink">
                    {gate.name}
                  </td>
                  <td className="py-2 pr-4 text-xs text-ink-2">
                    {gate.detail}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        gate.state === "open"
                          ? "success"
                          : gate.state === "holding"
                            ? "warn"
                            : "info"
                      }
                    >
                      {gate.state}
                    </StatusSeal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Open gate B</PressureButton>
            <PressureButton variant="outline">Hold the board</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              118.4 m · rising
            </span>
          </div>
        </div>
      </ThunderShade>
      <p className="font-mono text-[11px] text-ink-3">click, and it strikes</p>
    </div>
  );
}
