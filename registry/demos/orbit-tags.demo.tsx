"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { OrbitTags, type OrbitTag } from "@/registry/ui/orbit-tags";

/** Fixed index roster — twelve specimen families, never shuffled. */
const TAGS: OrbitTag[] = [
  { id: "springs", label: "SPRINGS" },
  { id: "dials", label: "DIALS" },
  { id: "cubes", label: "CUBES" },
  { id: "glass", label: "GLASS" },
  { id: "foil", label: "FOIL" },
  { id: "gates", label: "GATES" },
  { id: "rails", label: "RAILS" },
  { id: "lenses", label: "LENSES" },
  { id: "doors", label: "DOORS" },
  { id: "wheels", label: "WHEELS" },
  { id: "masts", label: "MASTS" },
  { id: "seals", label: "SEALS" },
];

/**
 * OrbitTags dressed as a bench instrument: a bezel plate with corner
 * registration ticks and a mono spec header, the tag sphere idling on its
 * floor shadow, and a status readout mirroring the pinned tag. Spin it, or
 * arrow through the index and pin with Enter.
 */
export function OrbitTagsDemo() {
  const [pinned, setPinned] = React.useState<string | null>(null);
  const current = TAGS.find((tag) => tag.id === pinned) ?? null;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            INDEX SPHERE &middot; {TAGS.length} TAGS
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-103</span>
        </div>

        <OrbitTags
          tags={TAGS}
          value={pinned}
          onValueChange={setPinned}
          aria-label="Index sphere"
        />

        <p
          role="status"
          className="border-border mt-3 border-t pt-3 text-center text-label text-ink-3"
        >
          PINNED &middot;{" "}
          <span
            className={
              current ? "text-[var(--accent-bright)]" : "text-ink-2"
            }
          >
            {current ? current.label : "NONE"}
          </span>
        </p>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Spin the sphere or arrow through it - Enter pins a tag.
      </p>
    </div>
  );
}
