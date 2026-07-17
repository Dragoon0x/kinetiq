"use client";

import { CursorLens } from "@/registry/ui/cursor-lens";

export function CursorLensDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CursorLens zoom={2.4} size={132} className="rounded-3">
        <div className="border-hairline bg-surface-1 rounded-3 border p-5">
          <p className="text-label text-ink-3">SPECIMEN SHEET</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            Bore 4.6 mm
          </p>
          <p className="text-ink-2 mt-1 font-mono text-[11px] leading-relaxed">
            tol +/- 0.1 mm · 48 kHz · pass 2 · cobalt housing · brass collar ·
            oxide seal · nine tonnes · hold inside a tenth across the run
          </p>
          <div className="mt-3 grid grid-cols-6 gap-1">
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className="bg-surface-2 border-hairline h-4 rounded-1 border"
              />
            ))}
          </div>
        </div>
      </CursorLens>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Move the pointer{" "}
        <span className="text-[var(--signal,var(--primary))]">
          over the sheet
        </span>
      </p>
    </div>
  );
}
