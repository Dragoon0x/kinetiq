"use client";

import { EmptyNeedsAccess } from "@/registry/blocks/empty-needs-access/empty-needs-access";

/** The section at its own scale — full width, default narrative. */
export function EmptyNeedsAccessDemo() {
  return (
    <div className="w-full">
      <EmptyNeedsAccess />
    </div>
  );
}
