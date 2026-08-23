"use client";

import { EmptyClearedDesk } from "@/registry/blocks/empty-cleared-desk/empty-cleared-desk";

/** The section at its own scale — full width, default narrative. */
export function EmptyClearedDeskDemo() {
  return (
    <div className="w-full">
      <EmptyClearedDesk />
    </div>
  );
}
