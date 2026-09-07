"use client";

import * as React from "react";

import { LightBox, type LightBoxImage } from "@/registry/ui/light-box";

/** Procedural plates: a sky wash, a hard horizon, a low sun. No assets. */
const plate = (sky: string, ground: string, sun: string): React.ReactNode => (
  <span
    className="block size-full"
    style={{
      backgroundImage: [
        `radial-gradient(42% 34% at 74% 26%, ${sun}, transparent 70%)`,
        `linear-gradient(to bottom, ${sky} 0%, ${sky} 61%, ${ground} 61.4%, ${ground} 100%)`,
      ].join(", "),
    }}
  />
);

const IMAGES: LightBoxImage[] = [
  {
    id: "basin",
    alt: "Basin fog before sunrise",
    caption: "Basinworks · 04:40",
    art: plate(
      "oklch(0.42 0.09 258)",
      "oklch(0.24 0.05 258)",
      "oklch(0.86 0.11 82)",
    ),
  },
  {
    id: "glasshouse",
    alt: "Fernworks glasshouse at noon",
    caption: "Fernworks · 12:05",
    art: plate(
      "oklch(0.78 0.11 168)",
      "oklch(0.44 0.09 160)",
      "oklch(0.95 0.06 120)",
    ),
  },
  {
    id: "slipway",
    alt: "Coldbrook slipway under rain",
    caption: "Coldbrook · 16:20",
    art: plate(
      "oklch(0.62 0.04 232)",
      "oklch(0.32 0.03 232)",
      "oklch(0.82 0.03 232)",
    ),
  },
  {
    id: "mast",
    alt: "Waylight mast at dusk",
    caption: "Waylight · 21:15",
    art: plate(
      "oklch(0.46 0.14 300)",
      "oklch(0.22 0.06 300)",
      "oklch(0.78 0.16 40)",
    ),
  },
];

export function LightBoxDemo() {
  const [open, setOpen] = React.useState<string | null>(null);
  const current = IMAGES.find((image) => image.id === open);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1 p-3">
        <LightBox images={IMAGES} open={open} onOpenChange={setOpen} />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {current ? (
          <>
            Viewing <span className="text-signal">{current.alt}</span>
          </>
        ) : (
          "Four plates · pick one to open"
        )}
      </p>
    </div>
  );
}
