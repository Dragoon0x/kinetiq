"use client";

import * as React from "react";

import { CropFrame, type CropRect } from "@/registry/ui/crop-frame";

/** A procedural landscape: low sun, hard horizon, one ridge. No assets. */
const LANDSCAPE = (
  <span className="relative block size-full">
    <span
      className="absolute inset-0"
      style={{
        backgroundImage: [
          "radial-gradient(34% 42% at 76% 26%, oklch(0.95 0.11 86), transparent 70%)",
          "linear-gradient(to bottom, oklch(0.66 0.1 254) 0%, oklch(0.86 0.07 64) 54%, oklch(0.48 0.08 158) 54.3%, oklch(0.3 0.06 164) 100%)",
        ].join(", "),
      }}
    />
    <span
      className="absolute inset-0"
      style={{
        background: "oklch(0.36 0.07 232)",
        clipPath:
          "polygon(0 62%, 16% 44%, 31% 57%, 48% 36%, 66% 55%, 82% 41%, 100% 58%, 100% 100%, 0 100%)",
      }}
    />
  </span>
);

export function CropFrameDemo() {
  const [rect, setRect] = React.useState<CropRect>({
    x: 180,
    y: 120,
    w: 720,
    h: 540,
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">
          Gaugeworks · cover crop
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          Locked 4:3
        </span>
      </div>

      <CropFrame
        image={{ width: 1200, height: 800, art: LANDSCAPE }}
        aspect={4 / 3}
        value={rect}
        onValueChange={setRect}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Crop{" "}
        <span className="text-signal">
          {rect.w}×{rect.h}
        </span>{" "}
        at {rect.x}, {rect.y}
      </p>
    </div>
  );
}
