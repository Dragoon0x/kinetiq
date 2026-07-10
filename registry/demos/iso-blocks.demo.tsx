"use client";

import * as React from "react";

import { IsoBlocks, type IsoBlock } from "@/registry/ui/iso-blocks";

const DISTRICT: IsoBlock[] = [
  { id: "b1", label: "INTAKE HALL", storeys: 1 },
  { id: "b2", label: "PRESS WORKS", storeys: 2 },
  { id: "b3", label: "SPRING VAULT", storeys: 3 },
  { id: "b4", label: "LENS LOFT", storeys: 2 },
  { id: "b5", label: "SIGNAL MAST", storeys: 3 },
  { id: "b6", label: "SEAL STORES", storeys: 1 },
  { id: "b7", label: "RAIL SHED", storeys: 1 },
  { id: "b8", label: "ARCHIVE", storeys: 2 },
  { id: "b9", label: "GATEHOUSE", storeys: 1 },
];

export function IsoBlocksDemo() {
  const [inspected, setInspected] = React.useState<string | null>(null);
  const block = DISTRICT.find((b) => b.id === inspected);

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
          <p className="text-label text-ink-3">WORKS DISTRICT · 09 BLOCKS</p>
          <p className="text-label text-ink-3">KQ-122</p>
        </div>

        <IsoBlocks
          blocks={DISTRICT}
          cell={58}
          aria-label="Works district"
          onInspect={setInspected}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          INSPECTING ·{" "}
          <span className="text-cobalt-bright">
            {block ? `${block.label} (${block.storeys ?? 1}F)` : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep the district - a block rises to meet you; click to inspect.
        </p>
      </div>
    </div>
  );
}
