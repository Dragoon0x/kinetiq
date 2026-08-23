"use client";

import { HeroGalleryWall } from "@/registry/blocks/hero-gallery-wall/hero-gallery-wall";

/** The section at its own scale — full width, default narrative. */
export function HeroGalleryWallDemo() {
  return (
    <div className="w-full">
      <HeroGalleryWall />
    </div>
  );
}
