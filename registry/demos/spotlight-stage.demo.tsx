"use client";

import * as React from "react";

import { SpotlightStage, type StageAct } from "@/registry/ui/spotlight-stage";

/** THE PENDULUM — pivot, rod, and bob caught mid-swing. */
function PendulumGlyph() {
  return (
    <span className="flex h-7 origin-top rotate-12 flex-col items-center">
      <span className="bg-ink-3 size-1 rounded-full" />
      <span className="bg-ink-2 h-3 w-px" />
      <span className="border-ink-2 bg-cobalt-wash size-3 rounded-full border-2" />
    </span>
  );
}

/** THE PRISM — a solid triangle waiting for the beam to split. */
function PrismGlyph() {
  return (
    <span className="flex h-7 items-end justify-center pb-0.5">
      <span className="border-b-ink-2 size-0 border-x-[9px] border-b-[15px] border-x-transparent" />
    </span>
  );
}

/** THE COIL — three windings of a spring, seen from the wings. */
function CoilGlyph() {
  return (
    <span className="flex h-7 flex-col items-center justify-end gap-[3px] pb-0.5">
      <span className="border-ink-2 h-[5px] w-6 rounded-full border-2" />
      <span className="border-ink-2 h-[5px] w-6 rounded-full border-2" />
      <span className="border-ink-2 h-[5px] w-6 rounded-full border-2" />
    </span>
  );
}

/** The KQ-128 bill — three acts, fixed order, the programme never varies. */
const ACTS: StageAct[] = [
  { id: "pendulum", label: "THE PENDULUM", node: <PendulumGlyph /> },
  { id: "prism", label: "THE PRISM", node: <PrismGlyph /> },
  { id: "coil", label: "THE COIL", node: <CoilGlyph /> },
];

/**
 * SpotlightStage dressed as the KQ-128 evening programme: three instrument
 * acts wait dim on a dark stage while the beam sweeps with your pointer.
 * Click an act the light has found — or focus and press Enter — and it holds
 * the spot; the readout mirrors every change of bill.
 */
export function SpotlightStageDemo() {
  // KQ-128 opens with the stage dark; the readout follows onSpot only.
  const [spot, setSpot] = React.useState<string | null>(null);
  const current = ACTS.find((act) => act.id === spot);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            EVENING PROGRAMME &middot; 03 Acts
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-128</span>
        </div>

        <SpotlightStage
          acts={ACTS}
          height={240}
          onSpot={setSpot}
          aria-label="Evening programme"
        />

        {/* Bill readout — mirrors onSpot, one line per change of light. */}
        <p role="status" className="text-label text-ink-3 mt-4 text-center">
          {current ? (
            <>
              ON STAGE &middot;{" "}
              <span className="text-signal">{current.label}</span>
            </>
          ) : (
            <>STAGE OPEN</>
          )}
        </p>

        <p className="border-hairline text-ink-3 mt-4 border-t pt-3 font-mono text-[10px] tracking-[0.15em] uppercase">
          KQ-128 &middot; Spotlight Stage &middot; 03 acts &middot; &sigma; one
          plate &middot; &zeta; 0.83
        </p>
      </div>

      <p className="text-label text-ink-3 text-center">
        Sweep the beam - click an act to hold it in the light.
      </p>
    </div>
  );
}
