"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { PopBook, type PopPiece } from "@/registry/ui/pop-book";

/** The KQ-121 plate inventory — ranks, slots, and faces never vary. */
const PIECES: PopPiece[] = [
  {
    id: "ridge-a",
    row: 0,
    node: (
      <span className="text-ink-3 block w-16 text-center font-mono text-[10px] tracking-[0.08em]">
        RIDGE A
      </span>
    ),
  },
  {
    id: "ridge-b",
    row: 0,
    node: (
      <span className="text-ink-3 block w-16 text-center font-mono text-[10px] tracking-[0.08em]">
        RIDGE B
      </span>
    ),
  },
  {
    id: "mast-01",
    row: 1,
    node: (
      <span className="flex w-16 flex-col items-center gap-1">
        <span aria-hidden className="bg-cobalt-bright size-1.5 rounded-full" />
        <span className="text-ink-2 font-mono text-[10px] tracking-[0.08em]">
          MAST 01
        </span>
      </span>
    ),
  },
  {
    id: "mast-02",
    row: 1,
    node: (
      <span className="flex w-16 items-center justify-center py-1">
        <span className="text-ink-2 font-mono text-[10px] tracking-[0.08em]">
          MAST 02
        </span>
      </span>
    ),
  },
  {
    id: "relay-station",
    row: 2,
    node: (
      <span className="flex w-24 flex-col items-center gap-1.5">
        <span className="text-ink font-mono text-[10px] tracking-[0.08em]">
          RELAY STATION
        </span>
        <span className="bg-cobalt-wash text-cobalt-bright rounded-1 px-1.5 font-mono text-[9px] leading-4 tracking-[0.08em]">
          LIVE
        </span>
      </span>
    ),
  },
];

/**
 * PopBook dressed as the KQ-121 field atlas: plate seven pops as you scroll —
 * the ridges stand first at the back, the masts follow, and the relay station
 * lands front and center. The status line mirrors each 5% notch of openness,
 * pinned open under reduced motion to match the spread.
 */
export function PopBookDemo() {
  const motionSafe = useMotionSafe();
  const [openness, setOpenness] = React.useState(0);
  const pct = String(Math.round((motionSafe ? openness : 1) * 100)).padStart(
    2,
    "0",
  );

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">FIELD ATLAS &middot; PLATE 7</p>
          <p className="text-label text-ink-3 tabular-nums">KQ-121</p>
        </div>

        <PopBook pieces={PIECES} height={270} onOpenChange={setOpenness} />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          SPREAD &middot;{" "}
          <span className="text-cobalt-bright tabular-nums">{pct}%</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll to open the plate - the cutouts stand up from the fold.
        </p>
      </div>
    </div>
  );
}
