"use client";

import { HeightField } from "@/registry/ui/height-field";

export function HeightFieldDemo() {
  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">TERRAFORM BENCH · 05 LEVELS</p>
          <p className="text-label text-ink-3">KQ-095</p>
        </div>

        <HeightField height={220} aria-label="Terraform bench height field" />

        <p className="border-hairline text-ink-3 mt-3 border-t pt-3 text-center text-xs">
          Drag to raise the ground - the survey lines redraw as it settles.
        </p>
      </div>
    </div>
  );
}
