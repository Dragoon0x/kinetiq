"use client";

import * as React from "react";

import { ZoomGallery, type ZoomGalleryImage } from "@/registry/ui/zoom-gallery";

/**
 * Procedural views: a wash, a machined grid fine enough to be worth
 * magnifying, and one silhouette per angle. No assets.
 */
const plate = (
  wash: string,
  floor: string,
  ink: string,
  shape: string,
): React.ReactNode => (
  <span
    className="block size-full"
    style={{ backgroundImage: `linear-gradient(155deg, ${wash}, ${floor})` }}
  >
    <svg
      viewBox="0 0 120 90"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="size-full"
    >
      <g stroke={ink} strokeWidth="0.3" opacity="0.3">
        {[15, 30, 45, 60, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="120" y2={y} />
        ))}
        {[20, 40, 60, 80, 100].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="90" />
        ))}
      </g>
      <path
        d={shape}
        fill="none"
        stroke={ink}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const IMAGES: ZoomGalleryImage[] = [
  {
    id: "front",
    alt: "Waylight lamp, front",
    art: plate(
      "oklch(0.86 0.09 82)",
      "oklch(0.52 0.12 48)",
      "oklch(0.24 0.04 60)",
      "M60 70V38M44 30h32l-6 10H50zM48 74h24",
    ),
  },
  {
    id: "angle",
    alt: "Waylight lamp, three quarter",
    art: plate(
      "oklch(0.82 0.07 232)",
      "oklch(0.42 0.08 246)",
      "oklch(0.2 0.03 246)",
      "M42 72 66 34M54 30h30l-10 12H50zM32 74h26",
    ),
  },
  {
    id: "joint",
    alt: "Waylight lamp, arm joint",
    art: plate(
      "oklch(0.84 0.1 162)",
      "oklch(0.4 0.09 170)",
      "oklch(0.18 0.03 170)",
      "M60 29a16 16 0 1 1 0 32 16 16 0 1 1 0-32M24 45h20M76 45h20M56 45h8",
    ),
  },
  {
    id: "base",
    alt: "Waylight lamp, base underside",
    art: plate(
      "oklch(0.8 0.09 300)",
      "oklch(0.36 0.1 302)",
      "oklch(0.18 0.04 302)",
      "M60 19a26 26 0 1 1 0 52 26 26 0 1 1 0-52M60 19v52M34 45h52",
    ),
  },
];

export function ZoomGalleryDemo() {
  const [view, setView] = React.useState("front");
  const [zoomed, setZoomed] = React.useState(false);
  const active = IMAGES.find((image) => image.id === view);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 p-3">
        <ZoomGallery
          images={IMAGES}
          value={view}
          onValueChange={setView}
          onZoomChange={setZoomed}
          aria-label="Waylight lamp views"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{active?.alt ?? "No view"}</span> ·{" "}
        {zoomed ? "zoom 2x" : "zoom off"}
      </p>
    </div>
  );
}
