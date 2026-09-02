"use client";

import { BonfireEdge } from "@/registry/ui/bonfire-edge";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const WATCHES = [
  {
    glass: "First glass",
    officer: "Vane",
    started: "20:00",
    state: "steady",
  },
  {
    glass: "Middle glass",
    officer: "Orsic",
    started: "00:00",
    state: "alert",
  },
  {
    glass: "Morning glass",
    officer: "Halvard",
    started: "04:00",
    state: "standing by",
  },
] as const;

/** A night-watch board with a fire kept along its bottom rail. Move the cursor near the rail — the flames lean toward it and climb higher. */
export function BonfireEdgeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <BonfireEdge className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 pb-16 sm:p-8 sm:pb-20">
          <div>
            <p className="text-label text-ink-3">Waylight · the night watch</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Three glasses, one fire kept burning.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The rail stays lit from dusk to first light. Whoever holds the
              deck logs the glass, minds the flame, and hands the watch on
              clean.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Glass</th>
                <th className="py-2 pr-4 text-label text-ink-3">Officer</th>
                <th className="py-2 pr-4 text-label text-ink-3">Started</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {WATCHES.map((row) => (
                <tr key={row.glass} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.glass}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.officer}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.started}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "steady"
                          ? "success"
                          : row.state === "alert"
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
            <PressureButton variant="solid">Log the watch</PressureButton>
            <PressureButton variant="outline">
              Ring the next glass
            </PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              23:40 · glass 1
            </span>
          </div>
        </div>
      </BonfireEdge>
      <p className="font-mono text-xs text-ink-3">warm at the edge</p>
    </div>
  );
}
