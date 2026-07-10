"use client";

import * as React from "react";

import { type AtlasRegion, ZoomAtlas } from "@/registry/ui/zoom-atlas";

/** Nine catalogued sectors, laid on a 3x3 grid. */
const SECTORS: AtlasRegion[] = [
  { id: "lyra", label: "LYRA", detail: "3 catalogued bodies" },
  { id: "vela", label: "VELA", detail: "5 catalogued bodies" },
  { id: "pictor", label: "PICTOR", detail: "2 catalogued bodies" },
  { id: "draco", label: "DRACO", detail: "7 catalogued bodies" },
  { id: "hydra", label: "HYDRA", detail: "4 catalogued bodies" },
  { id: "orion", label: "ORION", detail: "9 catalogued bodies" },
  { id: "carina", label: "CARINA", detail: "6 catalogued bodies" },
  { id: "cygnus", label: "CYGNUS", detail: "1 catalogued body" },
  { id: "phoenix", label: "PHOENIX", detail: "3 catalogued bodies" },
];

/**
 * ZoomAtlas dressed as a star atlas: nine sectors on a 3x3 grid under the
 * KQ-085 bezel. The status line mirrors onZoom, resolving the focused id
 * back to its sector label (null reads as OVERVIEW).
 */
export function ZoomAtlasDemo() {
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const focused =
    focusedId !== null ? (SECTORS.find((s) => s.id === focusedId) ?? null) : null;

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span aria-hidden className="border-hairline absolute top-2 left-2 size-2 border-t border-l" />
        <span aria-hidden className="border-hairline absolute top-2 right-2 size-2 border-t border-r" />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">STAR ATLAS &middot; 09 SECTORS</p>
          <p className="text-label text-ink-3">KQ-085</p>
        </div>
        <ZoomAtlas
          regions={SECTORS}
          columns={3}
          height={300}
          onZoom={setFocusedId}
          aria-label="Star atlas"
        />
        <p role="status" className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          VIEWING &middot; <span className="text-cobalt-bright">{focused ? focused.label : "OVERVIEW"}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">Click a sector to fly in - the crumb flies you back out.</p>
      </div>
    </div>
  );
}
