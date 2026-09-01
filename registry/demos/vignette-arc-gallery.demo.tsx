"use client";

import { VignetteArcGallery } from "@/registry/ui/vignette-arc-gallery";

export function VignetteArcGalleryDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <VignetteArcGallery arc="over" />
      <VignetteArcGallery arc="under" />
    </div>
  );
}
