"use client";

import { VoronoiShatter } from "@/registry/ui/voronoi-shatter";

/**
 * VoronoiShatter dressed as a bench specimen: a bezel plate with a mono spec
 * header and a caption floated below. Tap anywhere on the surface and the
 * shards nearest the point fracture outward, then ring back and reseal whole.
 */
export function VoronoiShatterDemo() {
  return (
    <div className="border-border bg-card w-full max-w-md rounded-4 border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-label text-ink-3">Fracture plate · Tap to shatter</span>
        <span
          aria-hidden
          className="text-ink-3 font-mono text-[10px] tracking-wider tabular-nums"
        >
          30 cells
        </span>
      </div>
      <div className="p-3">
        <VoronoiShatter
          cells={30}
          height={280}
          aria-label="Voronoi fracture plate"
        />
      </div>
      <div className="border-border flex items-center justify-between border-t px-4 py-2">
        <span className="text-ink-3 font-mono text-[11px]">
          Tap the surface — it shatters and reseals.
        </span>
        <span className="text-ink-3 font-mono text-[10px] tracking-wider uppercase">
          ζ 0.53
        </span>
      </div>
    </div>
  );
}
