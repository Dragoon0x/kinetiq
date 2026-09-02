"use client";

import { ChromeInk } from "@/registry/ui/chrome-ink";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

const SPECS = [
  { key: "plate", value: "18 microns" },
  { key: "gloss", value: "94 GU" },
  { key: "hardness", value: "620 HV" },
  { key: "adhesion", value: "class 5" },
  { key: "passivation", value: "trivalent" },
  { key: "base metal", value: "nickel/steel" },
] as const;

/** A chrome-plated instrument bench. Move the cursor across it and the sky and ground it reflects tilt and slide the way a real mirror finish answers to whatever passes over it. */
export function ChromeInkDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ChromeInk className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Gaugeworks · the plating line
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Panel 12 comes off the line mirror-bright.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every dial face and rivet on this bench went through the same
              trivalent bath, buffed to one gloss standard. Run the cursor
              across it and watch the shop light answer straight off the metal.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SPECS.map((spec) => (
              <div
                key={spec.key}
                className="rounded-3 border border-hairline bg-surface-2 px-3 py-2"
              >
                <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
                  {spec.key}
                </p>
                <p className="mt-1 font-mono text-sm text-ink">{spec.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label text-ink-3">Gloss reading</span>
            <Readout
              value={94.2}
              format={(v) => `${v.toFixed(1)} GU`}
              size="lg"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Certify the finish</PressureButton>
            <PressureButton variant="outline">Send back to buff</PressureButton>
          </div>
        </div>
      </ChromeInk>
      <p className="font-mono text-xs text-ink-3">polished steel</p>
    </div>
  );
}
