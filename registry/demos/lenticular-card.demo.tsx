"use client";

import * as React from "react";

import { LenticularCard } from "@/registry/ui/lenticular-card";

/** Face A — the operator badge on duty. */
function ActiveFace() {
  return (
    <div className="bg-surface-2 flex h-full flex-col justify-between p-4">
      <div className="flex items-start justify-between">
        <span className="text-label text-ink-3">OPERATOR</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-signal size-1.5 rounded-full" />
          <span className="text-label text-signal">ACTIVE</span>
        </span>
      </div>
      <div>
        <div aria-hidden className="bg-hairline-strong mb-2 h-0.5 w-8 rounded-full" />
        <p className="text-ink font-mono text-2xl">OP-9</p>
        <p className="text-ink-3 mt-1 font-mono text-[10px] tracking-wide">
          BAY 4 &middot; ROTATION A
        </p>
      </div>
    </div>
  );
}

/** Face B — the same badge off-shift, palette dimmed to night watch. */
function OffShiftFace() {
  return (
    <div
      className="flex h-full flex-col justify-between p-4"
      style={{ background: "oklch(0.18 0.02 258)" }}
    >
      <div className="flex items-start justify-between">
        <span className="text-label" style={{ color: "oklch(0.48 0.02 258)" }}>
          OPERATOR
        </span>
        <span
          className="flex items-center gap-1.5"
          style={{ color: "oklch(0.62 0.05 258)" }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-3"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
          <span className="text-label">OFF-SHIFT</span>
        </span>
      </div>
      <div>
        <div
          aria-hidden
          className="mb-2 h-0.5 w-8 rounded-full"
          style={{ background: "oklch(0.32 0.02 258)" }}
        />
        <p className="font-mono text-2xl" style={{ color: "oklch(0.6 0.02 258)" }}>
          OP-9
        </p>
        <p
          className="mt-1 font-mono text-[10px] tracking-wide"
          style={{ color: "oklch(0.45 0.02 258)" }}
        >
          BAY 4 &middot; ROTATION A
        </p>
      </div>
    </div>
  );
}

export function LenticularCardDemo() {
  const [reading, setReading] = React.useState("ACTIVE");

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
          <p className="text-label text-ink-3">BADGE OF TWO STATES &middot; 14 RIDGES</p>
          <p className="text-label text-ink-3">KQ-100</p>
        </div>

        <LenticularCard
          a={<ActiveFace />}
          b={<OffShiftFace />}
          ridges={14}
          height={210}
          aria-label="Operator badge, active and off-shift"
          onDominantChange={(side) =>
            setReading(side === "a" ? "ACTIVE" : "OFF-SHIFT")
          }
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          READING &middot; <span className="text-cobalt-bright">{reading}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep across the card - each ridge flips on its own.
        </p>
      </div>
    </div>
  );
}
