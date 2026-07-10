"use client";

import * as React from "react";

import { HatchBoard, type Hatch } from "@/registry/ui/hatch-board";

/** Fixed supply manifest — codes, parts, and counts never vary. */
const SUPPLIES = [
  { code: "H-01", label: "Spring coils", part: "SPRING COILS", count: "12" },
  { code: "H-02", label: "Lens caps", part: "LENS CAPS", count: "04" },
  { code: "H-03", label: "Seal rings", part: "SEAL RINGS", count: "22" },
  { code: "H-04", label: "Damper pads", part: "DAMPER PADS", count: "08" },
  { code: "H-05", label: "Mast pins", part: "MAST PINS", count: "16" },
  { code: "H-06", label: "Vent mesh", part: "VENT MESH", count: "02" },
] as const;

type Supply = (typeof SUPPLIES)[number];

/** All six hatches, built once: mono-code lids over part-and-count wells. */
const HATCHES: Hatch[] = SUPPLIES.map((supply) => ({
  id: supply.code.toLowerCase(),
  label: supply.label,
  lid: <LidFace supply={supply} />,
  well: <WellFace supply={supply} />,
}));

/**
 * HatchBoard dressed as the KQ-152 supply locker: six spring-loaded hatches
 * over their stock, with a status line mirroring how many stand open.
 */
export function HatchBoardDemo() {
  // KQ-152 wakes fully latched; the readout mirrors every pop and latch.
  const [openIds, setOpenIds] = React.useState<string[]>([]);

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <p className="flex items-baseline justify-between text-label text-ink-3">
        <span>Supply Hatches</span>
        <span className="font-mono text-[10px] tracking-[0.14em] tabular-nums">
          KQ-152
        </span>
      </p>

      {/* Bezel — comfortable padding so open lids can lean back unclipped. */}
      <div className="rounded-4 border border-hairline bg-surface-1 p-4 sm:p-5">
        <HatchBoard
          hatches={HATCHES}
          columns={3}
          onOpenChange={setOpenIds}
          aria-label="Supply hatches"
        />

        {/* Stock readout — a passive mirror of the board, not a control. */}
        <p role="status" className="mt-4 flex items-center justify-center">
          <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-2 tabular-nums">
            OPEN &middot; {openIds.length}/{SUPPLIES.length}
          </span>
        </p>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-152 &middot; Hatch Board &middot; 6 hatches &middot; P 800 &middot;
          &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Pop a hatch - each lid rides its own spring.
      </p>
    </div>
  );
}

/** Closed-lid face: the mono hatch code, centered on the plate. */
function LidFace({ supply }: { supply: Supply }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.12em] text-ink-2 tabular-nums">
      {supply.code}
    </span>
  );
}

/** Well contents: the part name over its count chip. */
function WellFace({ supply }: { supply: Supply }) {
  return (
    <span className="flex flex-col items-center gap-1.5 text-center">
      <span className="font-mono text-[9px] leading-tight tracking-[0.14em] text-ink-2">
        {supply.part}
      </span>
      <span className="rounded-full border border-hairline bg-cobalt-wash px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-cobalt-bright tabular-nums">
        &times;{supply.count}
      </span>
    </span>
  );
}
