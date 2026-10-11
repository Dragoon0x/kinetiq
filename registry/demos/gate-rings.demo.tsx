"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GateRings } from "@/registry/ui/gate-rings";

export const tweaks = defineTweaks({
  ringCount: {
    kind: "range",
    label: "Rings",
    default: 5,
    min: 3,
    max: 7,
    step: 1,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "brass",
    options: ["brass", "steel", "copper", "smoke"],
    names: { brass: "Brass", steel: "Steel", copper: "Copper", smoke: "Smoke" },
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Lightworks, beam test at gate 3: spin the gimbals and wait for
 * the gaps to come round into line.
 */
export function GateRingsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [halo, setHalo] = React.useState(false);
  const [beam, setBeam] = React.useState({ through: true, inLine: -1 });
  const count = Math.round(values.ringCount ?? tweaks.ringCount.default);
  const inLine = beam.inLine < 0 ? count : Math.min(beam.inLine, count);

  const rings = (
    <GateRings
      aligned={halo}
      onAlignedChange={setHalo}
      onBeamChange={(through, n) => setBeam({ through, inLine: n })}
      label="Beam test gate"
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {rings}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks Lightworks · gate 3
        </p>
        <p className="text-sm font-medium text-foreground">
          Drag to spin, click to align
        </p>
      </div>
      <div
        className="w-full overflow-clip rounded-3 border border-hairline bg-surface-2"
        style={{ height: 260 }}
      >
        {rings}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {halo ? (
          <>
            <span className="text-signal">halo</span> · rings flat, beam through
          </>
        ) : beam.through ? (
          <>
            <span className="text-signal">in line</span> · beam through {count}{" "}
            rings
          </>
        ) : (
          <>
            <span className="text-signal">spinning</span> · {inLine} of {count}{" "}
            gaps in line
          </>
        )}
      </p>
    </div>
  );
}
