"use client";

import * as React from "react";

import { ZipperSeam } from "@/registry/ui/zipper-seam";

/** Fixed pouch manifest — parts and counts never vary. */
const KIT = [
  { part: "CALIPERS", count: 1 },
  { part: "LENS CLOTH", count: 2 },
  { part: "SPARE SEALS", count: 4 },
] as const;

const pad2 = (v: number): string => String(v).padStart(2, "0");

/**
 * ZipperSeam dressed as the KQ-158 specimen pouch: draw the pull down and the
 * woven halves part in a V over the kit card. The status pill mirrors each
 * settle — sealed, ajar by percent, or open.
 */
export function ZipperSeamDemo() {
  // KQ-158 ships sealed; onProgressChange reports settles only, never pixels.
  const [progress, setProgress] = React.useState(0);
  const status =
    progress >= 100
      ? "OPEN"
      : progress <= 0
        ? "SEALED"
        : `AJAR ${pad2(progress)}%`;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="rounded-4 border border-hairline bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Specimen Pouch</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-158</span>
        </div>

        <ZipperSeam
          height={250}
          onProgressChange={setProgress}
          aria-label="Pouch zipper pull"
        >
          {/* The card in the seam — top-anchored so it surfaces in the V mouth. */}
          <div className="flex h-full flex-col items-center gap-1 pt-4">
            <span className="mb-1 rounded-full border border-hairline bg-cobalt-wash px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-cobalt-bright tabular-nums">
              KIT-58
            </span>
            {KIT.map((item) => (
              <span
                key={item.part}
                className="flex items-center gap-1.5 rounded-1 border border-hairline bg-surface-1 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.08em] text-ink-2 tabular-nums"
              >
                {item.part}
                <span className="text-cobalt-bright">&times;{item.count}</span>
              </span>
            ))}
          </div>
        </ZipperSeam>

        {/* Pouch readout — a passive mirror of the seam, not a control. */}
        <p role="status" className="mt-3 flex items-center justify-center">
          <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-2 tabular-nums">
            POUCH &middot; {status}
          </span>
        </p>

        <p className="mt-3 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-158 &middot; Zipper Seam &middot; V 52% &middot; 14 teeth/side
          &middot; &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Draw the pull - the seam parts in a V above it.
      </p>
    </div>
  );
}
