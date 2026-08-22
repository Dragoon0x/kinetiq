"use client";

import { EmptyFirstLight } from "@/registry/blocks/empty-first-light/empty-first-light";

/** The section at its own scale — full width, default narrative. */
export function EmptyFirstLightDemo() {
  return (
    <div className="w-full">
      <EmptyFirstLight />
    </div>
  );
}
