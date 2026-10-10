"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ScanBed } from "@/registry/ui/scan-bed";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  subject: {
    kind: "choice",
    label: "Subject",
    default: "stone",
    options: ["stone", "dunes", "crater"],
    names: { stone: "Stone", dunes: "Dunes", crater: "Crater" },
  },
});

/**
 * Gaugeworks Scan, a measuring service: the booking card sits on the bed of
 * the scanner itself, and the beam reads whatever lies there.
 */
export function ScanBedDemo({
  chrome = true,
  // The bed is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tilting, setTilting] = React.useState(false);
  const subject = values.subject ?? "stone";
  const speed = values.speed ?? 1;

  const bed = (
    <ScanBed
      onActiveChange={setTilting}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/95 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Scan
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Measured to a tenth of a millimetre
          </p>
          {chrome ? (
            <button
              type="button"
              className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Book a scan
            </button>
          ) : null}
        </div>
      </div>
    </ScanBed>
  );

  if (!chrome) return <div className="flex w-full">{bed}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {bed}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {tilting ? (
          <>
            <span className="text-signal">tilted</span> · the relief turns with
            you
          </>
        ) : (
          <>
            <span className="text-signal">reading</span> · {subject} · beam{" "}
            {speed}×
          </>
        )}
      </p>
    </div>
  );
}
