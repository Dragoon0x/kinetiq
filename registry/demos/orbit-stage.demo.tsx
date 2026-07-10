"use client";

import * as React from "react";

import { OrbitStage, type StagePlate } from "@/registry/ui/orbit-stage";

/** Chip voice for the SAMPLE station — fixed roster, never random. */
const CHIP =
  "rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] text-ink-2";

/** The three stations on the pedestal, seated in reading order. */
const STATIONS: StagePlate[] = [
  {
    id: "blueprint",
    label: "BLUEPRINT",
    node: (
      <div className="flex h-14 flex-col justify-center gap-1 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-2">
        <span>PLAN 04 &middot; SCALE 1:8</span>
        <span>GRID 12 &times; 12 &middot; REV C</span>
      </div>
    ),
  },
  {
    id: "sample",
    label: "SAMPLE",
    node: (
      <div className="flex h-14 flex-wrap content-center items-center gap-1">
        <span className={CHIP}>ALLOY</span>
        <span className={CHIP}>RESIN</span>
        <span className={CHIP}>GLASS</span>
      </div>
    ),
  },
  {
    id: "verdict",
    label: "VERDICT",
    node: (
      <div className="flex h-14 items-center justify-center">
        <span className="inline-block -rotate-3 rounded-[4px] border border-[var(--accent)] px-2 py-1 font-mono text-[10px] tracking-[0.2em] text-[var(--accent)]">
          PASSED &middot; 82
        </span>
      </div>
    ),
  },
];

export function OrbitStageDemo() {
  const [frontId, setFrontId] = React.useState("blueprint");
  const front = STATIONS.find((station) => station.id === frontId);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <p className="self-start text-label text-ink-3">
        SPECIMEN CAROUSEL{" "}
        <span className="text-ink-2 tabular-nums">&middot; 03 STATIONS</span>
      </p>

      {/* The bezel: pedestal room with the serial riveted top-right. */}
      <div className="relative w-full overflow-hidden rounded-4 border border-hairline bg-surface-1 px-2 pt-7 pb-4">
        <span className="pointer-events-none absolute top-2.5 right-3 font-mono text-[10px] tracking-[0.16em] text-ink-3">
          KQ-082
        </span>
        <OrbitStage
          plates={STATIONS}
          defaultStation="blueprint"
          onStationChange={setFrontId}
          radius={96}
          aria-label="Specimen carousel"
        />
      </div>

      <p
        role="status"
        className="w-full border-t border-border pt-3 text-center text-label text-ink-3"
      >
        AT FRONT &middot;{" "}
        <span className="text-[var(--accent)]">
          {front?.label ?? "BLUEPRINT"}
        </span>
      </p>

      <p className="text-center text-label text-ink-3">
        Drag around the pedestal - stations settle at the front.
      </p>
    </div>
  );
}
