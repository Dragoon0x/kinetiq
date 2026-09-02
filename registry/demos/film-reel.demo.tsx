"use client";

import { FilmReel } from "@/registry/ui/film-reel";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";

const FRAMES = [
  {
    frame: "F014",
    logged: "1988.03.02",
    scene: "Vault door survey",
    state: "kept",
  },
  {
    frame: "F031",
    logged: "1988.03.09",
    scene: "Coolant gauge check",
    state: "logged",
  },
  {
    frame: "F048",
    logged: "1988.03.17",
    scene: "Night watch handover",
    state: "faded",
  },
  {
    frame: "F065",
    logged: "1988.03.24",
    scene: "Loading dock sweep",
    state: "damaged",
  },
] as const;

/** An archive reel card, projected off the vault's own 35mm print: the
 * entries stay readable while the frame itself weaves in the gate, grains,
 * and picks up the odd speck or hair, all stepping on the projector's own
 * clock rather than the screen's. */
export function FilmReelDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FilmReel className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Coldbrook · archive</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Reel 9 · spring ledger
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Run off the vault&apos;s own projector, not a scan of one. The
              gate weaves a little every frame, dust lands where dust always
              lands on this print, and the whole thing warms toward sepia at the
              edges the way a lamp-lit reel actually looks.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Frame</th>
                <th className="py-2 pr-4 text-label text-ink-3">Logged</th>
                <th className="py-2 pr-4 text-label text-ink-3">Scene</th>
                <th className="py-2 text-label text-ink-3">State</th>
              </tr>
            </thead>
            <tbody>
              {FRAMES.map((row) => (
                <tr key={row.frame} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.frame}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.logged}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.scene}
                  </td>
                  <td className="py-2">
                    <StatusSeal
                      variant={
                        row.state === "kept"
                          ? "success"
                          : row.state === "logged"
                            ? "info"
                            : row.state === "faded"
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
            <PressureButton variant="solid">Catalogue the reel</PressureButton>
            <PressureButton variant="outline">Flag the frame</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              18 fps · F065
            </span>
          </div>
        </div>
      </FilmReel>
      <p className="text-center font-mono text-[11px] text-ink-3">reel two</p>
    </div>
  );
}
