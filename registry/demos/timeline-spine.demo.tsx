"use client";

import * as React from "react";

import { TimelineSpine, type TimelineEvent } from "@/registry/ui/timeline-spine";

const LOG: TimelineEvent[] = [
  {
    title: "Spec frozen",
    marker: "T−041",
    detail: "Motion language locked to the ζ reference set. No API changes past this line.",
  },
  {
    title: "Calibration pass",
    marker: "T−027",
    detail: "All five springs re-measured on the bench; flick lands two under budget.",
  },
  {
    title: "Beta cut",
    marker: "T−014",
    detail: "First external build. Reduced-motion fallbacks audited across the set.",
  },
  {
    title: "Release candidate",
    marker: "T−005",
    detail: "Feature freeze. Only regressions get patched from here to launch.",
  },
  {
    title: "General availability",
    marker: "T−000",
    detail: "Shipped to the registry. Tag cut, changelog sealed.",
  },
  {
    title: "Post-launch review",
    marker: "T+009",
    detail: "Field telemetry folded back into the next calibration window.",
  },
];

export function TimelineSpineDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="border-hairline bg-surface-1 h-[360px] w-full overflow-y-auto rounded-3 border p-5">
        <p className="text-label text-ink-3">TIMELINE · LOG</p>
        <h3 className="mt-1 mb-6 text-base font-semibold text-ink">
          Release track
        </h3>
        <TimelineSpine events={LOG} aria-label="Release changelog" />
        {/* Trailing room so the last event can clear the viewport center. */}
        <div className="h-24" aria-hidden />
      </div>
      <p className="text-label text-center text-ink-3">
        Scroll the panel — the spine fills as it plays
      </p>
    </div>
  );
}
