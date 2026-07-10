"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { LiftTray, type TrayItem } from "@/registry/ui/lift-tray";

/** CALIPER — a ruled baseline with survey ticks. */
function CaliperGlyph() {
  return (
    <span className="border-ink-2 flex h-5 items-end gap-1 border-b-2 px-0.5 pb-0.5">
      <span className="bg-ink-2 h-3 w-px" />
      <span className="bg-ink-2 h-1.5 w-px" />
      <span className="bg-ink-2 h-3 w-px" />
      <span className="bg-ink-2 h-1.5 w-px" />
      <span className="bg-ink-2 h-3 w-px" />
    </span>
  );
}

/** LENS — a ring with a washed element seated in the bore. */
function LensGlyph() {
  return (
    <span className="border-ink-2 flex size-6 items-center justify-center rounded-full border-2">
      <span className="border-ink-3 bg-cobalt-wash size-2.5 rounded-full border" />
    </span>
  );
}

/** SEAL — a solid disc with an embossed collar. */
function SealGlyph() {
  return (
    <span className="bg-ink-2 flex size-6 items-center justify-center rounded-full">
      <span className="border-surface-0 size-3 rounded-full border-2" />
    </span>
  );
}

/** KEY — bow, shaft, two teeth. */
function KeyGlyph() {
  return (
    <span className="flex items-center pb-1.5">
      <span className="border-ink-2 size-3.5 shrink-0 rounded-full border-2" />
      <span className="bg-ink-2 relative -ml-px h-[3px] w-4">
        <span className="bg-ink-2 absolute top-full right-0 h-1.5 w-[2px]" />
        <span className="bg-ink-2 absolute top-full right-[5px] h-1 w-[2px]" />
      </span>
    </span>
  );
}

/** The KQ-123 tray inventory — four bench tools, fixed order, never varies. */
const TOOLS: TrayItem[] = [
  { id: "caliper", label: "CALIPER", node: <CaliperGlyph /> },
  { id: "lens", label: "LENS", node: <LensGlyph /> },
  { id: "seal", label: "SEAL", node: <SealGlyph /> },
  { id: "key", label: "KEY", node: <KeyGlyph /> },
];

/**
 * LiftTray dressed as the KQ-123 instrument tray: four bench tools on a
 * recessed plate inside a bezel with corner registration ticks. Reach over
 * the row and each tool floats up on its glide chase while its ground shadow
 * shrinks and softens; the readout mirrors every pick.
 */
export function LiftTrayDemo() {
  // KQ-123 boots with nothing lifted; the readout follows picks only.
  const [picked, setPicked] = React.useState<string | null>(null);
  const current = TOOLS.find((tool) => tool.id === picked);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Instrument Tray &middot; 04 Tools
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-123</span>
        </div>

        <LiftTray items={TOOLS} aria-label="Bench tools" onPick={setPicked} />

        {/* Pick readout — mirrors onPick, one move per lift. */}
        <p role="status" className="text-label text-ink-3 mt-4 text-center">
          Lifted &middot;{" "}
          <span className="text-signal">{current?.label ?? "None"}</span>
        </p>

        <p className="border-hairline text-ink-3 mt-4 border-t pt-3 font-mono text-[10px] tracking-[0.15em] uppercase">
          KQ-123 &middot; Lift Tray &middot; 04 tools &middot; Lift 14 px
          &middot; &zeta; 0.98
        </p>
      </div>

      <p className="text-label text-ink-3 text-center">
        Reach over the tray - each tool floats up to your hand.
      </p>
    </div>
  );
}
