"use client";

import * as React from "react";

import { TransitWindow } from "@/registry/ui/transit-window";

const MARKER_TOTAL = 4;

export function TransitWindowDemo() {
  const [marker, setMarker] = React.useState(0);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      {/* Bezel — the service plate around the window, stamped with its serial. */}
      <div className="rounded-4 border border-hairline bg-surface-1 p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-label text-ink-3">NIGHT SERVICE</p>
          <p className="font-mono text-[10px] tracking-wide text-ink-3">
            KQ-127
          </p>
        </div>
        <TransitWindow
          height={240}
          onMilestone={setMarker}
          aria-label="Night service transit window"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 text-center text-label text-ink-3"
      >
        MARKER &middot;{" "}
        <span className="text-ink-2 tabular-nums">
          {String(marker).padStart(2, "0")}/
          {String(MARKER_TOTAL).padStart(2, "0")}
        </span>
      </p>

      <p className="text-center text-label text-ink-3">
        Scroll the journey - the near fence outruns the far hills.
      </p>
    </div>
  );
}
