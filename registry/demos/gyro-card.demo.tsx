"use client";

import * as React from "react";

import { GyroCard, GyroLayer } from "@/registry/ui/gyro-card";
import { PressureButton } from "@/registry/ui/pressure-button";

export function GyroCardDemo() {
  const [added, setAdded] = React.useState(false);

  return (
    <GyroCard className="h-[340px] w-[300px]">
      {/* Far: watermark drifts the most. */}
      <GyroLayer
        depth={2}
        className="pointer-events-none absolute inset-x-0 top-5 flex justify-center"
      >
        <span
          aria-hidden
          className="text-foreground/5 font-mono text-7xl font-bold tracking-tighter select-none"
        >
          MK-II
        </span>
      </GyroLayer>

      {/* Mid: device illustration. */}
      <GyroLayer
        depth={1}
        className="pointer-events-none absolute inset-x-0 top-12 flex justify-center"
      >
        <svg
          aria-hidden
          viewBox="0 0 120 90"
          className="text-muted-foreground h-28 w-37"
        >
          <rect
            x={8}
            y={10}
            width={104}
            height={70}
            rx={10}
            fill="var(--muted)"
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <circle
            cx={42}
            cy={45}
            r={17}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <line
            x1={42}
            y1={45}
            x2={52}
            y2={35}
            stroke="var(--signal, var(--primary))"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <rect x={72} y={32} width={28} height={6} rx={2} fill="currentColor" opacity={0.4} />
          <rect x={72} y={44} width={28} height={6} rx={2} fill="currentColor" opacity={0.25} />
          <rect x={72} y={56} width={20} height={6} rx={2} fill="currentColor" opacity={0.15} />
        </svg>
      </GyroLayer>

      {/* Foreground: pinned product copy and a real focusable button. */}
      <GyroLayer
        depth={0}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 p-5"
      >
        <h3 className="text-base font-semibold">Field Kit MK-II</h3>
        <div className="flex gap-1.5">
          <span className="border-border bg-background/60 text-muted-foreground rounded-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase">
            Cal. set included
          </span>
          <span className="border-border bg-background/60 text-muted-foreground rounded-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase">
            IP54
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-mono tabular-nums">$0</span> —
          open source
        </p>
        <PressureButton size="sm" onClick={() => setAdded(true)}>
          {added ? "On bench" : "Add to bench"}
        </PressureButton>
      </GyroLayer>
    </GyroCard>
  );
}
