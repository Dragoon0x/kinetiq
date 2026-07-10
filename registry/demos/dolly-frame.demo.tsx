"use client";

import * as React from "react";

import { DollyFrame } from "@/registry/ui/dolly-frame";

export function DollyFrameDemo() {
  const [push, setPush] = React.useState(0);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      {/* Bezel strip — shot title and serial */}
      <div className="flex items-baseline justify-between">
        <p className="text-label text-ink-3">CORRIDOR SHOT</p>
        <p className="text-ink-3 font-mono text-[10px] tracking-wide">
          KQ-081
        </p>
      </div>

      <DollyFrame
        aria-label="Corridor dolly shot"
        height={260}
        onDolly={setPush}
        subject={<SubjectPlate />}
      />

      <p
        role="status"
        className="border-border text-label text-ink-3 border-t pt-3 text-center"
      >
        PUSH &middot;{" "}
        <span className="text-ink-2 tabular-nums">
          {String(Math.round(push * 100)).padStart(2, "0")}%
        </span>
      </p>

      <p className="text-label text-ink-3 text-center">
        Scroll the shot - the corridor rushes while the subject holds.
      </p>
    </div>
  );
}

/** The held plate — a badge that keeps its size while the corridor stretches. */
function SubjectPlate() {
  return (
    <div
      className="rounded-3 w-44 border p-3"
      style={{
        background: "oklch(0.22 0.02 262 / 0.94)",
        borderColor: "oklch(0.68 0.03 262 / 0.45)",
        boxShadow: "0 14px 36px oklch(0.06 0.02 262 / 0.55)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[10px] tracking-wide"
          style={{ color: "oklch(0.9 0.015 262)" }}
        >
          SUBJECT &middot; K-081
        </span>
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{
            background: "var(--accent-bright)",
            boxShadow: "0 0 8px var(--accent-wash)",
          }}
        />
      </div>
      <p
        className="mt-2 text-xs leading-snug"
        style={{ color: "oklch(0.95 0.01 262)" }}
      >
        Held plate, locked to center.
      </p>
      <p
        className="mt-1 font-mono text-[10px] tracking-wide"
        style={{ color: "oklch(0.72 0.02 262)" }}
      >
        SIZE HOLD &middot; 1:1
      </p>
    </div>
  );
}
