"use client";

import * as React from "react";

import { KineticGallery } from "@/registry/ui/kinetic-gallery";
import { cn } from "@/registry/lib/utils";

/** Fixed specimen palette — indexed by frame, never random. */
const FRAMES = [
  { title: "Ceramic Vane", accent: "oklch(0.84 0.16 162)" },
  { title: "Copper Coil", accent: "oklch(0.78 0.15 52)" },
  { title: "Cobalt Lattice", accent: "oklch(0.72 0.15 258)" },
  { title: "Magenta Rotor", accent: "oklch(0.74 0.19 350)" },
  { title: "Amber Bearing", accent: "oklch(0.83 0.16 86)" },
  { title: "Jade Manifold", accent: "oklch(0.80 0.14 178)" },
] as const;

export function KineticGalleryDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <p className="text-label text-ink-3">
        Specimen Rail{" "}
        <span className="text-ink-2 tabular-nums">
          &middot; {String(FRAMES.length).padStart(2, "0")} frames
        </span>
      </p>

      <KineticGallery aria-label="Specimen frames" gap={16}>
        {FRAMES.map((frame, i) => (
          <Plate key={frame.title} frame={frame} serial={i + 1} />
        ))}
      </KineticGallery>

      <p className="text-ink-3 text-center font-mono text-xs">
        Grab and fling &middot; snaps to the nearest frame
      </p>
    </div>
  );
}

type Frame = (typeof FRAMES)[number];

function Plate({ frame, serial }: { frame: Frame; serial: number }) {
  const tag = String(serial).padStart(2, "0");
  return (
    <article
      className={cn(
        "border-hairline bg-surface-2 relative flex h-40 w-56 flex-col justify-between overflow-hidden rounded-3 border p-4",
      )}
    >
      {/* Accent wash + chip — deterministic per frame, no randomness. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background: `radial-gradient(120% 90% at 85% 0%, ${frame.accent}, transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute top-4 right-4 size-8 rounded-full"
        style={{ background: frame.accent }}
      />

      <p className="text-label text-ink-3 relative tabular-nums">Frame {tag}</p>

      <div className="relative">
        <div
          aria-hidden
          className="mb-2 h-0.5 w-8 rounded-full"
          style={{ background: frame.accent }}
        />
        <h3 className="text-foreground text-base font-medium">{frame.title}</h3>
        <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-wide">
          SPEC &middot; {tag}0-K
        </p>
      </div>
    </article>
  );
}
