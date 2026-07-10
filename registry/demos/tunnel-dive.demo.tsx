"use client";

import * as React from "react";

import { TunnelDive, type TunnelFrame } from "@/registry/ui/tunnel-dive";

/** Fixed descent manifest — ordered by depth, never random. */
const GATES = [
  { id: "surface", label: "SURFACE", note: "GATE OPEN · DAYLIGHT FADES" },
  { id: "gallery-1", label: "GALLERY 1", note: "PRESSURE NOMINAL · -40M" },
  { id: "gallery-2", label: "GALLERY 2", note: "STRATA SHIFT · -120M" },
  { id: "vault", label: "VAULT", note: "SEALS HOLDING · -300M" },
  { id: "core", label: "CORE", note: "FLOOR CONTACT · -451M" },
] as const;

const TOTAL = String(GATES.length).padStart(2, "0");

const FRAMES: TunnelFrame[] = GATES.map((gate) => ({
  id: gate.id,
  label: gate.label,
  node: (
    <span className="text-ink-3 font-mono text-[10px] tracking-widest">
      {gate.note}
    </span>
  ),
}));

export function TunnelDiveDemo() {
  const [passed, setPassed] = React.useState(0);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <p className="text-label text-ink-3">
        DESCENT LOG{" "}
        <span className="text-ink-2 tabular-nums">
          &middot; {TOTAL} GATES
        </span>
      </p>

      {/* Bezel — the instrument plate carrying the serial. */}
      <div className="border-hairline bg-surface-1 w-full rounded-4 border p-2">
        <TunnelDive
          frames={FRAMES}
          height={260}
          onFramePass={(index) => setPassed(index + 1)}
          aria-label="Descent log"
        />
        <div className="text-ink-3 flex items-center justify-between px-1.5 pt-2 pb-0.5 font-mono text-[9px] tracking-widest">
          <span>DIVE STAGE</span>
          <span>KQ-083</span>
        </div>
      </div>

      <p
        role="status"
        className="border-border text-label text-ink-3 w-full border-t pt-3 text-center"
      >
        PASSED &middot;{" "}
        <span className="text-ink-2 tabular-nums">
          {String(passed).padStart(2, "0")}/{TOTAL}
        </span>
      </p>

      <p className="text-label text-ink-3 text-center">
        Scroll to dive - each gate blows past the camera.
      </p>
    </div>
  );
}
