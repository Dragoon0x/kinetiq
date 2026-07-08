"use client";

import * as React from "react";

import {
  Binary,
  CircleDot,
  Compass,
  Gauge,
  Magnet,
  Orbit,
  Rows3,
  Ruler,
} from "lucide-react";

import { Zoetrope } from "@/registry/ui/zoetrope";

const SPECIMENS = [
  {
    serial: "KQ-001",
    name: "Pressure Button",
    spec: "TRAVEL 2PX · ζ 0.99",
    icon: CircleDot,
  },
  {
    serial: "KQ-004",
    name: "Caliper Slider",
    spec: "STEP 1 · SNAP ζ 0.83",
    icon: Ruler,
  },
  { serial: "KQ-007", name: "Flapboard", spec: "16 FLAPS · 80MS", icon: Rows3 },
  {
    serial: "KQ-009",
    name: "Gyro Card",
    spec: "TILT ±8° · P 800",
    icon: Compass,
  },
  { serial: "KQ-012", name: "Readout", spec: "TABULAR · 60FPS", icon: Gauge },
  { serial: "KQ-031", name: "Zoetrope", spec: "STEP 45° · R 222", icon: Orbit },
  { serial: "KQ-017", name: "Cipher Text", spec: "SCRAMBLE ×6", icon: Binary },
  { serial: "KQ-021", name: "Magnet Dock", spec: "PULL 12PX", icon: Magnet },
] as const;

export function ZoetropeDemo() {
  // KQ-031 fronts its own drum on mount.
  const [frontIndex, setFrontIndex] = React.useState(5);

  return (
    <div className="flex min-h-[400px] w-full max-w-md flex-col items-center justify-center gap-5">
      <Zoetrope
        label="Specimen catalog"
        defaultIndex={5}
        onIndexChange={setFrontIndex}
      >
        {SPECIMENS.map(({ serial, name, spec, icon: Icon }) => (
          <div
            key={serial}
            data-label={name}
            className="flex h-full w-full flex-col justify-between rounded-3 border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                {serial}
              </span>
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{name}</span>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {spec}
              </span>
            </div>
          </div>
        ))}
      </Zoetrope>
      <p className="text-xs text-muted-foreground">
        Drag · scroll · arrow keys
      </p>
      <p className="font-mono text-xs tracking-wide text-foreground uppercase tabular-nums">
        FRONT · {SPECIMENS[frontIndex]?.serial ?? "KQ-000"}
      </p>
    </div>
  );
}
